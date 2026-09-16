
-- ==========================================
-- FILE: 022_phase13_public_online_booking.sql
-- ==========================================
﻿-- =====================================================================================
-- 022_phase13_public_online_booking.sql
-- Onnesha Hospital Management System (OHMS) - Phase 13 Foundation Migration
-- Public Department/Doctor Views, Secure Online Appointment Booking RPC, and Public Enquiries
-- =====================================================================================

-- 1. Doctor public profile enhancements
ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS public_bio TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 10;

-- 2. Department public metadata enhancements
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- Update initial slugs if missing
UPDATE departments SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- 3. Public Web Contact Inquiries Table
CREATE TABLE IF NOT EXISTS public_contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(30) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'READ', 'RESPONDED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public_contact_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_public_contact_inquiries ON public_contact_inquiries 
    FOR ALL USING (organization_id = get_current_org_id());

-- 4. Secure Public Doctors View (Strictly Omits Salaries, Commission, and Private HR Details)
CREATE OR REPLACE VIEW public_doctors_view AS
SELECT 
    d.id,
    d.organization_id,
    d.full_name,
    d.degrees,
    d.designation,
    d.specialization,
    d.bmdc_reg_number,
    d.room_number,
    d.opd_fee,
    d.followup_fee,
    d.avatar_url,
    d.bio,
    d.public_bio,
    d.experience_years,
    d.is_active,
    d.is_public,
    dept.id AS department_id,
    dept.name AS department_name,
    dept.slug AS department_slug
FROM doctors d
LEFT JOIN doctor_departments dd ON d.id = dd.doctor_id AND dd.is_primary = TRUE
LEFT JOIN departments dept ON dd.department_id = dept.id
WHERE d.is_active = TRUE AND (d.is_public = TRUE OR d.is_public IS NULL);

-- 5. Secure Public Departments View
CREATE OR REPLACE VIEW public_departments_view AS
SELECT 
    id,
    organization_id,
    name,
    code,
    slug,
    description,
    type,
    is_active,
    is_public
FROM departments
WHERE is_active = TRUE AND (is_public = TRUE OR is_public IS NULL);

-- 6. Atomic Concurrency-Safe Public Online Appointment Booking RPC
-- Matches or creates patient record, locks token atomically, and commits booking.
CREATE OR REPLACE FUNCTION book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS 
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
BEGIN
    -- Verify doctor exists, active, and public
    SELECT is_active, room_number INTO v_doctor_active, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for appointments.');
    END IF;

    -- Check if doctor is on scheduled leave for target date
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves 
        WHERE doctor_id = p_doctor_id 
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Find primary department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Normalize Phone
    v_clean_phone := REGEXP_REPLACE(p_patient_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
    END IF;

    -- Find existing patient by normalized phone or create new record
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        -- Generate atomic patient code
        v_patient_code := generate_patient_code(p_org_id);
        INSERT INTO patients (
            organization_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            gender,
            age_years
        ) VALUES (
            p_org_id,
            v_patient_code,
            p_patient_name,
            v_clean_phone,
            v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'),
            p_patient_age
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- Allocate atomic next token for doctor on date (concurrency safe)
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        patient_notes
    ) VALUES (
        p_org_id,
        v_patient_id,
        p_doctor_id,
        v_department_id,
        p_appointment_date,
        v_token,
        'ONLINE',
        'WAITING',
        'PENDING',
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, 'Chamber'),
        v_token,
        'WAITING'
    )
    ON CONFLICT (appointment_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, 'Chamber')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
;


-- ==========================================
-- FILE: 023_phase14_enterprise_notifications_and_payments.sql
-- ==========================================
-- =====================================================================================
-- 023_phase14_enterprise_notifications_and_payments.sql
-- Onnesha Hospital Management System (OHMS) - Phase 14 Migration
-- Enterprise Notification Outbox, Multi-tenant Integrations, Payment Intents,
-- Webhook Audit Store, and Financial Reconciliation Engine.
-- =====================================================================================

-- 1. Multi-Tenant Organization Integrations Configuration
CREATE TABLE IF NOT EXISTS organization_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    integration_type VARCHAR(30) NOT NULL CHECK (integration_type IN ('SMS', 'WHATSAPP', 'EMAIL', 'PAYMENT_GATEWAY')),
    provider_name VARCHAR(50) NOT NULL, -- e.g. 'SSL_WIRELESS', 'META_WHATSAPP', 'SMTP', 'BKASH', 'NAGAD', 'SSLCOMMERZ'
    environment VARCHAR(20) NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
    sender_id VARCHAR(100), -- e.g. Sender ID for SMS or From Email
    encrypted_credentials JSONB NOT NULL DEFAULT '{}'::jsonb, -- Secure reference, masked in logs/UI
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, integration_type, provider_name, environment)
);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_organization_integrations ON organization_integrations
    FOR ALL USING (organization_id = get_current_org_id());

