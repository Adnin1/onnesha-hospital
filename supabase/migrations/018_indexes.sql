-- =====================================================================================
-- 018_PERFORMANCE_INDEXES.sql
-- Production B-Tree, Composite, and Trigram search indexes.
-- =====================================================================================

-- Organization Composite Indexes (Every tenant query is fast)
CREATE INDEX IF NOT EXISTS idx_patients_org_code ON patients(organization_id, patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_org_phone ON patients(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_appointments_org_date ON appointments(organization_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_org_date ON payments(organization_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_diag_orders_org_status ON diagnostic_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_diag_orders_barcode ON sample_collections(barcode);
CREATE INDEX IF NOT EXISTS idx_stock_trans_batch ON stock_transactions(organization_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_medicines_org_name ON medicines(organization_id, brand_name);
CREATE INDEX IF NOT EXISTS idx_beds_org_status ON beds(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cabins_org_status ON cabins(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_org_time ON attendance_records(organization_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);

-- Trigram Fuzzy Search Indexes (PostgreSQL pg_trgm)
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_medicines_name_trgm ON medicines USING gin (brand_name gin_trgm_ops);
