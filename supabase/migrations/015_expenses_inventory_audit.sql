-- =====================================================================================
-- 015_EXPENSES_INVENTORY_NOTIFICATIONS_AUDIT.sql
-- Expenses, hospital operational inventory, multi-provider SMS logs, and immutable audit vault.
-- =====================================================================================

-- 1. Operational Expenses
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    voucher_number VARCHAR(50),
    paid_to VARCHAR(150),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. General Hospital Inventory (Bed linen, surgical consumables, stationeries)
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    item_name VARCHAR(150) NOT NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'PIECE',
    min_stock_alert INT NOT NULL DEFAULT 10,
    current_quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'ISSUE_TO_WARD', 'ISSUE_TO_OT', 'DAMAGE', 'ADJUSTMENT')),
    quantity INT NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Multi-Provider SMS Engine
CREATE TABLE IF NOT EXISTS sms_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    provider_name VARCHAR(50) NOT NULL, -- SSL Wireless, Greenweb, Infobip, Twilio
    api_url TEXT NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    recipient_phone VARCHAR(20) NOT NULL,
    message_text TEXT NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- APPOINTMENT_CONFIRM, TOKEN_ALERT, LAB_READY, BILL_RECEIPT
    status VARCHAR(20) NOT NULL DEFAULT 'SENT' CHECK (status IN ('QUEUED', 'SENT', 'FAILED')),
    gateway_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Immutable Audit Vault
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, VOID, REFUND, VERIFY
    module VARCHAR(50) NOT NULL, -- BILLING, PATIENT, PHARMACY, LAB, IPD, IAM
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revoke mutation rights on audit_logs
REVOKE UPDATE, DELETE ON audit_logs FROM public;