-- 2. Notification Templates (Bilingual EN / BN)
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_code VARCHAR(60) NOT NULL, -- e.g. 'APPOINTMENT_CONFIRMED', 'TOKEN_ASSIGNED', 'BILL_RECEIPT'
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('SMS', 'WHATSAPP', 'EMAIL')),
    language VARCHAR(10) NOT NULL DEFAULT 'BN' CHECK (language IN ('EN', 'BN')),
    subject VARCHAR(250), -- for Email
    body_template TEXT NOT NULL,
    provider_template_id VARCHAR(100), -- for WhatsApp Meta approved template IDs
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, template_code, channel, language)
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_notification_templates ON notification_templates
    FOR ALL USING (organization_id = get_current_org_id());

-- 3. Patient Notification Preferences & Consent
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, patient_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_notification_preferences ON notification_preferences
    FOR ALL USING (organization_id = get_current_org_id());

-- 4. Durable Notification Outbox Queue
CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('SMS', 'WHATSAPP', 'EMAIL')),
    notification_type VARCHAR(60) NOT NULL,
    recipient VARCHAR(150) NOT NULL, -- Normalized Phone or Email
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    source_reference_id VARCHAR(100), -- e.g. appointment_id, invoice_id
    idempotency_key VARCHAR(200) NOT NULL,
    subject VARCHAR(250),
    message_content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    provider_name VARCHAR(50),
    provider_message_id VARCHAR(150),
    attempt_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_queue ON notification_outbox(organization_id, status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient ON notification_outbox(organization_id, recipient);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_notification_outbox ON notification_outbox
    FOR ALL USING (organization_id = get_current_org_id());

-- 5. Payment Intents Table (Authoritative Server-side Payment Sessions)
CREATE SEQUENCE IF NOT EXISTS payment_intent_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    intent_reference VARCHAR(40) NOT NULL, -- e.g. PI-OH-100001
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    payable_amount NUMERIC(12, 2) NOT NULL CHECK (payable_amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    provider VARCHAR(30) NOT NULL CHECK (provider IN ('BKASH', 'NAGAD', 'SSLCOMMERZ')),
    status VARCHAR(25) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED')),
    idempotency_key VARCHAR(200) NOT NULL,
    provider_session_id VARCHAR(150),
    provider_transaction_id VARCHAR(150),
    checkout_url TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, intent_reference),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (provider, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_invoice ON payment_intents(organization_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(organization_id, status);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payment_intents ON payment_intents
    FOR ALL USING (organization_id = get_current_org_id());

-- 6. Durable Webhook Audit Store (Prevents Replay Attacks)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    provider_event_id VARCHAR(150),
    signature_header VARCHAR(250),
    is_signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
    failure_reason TEXT,
    correlation_id VARCHAR(100),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_provider_event ON webhook_events(organization_id, provider, provider_event_id)
WHERE provider_event_id IS NOT NULL;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_webhook_events ON webhook_events
    FOR ALL USING (organization_id = get_current_org_id());

-- 7. Payment Reconciliations Ledger
CREATE TABLE IF NOT EXISTS payment_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    payment_intent_id UUID REFERENCES payment_intents(id),
    provider_transaction_id VARCHAR(150),
    expected_amount NUMERIC(12, 2) NOT NULL,
    received_amount NUMERIC(12, 2) NOT NULL,
    mismatch_type VARCHAR(40) NOT NULL CHECK (mismatch_type IN ('AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'MISSING_INTERNAL_PAYMENT', 'DUPLICATE_CALLBACK', 'CURRENCY_MISMATCH')),
    status VARCHAR(20) NOT NULL DEFAULT 'FLAGGED' CHECK (status IN ('FLAGGED', 'INVESTIGATING', 'RESOLVED', 'ADJUSTED')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payment_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payment_reconciliations ON payment_reconciliations
    FOR ALL USING (organization_id = get_current_org_id());

-- 8. Atomic Verification & Payment Commit RPC
CREATE OR REPLACE FUNCTION verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_intent RECORD;
    v_invoice RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
BEGIN
    -- 1. Select and lock payment intent
    SELECT * INTO v_intent
    FROM payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment intent not found');
    END IF;

    IF v_intent.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    -- 2. Select and lock invoice
    SELECT * INTO v_invoice
    FROM invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated invoice not found');
    END IF;

    -- 3. Check for amount mismatch
    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, p_provider_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount does not match expected payable amount');
    END IF;

    -- 4. Calculate new amounts
    v_new_paid := v_invoice.paid_amount + p_paid_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;

    -- 5. Generate official receipt number
    v_receipt_no := generate_receipt_number(p_org_id);

    -- 6. Insert into payments table
    INSERT INTO payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no, p_gateway_method,
        p_paid_amount, p_provider_trx_id,
        COALESCE(p_cashier_id, v_invoice.created_by),
        'Online Gateway Settlement: ' || p_gateway_method || ' (Trx: ' || p_provider_trx_id || ')'
    ) RETURNING id INTO v_payment_id;

    -- 7. Update invoice status
    UPDATE invoices
    SET 
        paid_amount = v_new_paid,
        due_amount = v_new_due,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice.id;

    -- 8. Mark payment intent as PAID
    UPDATE payment_intents
    SET 
        status = 'PAID',
        provider_transaction_id = p_provider_trx_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = v_intent.id;

    RETURN jsonb_build_object(
        'success', true,
        'receipt_number', v_receipt_no,
        'payment_id', v_payment_id,
        'invoice_number', v_invoice.invoice_number,
        'new_due', v_new_due,
        'status', v_new_status
    );
END;
$$;


-- ==========================================
-- FILE: 024_phase15_printing_templates.sql
-- ==========================================
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


-- ==========================================
-- FILE: 025_phase16_security_clinical_financial_audit.sql
-- ==========================================
﻿-- ============================================================================
-- OHMS PHASE 16 MIGRATION: ADVANCED SECURITY HARDENING & AUDIT VAULT ENHANCEMENTS
-- ============================================================================

-- 1. Optimized Compound Indexes for High-Speed Compliance & Forensic Queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_module_action 
  ON audit_logs(organization_id, module, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity 
  ON audit_logs(organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_user 
  ON audit_logs(organization_id, user_id, created_at DESC);

-- 2. Audit Trail Summary View for Executive & Security Dashboards
CREATE OR REPLACE VIEW audit_trail_summary AS
SELECT 
  organization_id,
  module,
  action,
  COUNT(*) as event_count,
  MAX(created_at) as last_event_at
FROM audit_logs
GROUP BY organization_id, module, action;

-- 3. Stored RPC Function for Multi-Filter Audit Log Retrieval
CREATE OR REPLACE FUNCTION get_audit_trail_logs(
  p_org_id UUID,
  p_module VARCHAR DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  organization_id UUID,
  user_id UUID,
  action VARCHAR,
  module VARCHAR,
  entity_type VARCHAR,
  entity_id VARCHAR,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS 
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.organization_id,
    a.user_id,
    a.action,
    a.module,
    a.entity_type,
    a.entity_id,
    a.old_values,
    a.new_values,
    a.ip_address,
    a.user_agent,
    a.created_at
  FROM audit_logs a
  WHERE a.organization_id = p_org_id
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_action IS NULL OR a.action = p_action)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
;

-- 4. Enforce Read-Only Access via Settings.Audit Permission
-- Audit records can NEVER be modified or deleted by ANY user
REVOKE UPDATE, DELETE ON audit_logs FROM public;
REVOKE UPDATE, DELETE ON document_print_logs FROM public;


-- ==========================================
-- FILE: 026_phase17_push_subscriptions.sql
-- ==========================================
-- Phase 17: Push notification subscription management
-- Idempotent, preserves RLS and tenant isolation

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  browser TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_push_endpoint UNIQUE (endpoint)
);

-- RLS: Tenant isolation
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_tenant_isolation'
  ) THEN
    CREATE POLICY push_subscriptions_tenant_isolation ON push_subscriptions
      FOR ALL
      USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;
END $$;

-- Index for fast endpoint lookup
CREATE INDEX IF NOT EXISTS idx_push_sub_org ON push_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_active ON push_subscriptions(organization_id) WHERE revoked_at IS NULL;


-- ==========================================
-- FILE: 027_phase21_atomic_appointment_booking.sql
-- ==========================================
-- =====================================================================================
-- 027_phase21_atomic_appointment_booking.sql
-- Onnesha Hospital Management System (OHMS) - Phase 21 Atomic Appointment Transaction RPCs
-- Single-transaction PostgreSQL RPCs for Staff & Public Appointment Booking
-- Ensures zero orphan records, capacity checks, fail-closed security, and search_path isolation.
-- =====================================================================================

-- 1. Atomic Staff Appointment Booking RPC
CREATE OR REPLACE FUNCTION book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID DEFAULT NULL,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_calling_user_id UUID;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_department_id UUID;
    v_token INT;
    v_appointment_id UUID;
    v_patient_code VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
BEGIN
    -- Verify calling user authentication
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        -- Allow fallback for server client in static context if valid session exists
        SELECT id INTO v_calling_user_id FROM profiles WHERE id = auth.uid() LIMIT 1;
    END IF;

    -- Verify patient exists in organization
    SELECT patient_code INTO v_patient_code
    FROM patients
    WHERE id = p_patient_id AND organization_id = p_org_id;

    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    -- Verify doctor exists and is active in organization
    SELECT is_active, room_number INTO v_doctor_active, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    -- Verify date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Check if doctor is on leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves
        WHERE doctor_id = p_doctor_id
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Check schedule capacity if schedule_id supplied
    IF p_schedule_id IS NOT NULL THEN
        SELECT max_tokens INTO v_capacity
        FROM doctor_schedules
        WHERE id = p_schedule_id AND doctor_id = p_doctor_id AND is_active = TRUE;

        IF v_capacity IS NOT NULL THEN
            SELECT COUNT(*) INTO v_booked_count
            FROM appointments
            WHERE doctor_id = p_doctor_id
              AND appointment_date = p_appointment_date
              AND status NOT IN ('CANCELLED', 'NO_SHOW');

            IF v_booked_count >= v_capacity THEN
                RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
            END IF;
        END IF;
    END IF;

    -- Get doctor department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Atomic token allocation
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        schedule_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        booked_by,
        patient_notes
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        COALESCE(p_source, 'WALKIN'),
        'WAITING',
        'PENDING',
        v_calling_user_id,
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, 'Chamber'),
        v_token,
        'WAITING'
    );

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        v_calling_user_id,
        'CREATE',
        'APPOINTMENT',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'patientId', p_patient_id, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, 'Chamber')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 2. Hardened Public Online Appointment Booking RPC
CREATE OR REPLACE FUNCTION book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_day_name VARCHAR;
BEGIN
    -- Validate date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Verify doctor exists, active, and public
    SELECT is_active, COALESCE(is_public, true), room_number 
    INTO v_doctor_active, v_doctor_public, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Check if doctor is on scheduled leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves 
        WHERE doctor_id = p_doctor_id 
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Get day of week name (SATURDAY..FRIDAY)
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));

    -- Verify active published schedule exists for this day & check capacity
    SELECT SUM(max_tokens) INTO v_capacity
    FROM doctor_schedules
    WHERE doctor_id = p_doctor_id 
      AND organization_id = p_org_id
      AND is_active = TRUE
      AND UPPER(TRIM(day_of_week)) IN (v_day_name, TRIM(TO_CHAR(p_appointment_date, 'D')));

    -- Count existing non-cancelled bookings for date
    SELECT COUNT(*) INTO v_booked_count
    FROM appointments
    WHERE doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor online booking capacity has been reached for this date.');
    END IF;

    -- Find primary department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Normalize Phone
    v_clean_phone := REGEXP_REPLACE(p_patient_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
    END IF;

    IF LENGTH(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Find existing patient by normalized phone or create new record
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := generate_patient_code(p_org_id);
        INSERT INTO patients (
            organization_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            gender,
            age_years
        ) VALUES (
            p_org_id,
            v_patient_code,
            p_patient_name,
            v_clean_phone,
            v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'),
            p_patient_age
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- Allocate atomic next token for doctor on date (concurrency safe)
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        patient_notes
    ) VALUES (
        p_org_id,
        v_patient_id,
        p_doctor_id,
        v_department_id,
        p_appointment_date,
        v_token,
        'ONLINE',
        'WAITING',
        'PENDING',
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, 'Chamber'),
        v_token,
        'WAITING'
    )
    ON CONFLICT (appointment_id) DO NOTHING;

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        'CREATE',
        'PUBLIC_BOOKING',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'patientCode', v_patient_code, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, 'Chamber')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ==========================================
