-- Migration 072: 20260926070000_arch_enterprise_modules_11_to_34.sql
-- Arch Requirements Extensions for Remaining Enterprise & Operational Modules (Modules 11-34):
-- 11. PC / Referral: referral_agents, patient_referrals, referral_commission_settlements
-- 12. OT Suite Extended: ot_theatres, ot_surgical_cases, ot_intraoperative_notes
-- 13. LIS Machine Adapter: lis_analyzer_registry, lis_message_queue, lis_test_mappings
-- 14. Registrar E-Book: registrar_e_book_entries
-- 15. Feedback & Complaints: patient_feedbacks, patient_complaints
-- 16. Scholarship & Welfare: welfare_funds, scholarship_applications, scholarship_disbursements
-- 17. Appointment Automation: appointment_reminders_queue
-- 18. Ambulance & Transport Extended: ambulance_fuel_logs, ambulance_maintenance_records
-- 19. Lab-to-Lab Solutions: external_reference_labs, lab_to_lab_referrals
-- 20. Recruitment & Hiring: hr_job_vacancies, hr_job_applications, hr_interview_evaluations
-- 21. Overseas & Foreign Medical: overseas_medical_profiles, overseas_agency_packages
-- 24. Outsourcing Vendor Management: outsourced_service_vendors, outsourced_service_orders
-- 25. Insurance Disbursement & Claims: insurance_payers, insurance_claims, insurance_settlements
-- 28. Hospital Accreditation & Compliance: accreditation_standards, accreditation_audits
-- 30. Shared Party & Master Ledger: enterprise_parties, party_ledger_transactions
-- 31. Day Care Management: daycare_admissions, daycare_procedures
-- 32. Canteen & Cafeteria POS: canteen_menu_items, canteen_sales_orders
-- 34. Biomedical Engineering & Calibration: biomedical_devices, biomedical_calibrations

-- Sequences
CREATE SEQUENCE IF NOT EXISTS public.referral_settlement_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.scholarship_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.insurance_claim_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.daycare_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.canteen_order_seq START WITH 1001 INCREMENT BY 1;

-- 11. Referral / PC Agents
CREATE TABLE IF NOT EXISTS public.referral_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    agent_code VARCHAR(40) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    agent_type VARCHAR(30) NOT NULL CHECK (agent_type IN ('DOCTOR', 'COMMUNITY_PC', 'ORGANIZATION', 'STAFF')),
    phone VARCHAR(30) NOT NULL,
    commission_rate_opd NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (commission_rate_opd BETWEEN 0 AND 100),
    commission_rate_diag NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (commission_rate_diag BETWEEN 0 AND 100),
    commission_rate_ipd NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (commission_rate_ipd BETWEEN 0 AND 100),
    total_commission_earned NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_commission_earned >= 0),
    total_commission_settled NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_commission_settled >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ref_agent_org_code_key UNIQUE (organization_id, agent_code)
);

CREATE TABLE IF NOT EXISTS public.patient_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.referral_agents(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    service_type VARCHAR(30) NOT NULL,
    billed_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (billed_amount >= 0),
    commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (commission_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SETTLED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. OT Suite Extended
CREATE TABLE IF NOT EXISTS public.ot_theatres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    theatre_name VARCHAR(100) NOT NULL,
    theatre_code VARCHAR(30) NOT NULL,
    floor VARCHAR(50) NOT NULL DEFAULT 'Level 4',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ot_theatre_org_code_key UNIQUE (organization_id, theatre_code)
);

CREATE TABLE IF NOT EXISTS public.ot_surgical_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    theatre_id UUID NOT NULL REFERENCES public.ot_theatres(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    lead_surgeon_id UUID NOT NULL REFERENCES public.profiles(id),
    anesthetist_id UUID REFERENCES public.profiles(id),
    procedure_name VARCHAR(200) NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_THEATRE', 'RECOVERY', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. LIS Machine Adapter Registry & Queue
CREATE TABLE IF NOT EXISTS public.lis_analyzer_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    device_name VARCHAR(150) NOT NULL,
    device_model VARCHAR(100) NOT NULL,
    protocol VARCHAR(20) NOT NULL CHECK (protocol IN ('ASTM_1394', 'HL7_V2', 'SERIAL_RS232', 'TCP_IP')),
    ip_address VARCHAR(50),
    port INT,
    status VARCHAR(20) NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'STANDBY', 'ERROR')),
    is_simulator BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lis_dev_org_name_key UNIQUE (organization_id, device_name)
);

