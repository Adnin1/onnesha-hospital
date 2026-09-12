-- =====================================================================================
-- 012_PHARMACY_LEDGER.sql
-- Pharmacy inventory, generics, brands, suppliers, purchase orders, sales, and FIFO stock ledger.
-- Never relies on simple quantity mutation; all changes are traceable transactions.
-- =====================================================================================

-- 1. Medicine Generics
CREATE TABLE IF NOT EXISTS medicine_generics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name VARCHAR(150) NOT NULL UNIQUE,
    therapeutic_class VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Medicine Categories & Forms (Tablet, Syrup, Injection, Ointment)
CREATE TABLE IF NOT EXISTS medicine_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Medicine Suppliers
CREATE TABLE IF NOT EXISTS medicine_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    company_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Medicine Brands Master
CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    generic_id UUID NOT NULL REFERENCES medicine_generics(id),
    category_id UUID REFERENCES medicine_categories(id),
    brand_name VARCHAR(150) NOT NULL,
    dosage_form VARCHAR(50) NOT NULL, -- Tablet, Capsule, Suspension, Injection
    strength VARCHAR(50) NOT NULL, -- 500mg, 10mg, 250ml
    manufacturer VARCHAR(150) NOT NULL, -- Square, Beximco, Incepta
    unit_type VARCHAR(30) NOT NULL DEFAULT 'PIECE', -- Piece, Box, Strip, Bottle
    min_stock_alert INT NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, brand_name, dosage_form, strength)
);

-- 5. Medicine Batches
CREATE TABLE IF NOT EXISTS medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    purchase_rate NUMERIC(10, 2) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    current_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, medicine_id, batch_number)
);

-- 6. Supplier Purchase Orders & Receiving
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES medicine_suppliers(id),
    po_number VARCHAR(30) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'RECEIVED', 'PARTIAL', 'CANCELLED')),
    ordered_by UUID REFERENCES profiles(id),
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicines(id),
    quantity_ordered INT NOT NULL,
    quantity_received INT NOT NULL DEFAULT 0,
    unit_cost NUMERIC(10, 2) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Pharmacy Sales Orders
CREATE TABLE IF NOT EXISTS pharmacy_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    sale_number VARCHAR(30) NOT NULL,
    patient_id UUID REFERENCES patients(id),
    prescription_id UUID REFERENCES prescriptions(id),
    invoice_id UUID REFERENCES invoices(id),
    total_amount NUMERIC(12, 2) NOT NULL,
    sold_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, sale_number)
);

-- 8. Immutable Double-Entry Stock Ledger
CREATE TABLE IF NOT EXISTS stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'SALE', 'SALE_RETURN', 'SUPPLIER_RETURN', 'DAMAGE', 'EXPIRED', 'ADJUSTMENT')),
    quantity_in INT NOT NULL DEFAULT 0,
    quantity_out INT NOT NULL DEFAULT 0,
    running_balance INT NOT NULL,
    reference_id UUID, -- Links to purchase_order_id, pharmacy_sale_id, etc.
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Stock Adjustments (Physical inventory audit discrepancies)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
    old_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    variance INT NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
