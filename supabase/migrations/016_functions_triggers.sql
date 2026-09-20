-- =====================================================================================
-- 016_DATABASE_FUNCTIONS_AND_TRIGGERS.sql
-- Concurrency-safe generators for Patient ID, Invoice Numbers, Token Assignment,
-- and updated_at triggers.
-- =====================================================================================

-- 1. Function: Generate Concurrency-Safe Patient ID (OH-000001)
CREATE OR REPLACE FUNCTION generate_patient_code(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_next_val BIGINT;
BEGIN
    SELECT COALESCE(patient_id_prefix, 'OH-P-') INTO v_prefix
    FROM organization_settings WHERE organization_id = p_org_id;
    
    IF v_prefix IS NULL THEN
        v_prefix := 'OH-P-';
    END IF;

    v_next_val := nextval('patient_code_seq');
    RETURN v_prefix || LPAD(v_next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. Function: Generate Concurrency-Safe Invoice Number (OH-INV-100001)
CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_next_val BIGINT;
BEGIN
    SELECT COALESCE(invoice_prefix, 'OH-INV-') INTO v_prefix
    FROM organization_settings WHERE organization_id = p_org_id;
    
    IF v_prefix IS NULL THEN
        v_prefix := 'OH-INV-';
    END IF;

    v_next_val := nextval('invoice_code_seq');
    RETURN v_prefix || LPAD(v_next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. Function: Concurrency-Safe Daily Token Generator
CREATE OR REPLACE FUNCTION get_next_token(p_org_id UUID, p_doctor_id UUID, p_date DATE)
RETURNS INT AS $$
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
$$ LANGUAGE plpgsql VOLATILE;

-- 4. Trigger Function: Automatically set updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_appointments_updated ON appointments;
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
