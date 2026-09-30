-- =====================================================================================
-- 20260930070000_lis_analyzer_integration.sql
-- Direct Laboratory Information System (LIS) & Clinical Analyzer Integration
-- Standards: ASTM E1381 / E1394 (Hematology) & HL7 v2.x ORU^R01 (Biochemistry / Immunoassay)
-- =====================================================================================

-- 1. Laboratory Physical / Network Analyzers Registry
CREATE TABLE IF NOT EXISTS lab_analyzers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    department VARCHAR(50) NOT NULL DEFAULT 'Hematology' CHECK (department IN ('Hematology', 'Biochemistry', 'Immunology', 'Urinalysis', 'Microbiology', 'Electrolytes')),
    protocol VARCHAR(30) NOT NULL DEFAULT 'ASTM_1394' CHECK (protocol IN ('ASTM_1394', 'HL7_V2', 'REST_JSON')),
    connection_type VARCHAR(30) NOT NULL DEFAULT 'TCP_IP' CHECK (connection_type IN ('TCP_IP', 'SERIAL_RS232', 'HTTP_WEBHOOK')),
    ip_address VARCHAR(50),
    port INT,
    baud_rate INT,
    status VARCHAR(20) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'BUSY')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

-- 2. Raw Instrument Transmissions & Audit Ingestion Log
CREATE TABLE IF NOT EXISTS lab_analyzer_transmissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    analyzer_id UUID NOT NULL REFERENCES lab_analyzers(id) ON DELETE CASCADE,
    sample_barcode VARCHAR(50) NOT NULL,
    order_id UUID REFERENCES diagnostic_orders(id) ON DELETE SET NULL,
    raw_message TEXT NOT NULL,
    protocol VARCHAR(30) NOT NULL DEFAULT 'ASTM_1394',
    message_type VARCHAR(30) NOT NULL DEFAULT 'RESULTS',
    parsed_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'PARSED' CHECK (status IN ('RECEIVED', 'PARSED', 'MATCHED', 'APPLIED', 'REJECTED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid barcode and order lookup
CREATE INDEX IF NOT EXISTS idx_lab_transmissions_barcode ON lab_analyzer_transmissions(organization_id, sample_barcode);
CREATE INDEX IF NOT EXISTS idx_lab_transmissions_order ON lab_analyzer_transmissions(organization_id, order_id);
CREATE INDEX IF NOT EXISTS idx_lab_transmissions_created ON lab_analyzer_transmissions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_analyzers_org_active ON lab_analyzers(organization_id, is_active);

-- Enable Row-Level Security
ALTER TABLE lab_analyzers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_analyzer_transmissions ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies for Analyzers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lab_analyzers' AND policyname = 'tenant_isolation_lab_analyzers'
  ) THEN
    CREATE POLICY tenant_isolation_lab_analyzers ON lab_analyzers
      FOR ALL
      USING (organization_id = (SELECT org_id FROM current_user_org()));
  END IF;
END $$;

-- Tenant Isolation Policies for Transmissions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lab_analyzer_transmissions' AND policyname = 'tenant_isolation_lab_transmissions'
  ) THEN
    CREATE POLICY tenant_isolation_lab_transmissions ON lab_analyzer_transmissions
      FOR ALL
      USING (organization_id = (SELECT org_id FROM current_user_org()));
  END IF;
END $$;

-- Pre-seed Standard Hospital Clinical Analyzers for Existing Organizations
DO $$
DECLARE
    org_rec RECORD;
BEGIN
    FOR org_rec IN SELECT id FROM organizations LOOP
        INSERT INTO lab_analyzers (
            organization_id, name, code, department, protocol, connection_type, ip_address, port, status, is_active
        ) VALUES 
        (
            org_rec.id, 
            'Mindray BC-5000 5-Part Auto Hematology Analyzer', 
            'MINDRAY-BC5000', 
            'Hematology', 
            'ASTM_1394', 
            'TCP_IP', 
            '192.168.10.101', 
            5100, 
            'ONLINE', 
            TRUE
        ),
        (
            org_rec.id, 
            'Roche Cobas c311 Clinical Chemistry Analyzer', 
            'ROCHE-COBAS-C311', 
            'Biochemistry', 
            'HL7_V2', 
            'TCP_IP', 
            '192.168.10.102', 
            5200, 
            'ONLINE', 
            TRUE
        ),
        (
            org_rec.id, 
            'Sysmex XN-350 Automated Hematology System', 
            'SYSMEX-XN350', 
            'Hematology', 
            'ASTM_1394', 
            'SERIAL_RS232', 
            NULL, 
            NULL, 
            'ONLINE', 
            TRUE
        ),
        (
            org_rec.id, 
            'Bio-Rad D-10 Dual Program HbA1c System', 
            'BIORAD-D10', 
            'Biochemistry', 
            'ASTM_1394', 
            'TCP_IP', 
            '192.168.10.104', 
            5400, 
            'ONLINE', 
            TRUE
        )
        ON CONFLICT (organization_id, code) DO NOTHING;
    END LOOP;
END $$;