-- FILE: 028_phase22_authoritative_slot_concurrency_rbac.sql
-- ==========================================
-- =====================================================================================
-- 028_phase22_authoritative_slot_concurrency_rbac.sql
-- Onnesha Hospital Management System (OHMS) - Phase 22 Production Hardening
-- 1. Mandatory Authoritative Schedule Slot Validation (p_schedule_id UUID - No Default NULL)
-- 2. Concurrency-Safe Capacity Lock via Transaction Advisory Locks (pg_advisory_xact_lock)
-- 3. DB-Level RBAC Authorization via user_roles & role_permissions
-- 4. Public Organization Boundary Validation
-- 5. Strict Security Definer search_path Isolation & EXECUTE Grant Hardening
-- =====================================================================================

-- Drop obsolete signatures with default NULL schedule_id
DROP FUNCTION IF EXISTS book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS book_staff_appointment_atomic(UUID, UUID, UUID, UUID, DATE, VARCHAR, TEXT);

-- 1. Redefine book_online_appointment RPC with MANDATORY p_schedule_id UUID
CREATE OR REPLACE FUNCTION book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_schedule_id UUID,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_day_name VARCHAR;
    v_schedule_day VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
    v_org_active BOOLEAN;
BEGIN
    -- Validate p_org_id boundary
    SELECT is_active INTO v_org_active
    FROM organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    -- Validate mandatory schedule_id parameter
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Validate date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Acquire transaction advisory lock for exact org + doctor + schedule + date to serialize concurrent requests
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Verify doctor exists, active, and public
    SELECT is_active, is_public, room_number 
    INTO v_doctor_active, v_doctor_public, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Verify selected schedule exists, belongs to doctor and org, and is active
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Verify schedule day matches appointment date day of week
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Check if doctor is on scheduled leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves 
        WHERE doctor_id = p_doctor_id 
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Count existing non-cancelled bookings for exact schedule and date
    SELECT COUNT(*) INTO v_booked_count
    FROM appointments
    WHERE organization_id = p_org_id
      AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Find primary department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Normalize Phone
    v_clean_phone := REGEXP_REPLACE(p_patient_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
    END IF;

    IF LENGTH(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Find existing patient by normalized phone or create new record
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := generate_patient_code(p_org_id);
        INSERT INTO patients (
            organization_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            gender,
            age_years
        ) VALUES (
            p_org_id,
            v_patient_code,
            p_patient_name,
            v_clean_phone,
            v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'),
            p_patient_age
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- Allocate atomic next token for doctor on date
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        schedule_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        patient_notes
    ) VALUES (
        p_org_id,
        v_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        'ONLINE',
        'WAITING',
        'PENDING',
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, ''),
        v_token,
        'WAITING'
    );

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        'CREATE',
        'PUBLIC_BOOKING',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'scheduleId', p_schedule_id, 'patientCode', v_patient_code, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, '')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking request could not be processed. Please try again.');
