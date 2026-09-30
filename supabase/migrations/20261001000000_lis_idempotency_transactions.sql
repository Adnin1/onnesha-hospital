-- =====================================================================================
-- 20261001000000_lis_idempotency_transactions.sql
-- LIS Database-Level Idempotency, Transactional Ingestion RPC & Critical Alert Vault
-- =====================================================================================

-- 1. Add payload_fingerprint column to lab_analyzer_transmissions
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'lab_analyzer_transmissions' 
          AND column_name = 'payload_fingerprint'
    ) THEN
        ALTER TABLE lab_analyzer_transmissions ADD COLUMN payload_fingerprint VARCHAR(64);
    END IF;
END $$;

-- 2. Backfill existing transmissions with a deterministic hash if null
UPDATE lab_analyzer_transmissions
SET payload_fingerprint = md5(id::text || ':' || analyzer_id::text || ':' || sample_barcode)
WHERE payload_fingerprint IS NULL;

-- 3. Enforce NOT NULL on payload_fingerprint for strict integrity
ALTER TABLE lab_analyzer_transmissions ALTER COLUMN payload_fingerprint SET NOT NULL;

-- 4. Database-level Idempotency Constraint: Exactly one transmission per analyzer payload
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'uq_lab_analyzer_transmissions_idempotency'
    ) THEN
        ALTER TABLE lab_analyzer_transmissions 
        ADD CONSTRAINT uq_lab_analyzer_transmissions_idempotency 
        UNIQUE (organization_id, analyzer_id, payload_fingerprint);
    END IF;
END $$;

-- 5. Persistent Lab Critical / Panic Value Alerts Table
CREATE TABLE IF NOT EXISTS lab_critical_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    transmission_id UUID NOT NULL REFERENCES lab_analyzer_transmissions(id) ON DELETE CASCADE,
    order_id UUID REFERENCES diagnostic_orders(id) ON DELETE SET NULL,
    sample_barcode VARCHAR(50) NOT NULL,
    analyte_code VARCHAR(50) NOT NULL,
    observed_value VARCHAR(100) NOT NULL,
    abnormal_flag VARCHAR(30) NOT NULL CHECK (abnormal_flag IN ('CRITICAL_HIGH', 'CRITICAL_LOW', 'PANIC')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_ACK' CHECK (status IN ('PENDING_ACK', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED')),
    acknowledged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    clinical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid emergency escalation queries
CREATE INDEX IF NOT EXISTS idx_lab_critical_alerts_org_status ON lab_critical_alerts(organization_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_critical_alerts_transmission ON lab_critical_alerts(transmission_id);

-- Enable Row-Level Security
ALTER TABLE lab_critical_alerts ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lab_critical_alerts' AND policyname = 'tenant_isolation_lab_critical_alerts'
  ) THEN
    CREATE POLICY tenant_isolation_lab_critical_alerts ON lab_critical_alerts
      FOR ALL
      USING (organization_id = (SELECT org_id FROM current_user_org()));
  END IF;
END $$;

