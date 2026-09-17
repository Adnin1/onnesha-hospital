-- =====================================================================================
-- 021_master_audit_concurrency_identifiers.sql
-- Concurrency-safe atomic sequence generators and database-level integrity constraints:
-- 1. Receipt numbers (OH-RCT-XXXXXX)
-- 2. Employee codes (EMP-XXXX)
-- 3. Pharmacy sale numbers (PH-SL-XXXXXX)
-- 4. Temporary emergency casualty IDs (TEMP-EMG-XXXXX)
-- 5. Diagnostic order numbers (ORD-XXXXXX)
-- 6. Bed & Cabin double-occupancy unique partial indexes
-- 7. Financial overpayment prevention check constraint
-- 8. Non-negative inventory batch stock constraint
-- =====================================================================================

-- 1. Receipt sequence and atomic generator
CREATE SEQUENCE IF NOT EXISTS receipt_code_seq START WITH 100001;

CREATE OR REPLACE FUNCTION generate_receipt_number(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'OH-RCT-';
BEGIN
    v_seq_num := nextval('receipt_code_seq');
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. Employee code sequence and atomic generator
CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1001;

CREATE OR REPLACE FUNCTION generate_employee_code(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'EMP-';
BEGIN
    v_seq_num := nextval('employee_code_seq');
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. Pharmacy sale sequence and atomic generator
CREATE SEQUENCE IF NOT EXISTS pharmacy_sale_seq START WITH 100001;

CREATE OR REPLACE FUNCTION generate_pharmacy_sale_number(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'PH-SL-';
BEGIN
    v_seq_num := nextval('pharmacy_sale_seq');
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 4. Temporary emergency casualty identifier generator
CREATE SEQUENCE IF NOT EXISTS emergency_temp_seq START WITH 10001;

CREATE OR REPLACE FUNCTION generate_emergency_temp_id(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(15) := 'TEMP-EMG-';
BEGIN
    v_seq_num := nextval('emergency_temp_seq');
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 5. Diagnostic order sequence and generator
CREATE SEQUENCE IF NOT EXISTS diagnostic_order_seq START WITH 100001;

CREATE OR REPLACE FUNCTION generate_diagnostic_order_number(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'ORD-';
BEGIN
    v_seq_num := nextval('diagnostic_order_seq');
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 6. Bed & Cabin double-occupancy prevention (Unique partial indexes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_bed_assignment
ON bed_assignments(bed_id)
WHERE status = 'ACTIVE' AND bed_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_cabin_assignment
ON bed_assignments(cabin_id)
WHERE status = 'ACTIVE' AND cabin_id IS NOT NULL;

-- 7. Financial overpayment integrity (paid cannot exceed grand total)
ALTER TABLE IF EXISTS invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12, 2);
UPDATE invoices SET grand_total = COALESCE(total_amount, 0) WHERE grand_total IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_paid_not_exceed_total'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_paid_not_exceed_total
        CHECK (paid_amount <= grand_total);
    END IF;
END $$;

-- 8. Non-negative inventory batch stock constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_batch_non_negative_stock'
    ) THEN
        ALTER TABLE medicine_batches ADD CONSTRAINT chk_batch_non_negative_stock
        CHECK (current_stock >= 0);
    END IF;
END $$;

-- 9. Atomic Token Allocation Function using token_counters
CREATE OR REPLACE FUNCTION get_next_token(
    p_org_id UUID,
    p_doctor_id UUID,
    p_date DATE
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_token INT;
BEGIN
    INSERT INTO token_counters (organization_id, doctor_id, counter_date, last_token)
    VALUES (p_org_id, p_doctor_id, p_date, 1)
    ON CONFLICT (organization_id, doctor_id, counter_date)
    DO UPDATE SET 
        last_token = token_counters.last_token + 1,
        updated_at = NOW()
    RETURNING last_token INTO v_token;

    RETURN v_token;
END;
$$;