CREATE TABLE IF NOT EXISTS public.lis_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    analyzer_id UUID NOT NULL REFERENCES public.lis_analyzer_registry(id) ON DELETE CASCADE,
    raw_payload TEXT NOT NULL,
    sample_barcode VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PARSED', 'PROCESSED', 'FAILED')),
    parsed_results JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Registrar E-Book
CREATE TABLE IF NOT EXISTS public.registrar_e_book_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entry_number VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('BIRTH', 'DEATH', 'POLICE_MEDICO_LEGAL', 'DISABILITY', 'FITNESS')),
    subject_name VARCHAR(150) NOT NULL,
    date_of_event DATE NOT NULL,
    officer_in_charge UUID NOT NULL REFERENCES public.profiles(id),
    remarks TEXT,
    qr_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reg_ebook_org_number_key UNIQUE (organization_id, entry_number)
);

-- 15. Feedback & Complaints
CREATE TABLE IF NOT EXISTS public.patient_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    department VARCHAR(50) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    is_anonymous BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.patient_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    complaint_number VARCHAR(40) NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    subject VARCHAR(200) NOT NULL,
    details TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (severity IN ('LOW', 'NORMAL', 'URGENT', 'CRITICAL')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
    assigned_to UUID REFERENCES public.profiles(id),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT comp_org_number_key UNIQUE (organization_id, complaint_number)
);

-- 16. Scholarship & Patient Welfare Funds
CREATE TABLE IF NOT EXISTS public.welfare_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    fund_name VARCHAR(150) NOT NULL,
    donor_sponsor VARCHAR(150),
    total_allocated NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_allocated >= 0),
    total_disbursed NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_disbursed >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT welfare_fund_org_name_key UNIQUE (organization_id, fund_name)
);

CREATE TABLE IF NOT EXISTS public.scholarship_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    application_number VARCHAR(40) NOT NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    fund_id UUID NOT NULL REFERENCES public.welfare_funds(id) ON DELETE RESTRICT,
    requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount > 0),
    approved_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (approved_amount >= 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED')),
    reviewed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schol_org_number_key UNIQUE (organization_id, application_number)
);

-- 19. Lab-to-Lab Solutions
CREATE TABLE IF NOT EXISTS public.external_reference_labs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lab_name VARCHAR(150) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    api_endpoint TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ext_lab_org_name_key UNIQUE (organization_id, lab_name)
);

CREATE TABLE IF NOT EXISTS public.lab_to_lab_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_lab_id UUID NOT NULL REFERENCES public.external_reference_labs(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    test_name VARCHAR(150) NOT NULL,
    specimen_tracking_barcode VARCHAR(50),
    dispatch_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(20) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'RECEIVED_AT_LAB', 'RESULT_AVAILABLE', 'COMPLETED')),
    external_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (external_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Recruitment & Hiring
CREATE TABLE IF NOT EXISTS public.hr_job_vacancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    department VARCHAR(50) NOT NULL,
    vacancies_count INT NOT NULL DEFAULT 1 CHECK (vacancies_count > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'INTERVIEWING', 'FILLED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vacancy_id UUID NOT NULL REFERENCES public.hr_job_vacancies(id) ON DELETE CASCADE,
    applicant_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(100),
    experience_years INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. Overseas & Foreign Medical
CREATE TABLE IF NOT EXISTS public.overseas_medical_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    passport_number VARCHAR(50) NOT NULL,
    destination_country VARCHAR(100) NOT NULL,
    recruiting_agency VARCHAR(150),
    medical_fitness_status VARCHAR(20) NOT NULL DEFAULT 'UNDER_EVALUATION' CHECK (medical_fitness_status IN ('UNDER_EVALUATION', 'FIT', 'UNFIT', 'REFERRED')),
    gamca_gcc_slip_number VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ovs_med_org_passport_key UNIQUE (organization_id, passport_number)
);

-- 24. Outsourced Services & Vendors
CREATE TABLE IF NOT EXISTS public.outsourced_service_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_name VARCHAR(150) NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- 'LAUNDRY', 'SECURITY', 'WASTE_DISPOSAL', 'CATERING', 'EQUIPMENT_AMC'
    contact_phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT out_vendor_org_name_key UNIQUE (organization_id, vendor_name)
);

