-- =====================================================================================
-- 002_ORGANIZATIONS.sql
-- Multi-tenant foundation: Organizations, settings, branches, and organization users.
-- =====================================================================================

-- 1. Organizations (Hospital Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(30),
    email VARCHAR(150),
    address TEXT,
    logo_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organization Settings (Branding, Timezone, Pad Margins, Hotlines)
CREATE TABLE IF NOT EXISTS organization_settings (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Dhaka',
    patient_id_prefix VARCHAR(10) NOT NULL DEFAULT 'OH-P-',
    invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'OH-INV-',
    emergency_hotline VARCHAR(30) DEFAULT '01712-345678',
    ambulance_hotline VARCHAR(30) DEFAULT '01800-445566',
    pad_top_margin_cm NUMERIC(4, 2) DEFAULT 3.5,
    pad_bottom_margin_cm NUMERIC(4, 2) DEFAULT 2.5,
    sms_sender_id VARCHAR(30) DEFAULT 'ONNESHA',
    max_cashier_discount_pct NUMERIC(5, 2) DEFAULT 10.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Organization Branches (For future multi-branch hospital support)
CREATE TABLE IF NOT EXISTS organization_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_name VARCHAR(150) NOT NULL,
    branch_code VARCHAR(30) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, branch_code)
);
