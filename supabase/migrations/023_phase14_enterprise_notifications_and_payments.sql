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