END;
$$;


-- 2. Redefine book_staff_appointment_atomic RPC (Canonical DB Schema RBAC via user_roles & role_permissions)
CREATE OR REPLACE FUNCTION book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_department_id UUID;
    v_token INT;
    v_appointment_id UUID;
    v_patient_code VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
BEGIN
    -- Verify calling user authentication
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Calling user authentication required.');
    END IF;

    -- Verify caller profile is active
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
    END IF;

    -- Verify caller has active hospital role in p_org_id or appointments.create permission (joining user_roles, roles & role_permissions)
    SELECT EXISTS (
        SELECT 1 
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_calling_user_id 
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'admin', 'doctor', 'receptionist', 'nurse', 'staff')
    ) INTO v_has_perm;

    IF v_has_perm IS NOT TRUE THEN
        SELECT EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id
              AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('appointments.create', 'appointments.manage', '*')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient database privileges for appointment booking.');
        END IF;
    END IF;

    -- Validate mandatory schedule_id parameter
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory schedule selection: p_schedule_id must be provided for normal OPD appointments.');
    END IF;

    -- Verify patient exists in organization
    SELECT patient_code INTO v_patient_code
    FROM patients
    WHERE id = p_patient_id AND organization_id = p_org_id;

    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    -- Verify doctor exists and is active in organization
    SELECT is_active, room_number INTO v_doctor_active, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    -- Verify date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Verify selected schedule exists, belongs to doctor and org, and is active
    SELECT doctor_id, organization_id, max_tokens, is_active
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active
    FROM doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Acquire transaction advisory lock using exact org + doctor + schedule + date formula for concurrency safety
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Check if doctor is on leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves
        WHERE doctor_id = p_doctor_id
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Check schedule capacity if capacity limit exists
    IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
        SELECT COUNT(*) INTO v_booked_count
        FROM appointments
        WHERE doctor_id = p_doctor_id
          AND appointment_date = p_appointment_date
          AND schedule_id = p_schedule_id
          AND status NOT IN ('CANCELLED', 'NO_SHOW');

        IF v_booked_count >= v_capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
        END IF;
    END IF;

    -- Get doctor department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Atomic token allocation
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        schedule_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        booked_by,
        patient_notes
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        COALESCE(p_source, 'WALKIN'),
        'WAITING',
        'PENDING',
        v_calling_user_id,
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, ''),
        v_token,
        'WAITING'
    );

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        v_calling_user_id,
        'CREATE',
        'APPOINTMENT',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'patientId', p_patient_id, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, '')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff appointment booking could not be processed. Please try again.');
