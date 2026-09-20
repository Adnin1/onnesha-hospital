-- ============================================================================
-- OHMS PHASE 15 MIGRATION: PRINT TEMPLATES & DOCUMENT AUDIT LOGS
-- ============================================================================

-- 1. Print Templates Table
CREATE TABLE IF NOT EXISTS print_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- PRESCRIPTION, INVOICE, THERMAL_RECEIPT, LAB_REPORT, DISCHARGE_SUMMARY
  format VARCHAR(20) NOT NULL DEFAULT 'A4', -- A4, THERMAL_80MM
  header_html TEXT,
  footer_html TEXT,
  show_hospital_logo BOOLEAN NOT NULL DEFAULT true,
  show_qr_code BOOLEAN NOT NULL DEFAULT true,
  show_barcode BOOLEAN NOT NULL DEFAULT true,
  disclaimer_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_doc_format UNIQUE (organization_id, document_type, format)
);

-- 2. Document Print Audit Logs Table (tracks reprints for financial & medical legal compliance)
CREATE TABLE IF NOT EXISTS document_print_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  document_reference_id VARCHAR(100) NOT NULL, -- invoice_number, prescription_id, etc.
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  printed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  print_format VARCHAR(20) NOT NULL DEFAULT 'A4', -- A4, THERMAL_80MM
  is_reprint BOOLEAN NOT NULL DEFAULT false,
  reprint_reason TEXT,
  client_ip VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for Audit & Search
CREATE INDEX IF NOT EXISTS idx_print_logs_org_doc ON document_print_logs(organization_id, document_type, document_reference_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_created ON document_print_logs(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE print_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_print_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS rls_print_templates ON print_templates;
CREATE POLICY rls_print_templates ON print_templates
  FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_document_print_logs ON document_print_logs;
CREATE POLICY rls_document_print_logs ON document_print_logs
  FOR ALL USING (organization_id = get_current_org_id());
