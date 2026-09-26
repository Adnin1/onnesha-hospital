-- Migration 071: 20260926060000_arch_core_subfeature_extensions.sql
-- Arch Requirements Extensions for Core Hospital Modules:
-- 1. OPD Health Packages: health_packages, patient_package_subscriptions, package_utilization_logs
-- 2. IPD Clinical Diet: patient_diet_charts (meal schedule, restrictions, daily status)
-- 3. Inpatient Doctor Ward Progress & Orders: inpatient_progress_notes, inpatient_doctor_orders
-- 4. Reagent Stock Management: pathology_reagent_lots, pathology_reagent_consumption
-- 5. Radiology Film/Media Inventory & Consumption: radiology_media_stock, radiology_media_consumption
-- 6. Doctor Accounts & Settlement: doctor_accounts, doctor_fee_settlements
-- 7. HR Leave & Loan Management: employee_leave_balances, employee_leave_applications, employee_loans, employee_loan_repayments
-- 8. Fixed Asset Licenses & Documents: hospital_licenses, hospital_license_renewals
-- 9. Marketing & CRM Corporate Clients: corporate_clients, corporate_contracts, corporate_beneficiaries, patient_crm_followups

-- Section 1: OPD Health Packages
CREATE TABLE IF NOT EXISTS public.health_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    package_code VARCHAR(40) NOT NULL,
    package_name VARCHAR(200) NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    validity_days INT NOT NULL DEFAULT 365 CHECK (validity_days > 0),
    included_services JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {service_type: 'OPD'|'LAB'|'RAD', name: string, quota: number}
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT health_packages_org_code_key UNIQUE (organization_id, package_code)
);

CREATE TABLE IF NOT EXISTS public.patient_package_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.health_packages(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    subscription_number VARCHAR(50) NOT NULL,
    purchase_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    remaining_services JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pkg_sub_org_number_key UNIQUE (organization_id, subscription_number)
);

CREATE TABLE IF NOT EXISTS public.package_utilization_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES public.patient_package_subscriptions(id) ON DELETE CASCADE,
    service_type VARCHAR(30) NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    reference_id UUID, -- e.g. appointment_id or diagnostic_order_id
    used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    authorized_by UUID REFERENCES public.profiles(id)
);

-- Section 2: IPD Clinical Diet Management
CREATE TABLE IF NOT EXISTS public.patient_diet_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE CASCADE,
    diet_order VARCHAR(100) NOT NULL, -- 'Normal', 'Diabetic', 'Low Sodium', 'Liquid', 'Soft', 'NPO'
    dietary_restrictions TEXT,
    breakfast_plan TEXT,
    lunch_plan TEXT,
    dinner_plan TEXT,
    snack_plan TEXT,
    calories_target_kcal INT,
    ordered_by UUID NOT NULL REFERENCES public.profiles(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section 3: Inpatient Doctor Ward Progress Notes & Orders
CREATE TABLE IF NOT EXISTS public.inpatient_progress_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id),
    subjective TEXT,
    objective TEXT,
    assessment TEXT NOT NULL,
    plan TEXT NOT NULL,
    round_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inpatient_doctor_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id),
    order_type VARCHAR(40) NOT NULL CHECK (order_type IN ('MEDICATION', 'INVESTIGATION', 'NURSING', 'DIET', 'ACTIVITY', 'CONSULTATION')),
    order_details TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'CANCELLED')),
    executed_by UUID REFERENCES public.profiles(id),
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section 4: Pathology Reagent Stock & Consumption
CREATE TABLE IF NOT EXISTS public.pathology_reagent_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reagent_name VARCHAR(150) NOT NULL,
    lot_number VARCHAR(50) NOT NULL,
    tests_per_lot INT NOT NULL CHECK (tests_per_lot > 0),
    tests_remaining INT NOT NULL CHECK (tests_remaining >= 0),
    expiry_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reagent_org_lot_key UNIQUE (organization_id, lot_number)
);

CREATE TABLE IF NOT EXISTS public.pathology_reagent_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES public.pathology_reagent_lots(id) ON DELETE RESTRICT,
    diagnostic_order_id UUID,
    tests_deducted INT NOT NULL DEFAULT 1 CHECK (tests_deducted > 0),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_by UUID REFERENCES public.profiles(id)
);

-- Section 5: Radiology Media / Film Stock & Consumption
CREATE TABLE IF NOT EXISTS public.radiology_media_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    media_type VARCHAR(50) NOT NULL, -- 'FILM_8X10', 'FILM_10X12', 'FILM_14X17', 'CD_DVD', 'PAPER'
    current_quantity INT NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
    reorder_level INT NOT NULL DEFAULT 50 CHECK (reorder_level >= 0),
    unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rad_media_org_type_key UNIQUE (organization_id, media_type)
);

CREATE TABLE IF NOT EXISTS public.radiology_media_consumption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES public.radiology_media_stock(id) ON DELETE RESTRICT,
    study_id UUID REFERENCES public.radiology_studies(id) ON DELETE SET NULL,
    quantity_used INT NOT NULL DEFAULT 1 CHECK (quantity_used > 0),
    used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    technician_id UUID REFERENCES public.profiles(id)
);