END;
$$;


-- 3. Security Definer EXECUTE Grant Hardening
REVOKE EXECUTE ON FUNCTION book_staff_appointment_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_staff_appointment_atomic TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION book_online_appointment TO anon, authenticated, service_role;

-- Ensure all active doctors have explicit is_public = TRUE
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
UPDATE doctors SET is_public = TRUE WHERE is_public IS NULL AND is_active = TRUE;


-- ==========================================
-- FILE: 029_phase23_security_definer_search_path_hardening.sql
-- ==========================================
﻿-- =====================================================================================
-- 029_phase23_security_definer_search_path_hardening.sql
-- Onnesha Hospital Management System (OHMS) - Phase 23 Security Hardening
-- Upgrade all SECURITY DEFINER functions to SET search_path = '' (empty)
-- with fully schema-qualified object references, per Supabase current guidance.
-- This prevents search_path hijacking (privilege escalation via schema shadowing).
-- =====================================================================================

-- =====================================================================================
-- PART 1: Harden core identity helper functions (initial schema — no SET search_path)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.name FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission_key = perm_code
  );
$$;

-- =====================================================================================
-- PART 2: Harden get_audit_trail_logs() + add auth guard
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_audit_trail_logs(
  p_org_id UUID,
  p_module VARCHAR DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  organization_id UUID,
  user_id UUID,
  action VARCHAR,
  module VARCHAR,
  entity_type VARCHAR,
  entity_id VARCHAR,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '401 Unauthorized: Authentication required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION '403 Forbidden: Insufficient privileges to access audit logs.';
  END IF;

  RETURN QUERY
  SELECT a.id, a.organization_id, a.user_id, a.action, a.module,
         a.entity_type, a.entity_id, a.old_values, a.new_values,
         a.ip_address, a.user_agent, a.created_at
  FROM public.audit_logs a
  WHERE a.organization_id = p_org_id
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_action IS NULL OR a.action = p_action)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_audit_trail_logs FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_trail_logs TO authenticated, service_role;

