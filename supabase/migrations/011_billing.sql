-- =====================================================================================
-- 011_BILLING_AND_ACCOUNTS.sql
-- Invoices, items, payments, payment methods, discounts, refunds, dues, and cash transactions.
-- Non-destructive financial architecture with strict supervisory audits.
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS invoice_code_seq START WITH 100001;
CREATE SEQUENCE IF NOT EXISTS payment_receipt_seq START WITH 100001;

-- 1. Invoices Master
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(30) NOT NULL, -- e.g. OH-INV-100001
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES patient_visits(id),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_reason TEXT,
    discount_approved_by UUID REFERENCES profiles(id),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED', 'VOID')),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    voided_by UUID REFERENCES profiles(id),
    void_reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, invoice_number)
);

-- 2. Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    service_category VARCHAR(30) NOT NULL CHECK (service_category IN ('CONSULTATION', 'LAB', 'XRAY', 'USG', 'ECG', 'PHARMACY', 'BED', 'CABIN', 'OT', 'AMBULANCE', 'MISC')),
    reference_id UUID, -- Links to appointment_id, diagnostic_order_item_id, batch_id, etc.
    item_name VARCHAR(200) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Payments Ledger (Multiple partial payments per invoice)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(30) NOT NULL,
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'VISA', 'MASTERCARD', 'BANK_TRANSFER')),
    amount NUMERIC(12, 2) NOT NULL,
    gateway_transaction_id VARCHAR(100),
    cashier_id UUID NOT NULL REFERENCES profiles(id),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Refunds & Voids Ledger (Strict supervisor tracking)
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    refund_receipt_number VARCHAR(30) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    refund_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES profiles(id),
    processed_by UUID NOT NULL REFERENCES profiles(id),
    refunded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Daily Cash Register Hand-overs (Shift closing)
CREATE TABLE IF NOT EXISTS cash_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES profiles(id),
    shift_start TIMESTAMPTZ NOT NULL,
    shift_end TIMESTAMPTZ,
    opening_float NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mfs_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_handed_over NUMERIC(12, 2),
    supervisor_verified_by UUID REFERENCES profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RECONCILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