-- 6. Atomic Transactional Ingestion RPC Function
-- Guarantees all-or-nothing execution: transmission insert, diagnostic_result create,
-- diagnostic_result_values upserts, critical alert logging, and order status update.
CREATE OR REPLACE FUNCTION ingest_analyzer_transmission_atomic(
    p_organization_id UUID,
    p_analyzer_id UUID,
    p_sample_barcode VARCHAR,
    p_raw_message TEXT,
    p_protocol VARCHAR,
    p_message_type VARCHAR,
    p_parsed_results JSONB,
    p_payload_fingerprint VARCHAR,
    p_is_simulation BOOLEAN,
    p_order_id UUID,
    p_order_item_id UUID,
    p_technician_id UUID,
    p_result_values JSONB, -- Array of { parameter_id: UUID, observed_value: TEXT, is_abnormal: BOOLEAN }
    p_panic_alerts JSONB   -- Array of { analyte_code: TEXT, observed_value: TEXT, abnormal_flag: TEXT }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id UUID;
    v_transmission_id UUID;
    v_result_id UUID;
    v_rec RECORD;
    v_applied_count INT := 0;
    v_panic_count INT := 0;
BEGIN
    -- 1. Database-level Idempotency: Check if transmission already exists
    SELECT id INTO v_existing_id
    FROM lab_analyzer_transmissions
    WHERE organization_id = p_organization_id
      AND analyzer_id = p_analyzer_id
      AND payload_fingerprint = p_payload_fingerprint
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'transmission_id', v_existing_id,
            'results_applied', 0,
            'panic_count', 0
        );
    END IF;

    -- 2. Insert transmission record
    INSERT INTO lab_analyzer_transmissions (
        organization_id,
        analyzer_id,
        sample_barcode,
        order_id,
        raw_message,
        protocol,
        message_type,
        parsed_results,
        payload_fingerprint,
        status,
        is_simulation
    ) VALUES (
        p_organization_id,
        p_analyzer_id,
        p_sample_barcode,
        p_order_id,
        p_raw_message,
        p_protocol,
        p_message_type,
        p_parsed_results,
        p_payload_fingerprint,
        CASE 
            WHEN p_is_simulation THEN 'PARSED'
            WHEN p_order_item_id IS NOT NULL AND jsonb_array_length(p_result_values) > 0 THEN 'APPLIED'
            WHEN p_order_item_id IS NOT NULL THEN 'MATCHED'
            ELSE 'RECEIVED'
        END,
        p_is_simulation
    ) RETURNING id INTO v_transmission_id;

    -- 3. If simulation mode, bypass all clinical table writes and return
    IF p_is_simulation THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', false,
            'transmission_id', v_transmission_id,
            'results_applied', 0,
            'panic_count', 0
        );
    END IF;

    -- 4. If clinical order matched, apply results atomically
    IF p_order_item_id IS NOT NULL THEN
        -- Find or create diagnostic_results record
        SELECT id INTO v_result_id
        FROM diagnostic_results
        WHERE order_item_id = p_order_item_id
        LIMIT 1;

        IF v_result_id IS NULL THEN
            INSERT INTO diagnostic_results (
                order_item_id,
                descriptive_findings,
                technician_id,
                created_at
            ) VALUES (
                p_order_item_id,
                '[AUTO-LIS] Ingested from Analyzer (' || p_protocol || ')',
                p_technician_id,
                NOW()
            ) RETURNING id INTO v_result_id;
        END IF;

        -- Upsert diagnostic_result_values atomically
        IF p_result_values IS NOT NULL AND jsonb_array_length(p_result_values) > 0 THEN
            FOR v_rec IN 
                SELECT 
                    (elem->>'parameter_id')::UUID AS parameter_id,
                    elem->>'observed_value' AS observed_value,
                    (elem->>'is_abnormal')::BOOLEAN AS is_abnormal
                FROM jsonb_array_elements(p_result_values) AS elem
            LOOP
                INSERT INTO diagnostic_result_values (
                    result_id,
                    parameter_id,
                    observed_value,
                    is_abnormal,
                    created_at
                ) VALUES (
                    v_result_id,
                    v_rec.parameter_id,
                    v_rec.observed_value,
                    v_rec.is_abnormal,
                    NOW()
                )
                ON CONFLICT (result_id, parameter_id)
                DO UPDATE SET
                    observed_value = EXCLUDED.observed_value,
                    is_abnormal = EXCLUDED.is_abnormal,
                    created_at = NOW();

                v_applied_count := v_applied_count + 1;
            END LOOP;
        END IF;

        -- Insert durable critical/panic alerts
        IF p_panic_alerts IS NOT NULL AND jsonb_array_length(p_panic_alerts) > 0 THEN
            FOR v_rec IN 
                SELECT 
                    elem->>'analyte_code' AS analyte_code,
                    elem->>'observed_value' AS observed_value,
                    elem->>'abnormal_flag' AS abnormal_flag
                FROM jsonb_array_elements(p_panic_alerts) AS elem
            LOOP
                INSERT INTO lab_critical_alerts (
                    organization_id,
                    transmission_id,
                    order_id,
                    sample_barcode,
                    analyte_code,
                    observed_value,
                    abnormal_flag,
                    detected_at,
                    status
                ) VALUES (
                    p_organization_id,
                    v_transmission_id,
                    p_order_id,
                    p_sample_barcode,
                    v_rec.analyte_code,
                    v_rec.observed_value,
                    v_rec.abnormal_flag,
                    NOW(),
                    'PENDING_ACK'
                );

                v_panic_count := v_panic_count + 1;
            END LOOP;
        END IF;

        -- Update diagnostic_orders status to PROCESSING
        IF p_order_id IS NOT NULL THEN
            UPDATE diagnostic_orders
            SET status = 'PROCESSING',
                updated_at = NOW()
            WHERE id = p_order_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transmission_id', v_transmission_id,
        'results_applied', v_applied_count,
        'panic_count', v_panic_count
    );
END;
$$;