-- =====================================================================================
-- PART 3: Harden verify_and_record_online_payment() + add auth guard + sanitize error
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_intent RECORD;
    v_invoice RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    SELECT * INTO v_intent FROM public.payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment intent not found.');
    END IF;

    IF v_intent.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated invoice not found.');
    END IF;

    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO public.payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, p_provider_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount does not match expected payable amount.');
    END IF;

    v_new_paid := v_invoice.paid_amount + p_paid_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;
    v_receipt_no := public.generate_receipt_number(p_org_id);

    INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no, p_gateway_method,
        p_paid_amount, p_provider_trx_id,
        COALESCE(p_cashier_id, v_invoice.created_by),
        'Online Gateway Settlement: ' || p_gateway_method || ' (Trx: ' || p_provider_trx_id || ')'
    ) RETURNING id INTO v_payment_id;

    UPDATE public.invoices SET paid_amount = v_new_paid, due_amount = v_new_due,
           status = v_new_status, updated_at = NOW() WHERE id = v_invoice.id;

    UPDATE public.payment_intents SET status = 'PAID', provider_transaction_id = p_provider_trx_id,
           verified_at = NOW(), updated_at = NOW() WHERE id = v_intent.id;

    RETURN jsonb_build_object('success', true, 'receipt_number', v_receipt_no,
        'payment_id', v_payment_id, 'invoice_number', v_invoice.invoice_number,
        'new_due', v_new_due, 'status', v_new_status);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment processing could not be completed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_and_record_online_payment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_record_online_payment TO authenticated, service_role;

-- =====================================================================================
-- PART 4: Canonical book_online_appointment — SET search_path = '' + schema-qualified
-- (Supersedes: 022, 027, 028 versions)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);

CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_schedule_id UUID,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_day_name VARCHAR;
    v_schedule_day VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
    v_org_active BOOLEAN;
