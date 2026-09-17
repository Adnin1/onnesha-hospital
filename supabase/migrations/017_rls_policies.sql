-- =====================================================================================
-- 017_ROW_LEVEL_SECURITY_POLICIES.sql
-- Enables RLS on every tenant-sensitive table and applies organization isolation policies.
-- =====================================================================================

-- 1. Helper function: Get active organization from session context
CREATE OR REPLACE FUNCTION get_current_org_id() 
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_identifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discharge_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_result_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_report_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Ensure pre-existing beds table has organization_id column
ALTER TABLE IF EXISTS beds ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 3. Core Isolation Policies (Direct organization_id check)
DROP POLICY IF EXISTS rls_patients ON patients;
CREATE POLICY rls_patients ON patients FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_visits ON patient_visits;
CREATE POLICY rls_visits ON patient_visits FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_appointments ON appointments;
CREATE POLICY rls_appointments ON appointments FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_invoices ON invoices;
CREATE POLICY rls_invoices ON invoices FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_payments ON payments;
CREATE POLICY rls_payments ON payments FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_diagnostic_orders ON diagnostic_orders;
CREATE POLICY rls_diagnostic_orders ON diagnostic_orders FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_pharmacy_sales ON pharmacy_sales;
CREATE POLICY rls_pharmacy_sales ON pharmacy_sales FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_stock_transactions ON stock_transactions;
CREATE POLICY rls_stock_transactions ON stock_transactions FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_beds ON beds;
CREATE POLICY rls_beds ON beds FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_cabins ON cabins;
CREATE POLICY rls_cabins ON cabins FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_bed_assignments ON bed_assignments;
CREATE POLICY rls_bed_assignments ON bed_assignments FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_employees ON employees;
CREATE POLICY rls_employees ON employees FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_attendance ON attendance_records;
CREATE POLICY rls_attendance ON attendance_records FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_expenses ON expenses;
CREATE POLICY rls_expenses ON expenses FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_audit ON audit_logs;
CREATE POLICY rls_audit ON audit_logs FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_organizations_public ON organizations;
DROP POLICY IF EXISTS rls_organizations_staff ON organizations;
DROP POLICY IF EXISTS rls_organizations_tenant ON organizations;
CREATE POLICY rls_organizations_tenant ON organizations FOR ALL USING (id = get_current_org_id() OR (is_active = TRUE AND is_canonical_public = TRUE));

DROP POLICY IF EXISTS rls_departments_public ON departments;
DROP POLICY IF EXISTS rls_departments_staff ON departments;
DROP POLICY IF EXISTS rls_departments_tenant ON departments;
CREATE POLICY rls_departments_tenant ON departments FOR ALL USING (organization_id = get_current_org_id() OR (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL)));

DROP POLICY IF EXISTS rls_doctors_public ON doctors;
DROP POLICY IF EXISTS rls_doctors_staff ON doctors;
DROP POLICY IF EXISTS rls_doctors_tenant ON doctors;
CREATE POLICY rls_doctors_tenant ON doctors FOR ALL USING (organization_id = get_current_org_id() OR (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL)));

DROP POLICY IF EXISTS rls_doctor_schedules_public ON doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff ON doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_tenant ON doctor_schedules;
CREATE POLICY rls_doctor_schedules_tenant ON doctor_schedules FOR ALL USING (organization_id = get_current_org_id() OR (is_active = TRUE AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = doctor_schedules.doctor_id AND d.is_active = TRUE AND (d.is_public = TRUE OR d.is_public IS NULL))));