-- Section 6: Doctor Accounts & Fee Settlements
CREATE TABLE IF NOT EXISTS public.doctor_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_consultation_earnings NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_consultation_earnings >= 0),
    total_surgery_earnings NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_surgery_earnings >= 0),
    total_settled NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_settled >= 0),
    current_payable NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (current_payable >= 0),
    last_settlement_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT doc_acc_org_doctor_key UNIQUE (organization_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS public.doctor_fee_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    settlement_number VARCHAR(40) NOT NULL,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (payment_mode IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MFS')),
    reference_number VARCHAR(100),
    settled_by UUID NOT NULL REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT doc_settle_org_number_key UNIQUE (organization_id, settlement_number)
);

-- Section 7: HR Leave Balances, Leave Applications & Employee Loans
CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,
    casual_leave_quota INT NOT NULL DEFAULT 10,
    casual_leave_taken INT NOT NULL DEFAULT 0,
    sick_leave_quota INT NOT NULL DEFAULT 14,
    sick_leave_taken INT NOT NULL DEFAULT 0,
    earned_leave_quota INT NOT NULL DEFAULT 15,
    earned_leave_taken INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT emp_leave_bal_org_year_key UNIQUE (organization_id, employee_id, fiscal_year)
);

CREATE TABLE IF NOT EXISTS public.employee_leave_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    leave_type VARCHAR(30) NOT NULL CHECK (leave_type IN ('CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'UNPAID')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INT NOT NULL CHECK (total_days > 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    loan_number VARCHAR(40) NOT NULL,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    principal_amount NUMERIC(12, 2) NOT NULL CHECK (principal_amount > 0),
    monthly_installment NUMERIC(12, 2) NOT NULL CHECK (monthly_installment > 0),
    repaid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (repaid_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'SETTLED', 'DEFAULTED')),
    approved_by UUID REFERENCES public.profiles(id),
    disbursed_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT emp_loan_org_number_key UNIQUE (organization_id, loan_number)
);

CREATE TABLE IF NOT EXISTS public.employee_loan_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    loan_id UUID NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
    repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payroll_cycle VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section 8: Fixed Asset Licenses & Document Compliance
CREATE TABLE IF NOT EXISTS public.hospital_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    license_type VARCHAR(100) NOT NULL, -- 'DGHS_HOSPITAL_LICENSE', 'FIRE_SAFETY', 'ATOMIC_ENERGY_AERB', 'NARCOTICS_PERMIT', 'TRADE_LICENSE', 'ENVIRONMENTAL_CLEARANCE'
    license_number VARCHAR(100) NOT NULL,
    issuing_authority VARCHAR(150) NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    renewal_reminder_days INT NOT NULL DEFAULT 30,
    status VARCHAR(20) NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'RENEWAL_APPLIED')),
    document_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hosp_lic_org_number_key UNIQUE (organization_id, license_number)
);

-- Section 9: Marketing & CRM Corporate Clients & Patient Follow-ups
CREATE TABLE IF NOT EXISTS public.corporate_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name VARCHAR(200) NOT NULL,
    company_code VARCHAR(40) NOT NULL,
    contact_person VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    contact_email VARCHAR(100),
    credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
    current_receivable NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (current_receivable >= 0),
    discount_rate_opd NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_rate_opd BETWEEN 0 AND 100),
    discount_rate_ipd NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_rate_ipd BETWEEN 0 AND 100),
    discount_rate_diag NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_rate_diag BETWEEN 0 AND 100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT corp_client_org_code_key UNIQUE (organization_id, company_code)
);

CREATE TABLE IF NOT EXISTS public.corporate_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    corporate_id UUID NOT NULL REFERENCES public.corporate_clients(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    employee_id_at_corp VARCHAR(50),
    relation_to_employee VARCHAR(30) NOT NULL DEFAULT 'SELF' CHECK (relation_to_employee IN ('SELF', 'SPOUSE', 'CHILD', 'PARENT')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT corp_beneficiary_unique UNIQUE (organization_id, corporate_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.patient_crm_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    followup_type VARCHAR(40) NOT NULL CHECK (followup_type IN ('POST_OP', 'DISCHARGE', 'CHRONIC_CARE', 'MISSED_APPOINTMENT', 'FEEDBACK')),
    scheduled_date DATE NOT NULL,
    assigned_to UUID REFERENCES public.profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'UNREACHABLE', 'CANCELLED')),
    outcome_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Section 10: Row Level Security Policies for All New Tables
ALTER TABLE public.health_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_package_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_utilization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diet_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inpatient_progress_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inpatient_doctor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathology_reagent_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathology_reagent_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_media_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_media_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_fee_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_crm_followups ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy Generator Macro Function for standard tenant isolation
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'health_packages', 'patient_package_subscriptions', 'package_utilization_logs',
        'patient_diet_charts', 'inpatient_progress_notes', 'inpatient_doctor_orders',
        'pathology_reagent_lots', 'pathology_reagent_consumption',
        'radiology_media_stock', 'radiology_media_consumption',
        'doctor_accounts', 'doctor_fee_settlements',
        'employee_leave_balances', 'employee_leave_applications',
        'employee_loans', 'employee_loan_repayments',
        'hospital_licenses', 'corporate_clients', 'corporate_beneficiaries',
        'patient_crm_followups'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
        EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid, private.get_current_org_id()))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
        EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid, private.get_current_org_id()))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
        EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid, private.get_current_org_id())) WITH CHECK (organization_id = COALESCE(NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid, private.get_current_org_id()))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
        EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE USING (organization_id = COALESCE(NULLIF(current_setting(''app.current_organization_id'', true), '''')::uuid, private.get_current_org_id()))', t, t);
    END LOOP;
END $$;