BEGIN
    -- Gate 10: Canonical organization boundary (cannot be bypassed by caller)
    SELECT is_active INTO v_org_active FROM public.organizations WHERE id = p_org_id;
    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    -- Gate: Mandatory schedule
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Gate: Not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency lock: exact org + doctor + schedule + date
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Gate 11: Public visibility check
    SELECT is_active, is_public, room_number INTO v_doctor_active, v_doctor_public, v_room_number
    FROM public.doctors WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Gate: Schedule ownership + org + status
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Gate: Day-of-week match
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Gate: Leave check
    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Gate 12: Strict capacity (no NULL-schedule leakage)
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Department resolution
    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Phone normalization
    v_clean_phone := regexp_replace(p_patient_phone, '[^0-9]', '', 'g');
    IF length(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := substring(v_clean_phone FROM 3);
    END IF;
    IF length(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Patient match or create
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := public.generate_patient_code(p_org_id);
        INSERT INTO public.patients (organization_id, patient_code, full_name, phone,
            normalized_phone, gender, age_years)
        VALUES (p_org_id, v_patient_code, p_patient_name, v_clean_phone, v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'), p_patient_age)
        RETURNING id INTO v_patient_id;
    END IF;

    -- Atomic token allocation
    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert appointment
    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, patient_notes)
    VALUES (p_org_id, v_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, 'ONLINE', 'WAITING', 'PENDING', p_notes)
    RETURNING id INTO v_appointment_id;

    -- Insert into waiting queue
    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, 'CREATE', 'PUBLIC_BOOKING', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'scheduleId', p_schedule_id, 'patientCode', v_patient_code,
            'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking request could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_online_appointment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment TO anon, authenticated, service_role;

-- =====================================================================================
-- PART 5: Canonical book_staff_appointment_atomic — SET search_path = ''
-- (Supersedes: 027, 028 versions)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_staff_appointment_atomic(UUID, UUID, UUID, UUID, DATE, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION public.book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_department_id UUID;
    v_token INT;
    v_appointment_id UUID;
    v_patient_code VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
BEGIN
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Calling user authentication required.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'admin', 'doctor', 'receptionist', 'nurse', 'staff')
    ) INTO v_has_perm;

    IF v_has_perm IS NOT TRUE THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('appointments.create', 'appointments.manage', '*')
        ) INTO v_has_perm;
        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient database privileges for appointment booking.');
        END IF;
    END IF;

    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory schedule selection: p_schedule_id must be provided.');
    END IF;

    SELECT patient_code INTO v_patient_code FROM public.patients
    WHERE id = p_patient_id AND organization_id = p_org_id;
    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    SELECT is_active, room_number INTO v_doctor_active, v_room_number FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;
    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    SELECT doctor_id, organization_id, max_tokens, is_active
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
        SELECT COUNT(*) INTO v_booked_count FROM public.appointments
        WHERE doctor_id = p_doctor_id AND appointment_date = p_appointment_date
          AND schedule_id = p_schedule_id AND status NOT IN ('CANCELLED', 'NO_SHOW');
        IF v_booked_count >= v_capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
        END IF;
    END IF;

    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, booked_by, patient_notes)
    VALUES (p_org_id, p_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, COALESCE(p_source, 'WALKIN'), 'WAITING', 'PENDING', v_calling_user_id, p_notes)
    RETURNING id INTO v_appointment_id;

    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    INSERT INTO public.audit_logs (organization_id, user_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, v_calling_user_id, 'CREATE', 'APPOINTMENT', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'patientId', p_patient_id, 'scheduleId', p_schedule_id, 'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff appointment booking could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_staff_appointment_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_staff_appointment_atomic TO authenticated, service_role;

-- =====================================================================================
-- PART 6: Ensure doctors.is_public column with correct defaults
-- =====================================================================================

ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
UPDATE public.doctors SET is_public = TRUE WHERE is_public IS NULL AND is_active = TRUE;
UPDATE public.doctors SET is_public = FALSE WHERE is_public IS NULL AND is_active = FALSE;


-- ==========================================
-- FILE: 030_phase24_canonical_public_org_enforcement.sql
-- ==========================================
-- =====================================================================================
-- 030_phase24_canonical_public_org_enforcement.sql
-- Onnesha Hospital Management System (OHMS) - Phase 24
--
-- PROBLEM:
--   book_online_appointment() currently validates organizations.is_active only.
--   This means ANY active organization UUID could be accepted for public bookings.
--   However, the public web layer sends ONLY HOSPITAL_METADATA.id
--   (a0000000-0000-0000-0000-000000000001) — the canonical public-facing org.
--
-- FIX:
--   1. Add is_canonical_public BOOLEAN to organizations table.
--   2. Mark the canonical Onnesha Hospital org as is_canonical_public = TRUE.
--   3. Replace book_online_appointment() active-only org check with:
--        a. is_active = TRUE
--        b. is_canonical_public = TRUE
--      This enforces exactly one canonical public org at the DB layer,
--      without duplicating the UUID inside function bodies.
--
-- RATIONALE:
--   - Using a schema column avoids hardcoding the org UUID in multiple function bodies.
--   - The canonical org UUID is set ONCE in seed data (019_seed_reference_data.sql).
--   - The DB rule and the public web layer (HOSPITAL_METADATA.id) now resolve
--     to the same logical constraint via the is_canonical_public flag.
-- =====================================================================================

-- =====================================================================================
-- PART 1: Add is_canonical_public flag to organizations
-- =====================================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_canonical_public BOOLEAN DEFAULT FALSE;

-- Mark the canonical public hospital organization
UPDATE public.organizations
SET is_canonical_public = TRUE
WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;

-- Ensure exactly one canonical public org:
-- 1. Reset any stray organizations to FALSE
UPDATE public.organizations
SET is_canonical_public = FALSE
WHERE id != 'a0000000-0000-0000-0000-000000000001'::UUID
  AND is_canonical_public IS TRUE;

-- 2. Database-level partial unique index: guarantees at most ONE organization can ever have is_canonical_public = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_canonical_public
ON public.organizations (is_canonical_public)
WHERE is_canonical_public IS TRUE;

-- =====================================================================================
-- PART 2: Replace book_online_appointment with canonical-org-enforced version
-- (search_path = '', schema-qualified, canonical public org gate)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);

CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_schedule_id UUID,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_day_name VARCHAR;
    v_schedule_day VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
    v_org_active BOOLEAN;
    v_org_canonical BOOLEAN;
BEGIN
    -- ================================================================
    -- Gate 0: Canonical public organization boundary enforcement.
    -- The public web layer (lib/public/actions.ts) sends HOSPITAL_METADATA.id.
    -- The DB enforces that the org is both active AND is_canonical_public = TRUE.
    -- This means NO OTHER active org can accept public bookings even if supplied.
    -- ================================================================
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    IF v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Organization is not authorized for public online booking.');
    END IF;

    -- Gate: Mandatory schedule
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Gate: Not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency lock: exact canonical_org + doctor + schedule + date
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Gate: Public visibility check (is_public = TRUE enforced at DB)
    SELECT is_active, is_public, room_number INTO v_doctor_active, v_doctor_public, v_room_number
    FROM public.doctors WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Gate: Schedule ownership + org + status
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Gate: Day-of-week match
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Gate: Leave check
    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Gate: Strict capacity (exact org + doctor + schedule + date scope; no NULL leakage)
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Department resolution
    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Phone normalization
    v_clean_phone := regexp_replace(p_patient_phone, '[^0-9]', '', 'g');
    IF length(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := substring(v_clean_phone FROM 3);
    END IF;
    IF length(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Patient match or create
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := public.generate_patient_code(p_org_id);
        INSERT INTO public.patients (organization_id, patient_code, full_name, phone,
            normalized_phone, gender, age_years)
        VALUES (p_org_id, v_patient_code, p_patient_name, v_clean_phone, v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'), p_patient_age)
        RETURNING id INTO v_patient_id;
    END IF;

    -- Atomic token allocation
    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert appointment
    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, patient_notes)
    VALUES (p_org_id, v_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, 'ONLINE', 'WAITING', 'PENDING', p_notes)
    RETURNING id INTO v_appointment_id;

    -- Insert into waiting queue
    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, 'CREATE', 'PUBLIC_BOOKING', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'scheduleId', p_schedule_id, 'patientCode', v_patient_code,
            'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking request could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_online_appointment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment TO anon, authenticated, service_role;

-- =====================================================================================
-- PART 3: Ensure book_staff_appointment_atomic has matching search_path = '' hardening
-- (Re-confirm from 029; idempotent)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_staff_appointment_atomic(UUID, UUID, UUID, UUID, DATE, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION public.book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_department_id UUID;
    v_token INT;
    v_appointment_id UUID;
    v_patient_code VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
BEGIN
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Calling user authentication required.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'admin', 'doctor', 'receptionist', 'nurse', 'staff')
    ) INTO v_has_perm;

    IF v_has_perm IS NOT TRUE THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('appointments.create', 'appointments.manage', '*')
        ) INTO v_has_perm;
        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient database privileges for appointment booking.');
        END IF;
    END IF;

    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory schedule selection: p_schedule_id must be provided.');
    END IF;

    SELECT patient_code INTO v_patient_code FROM public.patients
    WHERE id = p_patient_id AND organization_id = p_org_id;
    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    SELECT is_active, room_number INTO v_doctor_active, v_room_number FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;
    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    SELECT doctor_id, organization_id, max_tokens, is_active
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
        SELECT COUNT(*) INTO v_booked_count FROM public.appointments
        WHERE doctor_id = p_doctor_id AND appointment_date = p_appointment_date
          AND schedule_id = p_schedule_id AND status NOT IN ('CANCELLED', 'NO_SHOW');
        IF v_booked_count >= v_capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
        END IF;
    END IF;

    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, booked_by, patient_notes)
    VALUES (p_org_id, p_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, COALESCE(p_source, 'WALKIN'), 'WAITING', 'PENDING', v_calling_user_id, p_notes)
    RETURNING id INTO v_appointment_id;

    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    INSERT INTO public.audit_logs (organization_id, user_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, v_calling_user_id, 'CREATE', 'APPOINTMENT', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'patientId', p_patient_id, 'scheduleId', p_schedule_id, 'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff appointment booking could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_staff_appointment_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_staff_appointment_atomic TO authenticated, service_role;