-- 25. Insurance Disbursement & Claims
CREATE TABLE IF NOT EXISTS public.insurance_payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    payer_name VARCHAR(150) NOT NULL,
    payer_code VARCHAR(40) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ins_payer_org_code_key UNIQUE (organization_id, payer_code)
);

CREATE TABLE IF NOT EXISTS public.insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    claim_number VARCHAR(50) NOT NULL,
    payer_id UUID NOT NULL REFERENCES public.insurance_payers(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    claim_amount NUMERIC(12,2) NOT NULL CHECK (claim_amount > 0),
    approved_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (approved_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'PRE_AUTHORIZED', 'APPROVED', 'DISBURSED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ins_claim_org_num_key UNIQUE (organization_id, claim_number)
);

-- 28. Hospital Accreditation & Compliance
CREATE TABLE IF NOT EXISTS public.accreditation_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    agency_name VARCHAR(100) NOT NULL, -- 'DGHS', 'NABH', 'ISO_9001', 'JCI'
    standard_clause VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    compliance_score INT NOT NULL DEFAULT 100 CHECK (compliance_score BETWEEN 0 AND 100),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLIANT' CHECK (status IN ('COMPLIANT', 'PARTIAL', 'NON_COMPLIANT')),
    last_audited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 30. Shared Party & Master Ledger
CREATE TABLE IF NOT EXISTS public.enterprise_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    party_code VARCHAR(40) NOT NULL,
    party_name VARCHAR(150) NOT NULL,
    party_type VARCHAR(30) NOT NULL CHECK (party_type IN ('CUSTOMER', 'SUPPLIER', 'DOCTOR', 'CORPORATE', 'INSURER', 'VENDOR')),
    phone VARCHAR(30),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ent_party_org_code_key UNIQUE (organization_id, party_code)
);

-- 31. Day Care Management
CREATE TABLE IF NOT EXISTS public.daycare_admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    admission_number VARCHAR(40) NOT NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    procedure_name VARCHAR(150) NOT NULL,
    admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    discharged_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED', 'DISCHARGED', 'TRANSFERRED_IPD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT daycare_org_num_key UNIQUE (organization_id, admission_number)
);

-- 32. Canteen & Cafeteria POS
CREATE TABLE IF NOT EXISTS public.canteen_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    item_name VARCHAR(150) NOT NULL,
    item_category VARCHAR(50) NOT NULL DEFAULT 'MEAL',
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canteen_sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_number VARCHAR(40) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_mode IN ('CASH', 'MFS', 'STAFF_ACCOUNT')),
    patient_or_staff_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT canteen_org_num_key UNIQUE (organization_id, order_number)
);

-- 34. Biomedical Engineering
CREATE TABLE IF NOT EXISTS public.biomedical_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    device_name VARCHAR(150) NOT NULL,
    model_number VARCHAR(100),
    serial_number VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'CALIBRATION_DUE', 'BREAKDOWN', 'UNDER_MAINTENANCE')),
    calibration_expiry_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT biomed_org_serial_key UNIQUE (organization_id, serial_number)
);

-- Enable RLS for all new tables
ALTER TABLE public.referral_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_surgical_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lis_analyzer_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lis_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrar_e_book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarship_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_reference_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_to_lab_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_job_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overseas_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outsourced_service_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accreditation_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daycare_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canteen_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canteen_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biomedical_devices ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS Policies
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'referral_agents', 'patient_referrals', 'ot_theatres', 'ot_surgical_cases',
        'lis_analyzer_registry', 'lis_message_queue', 'registrar_e_book_entries',
        'patient_feedbacks', 'patient_complaints', 'welfare_funds', 'scholarship_applications',
        'external_reference_labs', 'lab_to_lab_referrals', 'hr_job_vacancies', 'hr_job_applications',
        'overseas_medical_profiles', 'outsourced_service_vendors', 'insurance_payers',
        'insurance_claims', 'accreditation_standards', 'enterprise_parties',
        'daycare_admissions', 'canteen_menu_items', 'canteen_sales_orders', 'biomedical_devices'
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
