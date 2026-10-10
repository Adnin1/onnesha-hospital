-- =====================================================================================
-- Migration 143: 20261011030000_billing_expenses_and_ipd_discharge.sql
-- 1. Fix RLS on discharge_summaries and add comprehensive clinical & doctor fields
-- 2. Create hospital_service_tariffs table for customizable pricing catalog
-- 3. Enhance expenses and expense_categories schema, seed standard categories, and add aggregation functions
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. DISCHARGE SUMMARIES RLS FIX & CLINICAL ATTRIBUTES
-- -------------------------------------------------------------------------------------

-- Ensure organization_id exists on discharge_summaries
ALTER TABLE IF EXISTS public.discharge_summaries 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from patient_visits where missing
UPDATE public.discharge_summaries ds
SET organization_id = pv.organization_id
FROM public.patient_visits pv
WHERE ds.visit_id = pv.id AND ds.organization_id IS NULL;

-- Add comprehensive clinical and doctor fields for authentic 4-part Onnesha Hospital certificate
ALTER TABLE IF EXISTS public.discharge_summaries
ADD COLUMN IF NOT EXISTS consultant_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS consultant_doctor_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS consultant_doctor_bmdc VARCHAR(50),
ADD COLUMN IF NOT EXISTS consultant_doctor_specialty VARCHAR(150),
ADD COLUMN IF NOT EXISTS duty_doctor_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS presenting_features JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS investigations_summary TEXT,
ADD COLUMN IF NOT EXISTS ot_details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS baby_note JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS discharge_medications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS advice_instructions JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS on discharge_summaries
ALTER TABLE public.discharge_summaries ENABLE ROW LEVEL SECURITY;

-- Clean existing policies on discharge_summaries to prevent duplicates
DROP POLICY IF EXISTS rls_discharge_summaries ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_select ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_insert ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_update ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_delete ON public.discharge_summaries;

-- Multi-tenant Row-Level Security Policies for discharge_summaries
CREATE POLICY rls_discharge_summaries ON public.discharge_summaries
FOR ALL TO authenticated, service_role
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
    OR visit_id IN (
        SELECT id FROM public.patient_visits 
        WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
)
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
    OR visit_id IN (
        SELECT id FROM public.patient_visits 
        WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- Explicit Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discharge_summaries TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. CUSTOMIZABLE HOSPITAL SERVICE TARIFFS & PRICING
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hospital_service_tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    service_code VARCHAR(100) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'CONSULTATION', 'IPD_BED', 'ADMISSION', 'CRITICAL_CARE', 'OT_SURGERY', 'PROCEDURE', 'MISC'
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    unit VARCHAR(50) DEFAULT 'Per Service',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_tariff UNIQUE (organization_id, service_code)
);

-- Enable RLS on hospital_service_tariffs
ALTER TABLE public.hospital_service_tariffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_hospital_service_tariffs ON public.hospital_service_tariffs;
CREATE POLICY rls_hospital_service_tariffs ON public.hospital_service_tariffs
FOR ALL TO authenticated, service_role
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospital_service_tariffs TO authenticated, service_role;

-- Pre-seed default service tariffs for all existing organizations idempotently
INSERT INTO public.hospital_service_tariffs (organization_id, service_code, service_name, category, price, unit, description)
SELECT 
    o.id,
    t.service_code,
    t.service_name,
    t.category,
    t.price,
    t.unit,
    t.description
FROM public.organizations o
CROSS JOIN (
    VALUES
        ('SRV-OPD-GEN', 'General OPD Medical Officer Consultation', 'CONSULTATION', 500.00, 'Per Visit', 'General outpatient consultation'),
        ('SRV-OPD-SPEC', 'Specialist Consultant Consultation', 'CONSULTATION', 800.00, 'Per Visit', 'Visiting/Assistant Professor Specialist OPD'),
        ('SRV-OPD-PROF', 'Senior Professor Specialist Consultation', 'CONSULTATION', 1200.00, 'Per Visit', 'Department Head/Professor specialist consultation'),
        ('SRV-ADM-REG', 'Inpatient Admission & Registration Fee', 'ADMISSION', 500.00, 'Per Admission', 'IPD file opening and admission administrative intake'),
        ('SRV-BED-GEN', 'General Ward Bed Charge', 'IPD_BED', 600.00, 'Per Day', 'Standard male/female inpatient general ward bed'),
        ('SRV-CAB-NONAC', 'Single Cabin (Non-AC)', 'IPD_BED', 1500.00, 'Per Day', 'Private non-air-conditioned patient room'),
        ('SRV-CAB-AC', 'Deluxe AC Cabin', 'IPD_BED', 2500.00, 'Per Day', 'Air-conditioned private room with attached washroom'),
        ('SRV-CAB-VIP', 'Executive VIP Suite Cabin', 'IPD_BED', 4500.00, 'Per Day', 'VIP cabin with patient attendant suite'),
        ('SRV-ICU-BED', 'Intensive Care Unit (ICU) Bed', 'CRITICAL_CARE', 5000.00, 'Per Day', 'ICU bed with invasive ventilator & continuous monitoring'),
        ('SRV-CCU-BED', 'Coronary Care Unit (CCU) Bed', 'CRITICAL_CARE', 4500.00, 'Per Day', 'Cardiac telemetry & intensive coronary monitoring'),
        ('SRV-HDU-BED', 'High Dependency Unit (HDU) Bed', 'CRITICAL_CARE', 3500.00, 'Per Day', 'Step-down critical care monitoring bed'),
        ('SRV-NICU-BED', 'Neonatal Intensive Care Unit (NICU) Bed', 'CRITICAL_CARE', 4000.00, 'Per Day', 'Phototherapy and neonatal incubator bed'),
        ('SRV-OT-MAJ', 'Major Operation Theatre (OT) Charge', 'OT_SURGERY', 5000.00, 'Per Procedure', 'Major surgical theater facility, equipment & sterilization'),
        ('SRV-OT-MIN', 'Minor Operation Theatre (OT) Charge', 'OT_SURGERY', 2500.00, 'Per Procedure', 'Minor surgical suite for day procedures'),
        ('SRV-ANES-MAJ', 'General Anaesthesia Monitoring Charge', 'PROCEDURE', 3000.00, 'Per Procedure', 'Anaesthetic machine & specialized gas administration')
) AS t(service_code, service_name, category, price, unit, description)
ON CONFLICT (organization_id, service_code) DO NOTHING;

-- -------------------------------------------------------------------------------------
-- 3. EXPENSE MANAGEMENT ENHANCEMENTS
-- -------------------------------------------------------------------------------------

-- Ensure expense_categories has description, code, is_active
ALTER TABLE IF EXISTS public.expense_categories
ADD COLUMN IF NOT EXISTS category_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS on expense_categories if not already enabled
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_expense_categories ON public.expense_categories;
CREATE POLICY rls_expense_categories ON public.expense_categories
FOR ALL TO authenticated, service_role
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated, service_role;

-- Pre-seed 20+ comprehensive hospital expense categories idempotently
INSERT INTO public.expense_categories (organization_id, category_code, name, description)
SELECT 
    o.id,
    c.category_code,
    c.name,
    c.description
FROM public.organizations o
CROSS JOIN (
    VALUES
        ('CAT-DOC-DUTY', 'Doctor Payment (Per Duty / Shift)', 'Shift-wise medical officer and resident duty doctor compensation'),
        ('CAT-DOC-SERV', 'Doctor Payment (Per Consultation / Procedure)', 'Procedure and specialist service fee share per clinical encounter'),
        ('CAT-DOC-MTH', 'Doctor Monthly Honorarium / Salary', 'Fixed monthly retainer, salary, and consultant honorarium'),
        ('CAT-ASST-CHG', 'Assistant Charges', 'Clinical and surgical assistant fee distribution'),
        ('CAT-DOC-ASST', 'Doctor Assistant Charges', 'Designated doctor clinical assistant charges'),
        ('CAT-ANES-CHG', 'Anesthesiologist & Anesthetic Charges', 'Anesthesia specialist fees and anesthetic administration charges'),
        ('CAT-OT-MED', 'Operation Theatre Medicine & Consumables', 'OT surgical disposables, sutures, gases, and specialized consumables'),
        ('CAT-GEN-MED', 'General Hospital Medicines & Consumables', 'Floor consumables, cotton, gauze, syringes, and clinical supplies'),
        ('CAT-USG-EXP', 'Ultrasonography & Diagnostic Expenses', 'Radiology imaging consumables, ultrasound gels, and sonologist shares'),
        ('CAT-LAB-EXP', 'Laboratory & Diagnostic Expenses', 'Pathology laboratory reagents, test kits, blood tubes, and controls'),
        ('CAT-FOOD-CAT', 'Food & Catering Expenses', 'Patient inpatient diet, staff canteen supplies, and clinical meals'),
        ('CAT-TRV-TRN', 'Travel & Transport Costs', 'Official ambulance fuel, staff conveyance, and transport charges'),
        ('CAT-MKT-ADV', 'Marketing & Advertising', 'Signage, hospital awareness campaigns, leaflets, and media advertising'),
        ('CAT-STF-SAL', 'Staff Salaries & Administrative Payroll', 'Nurses, ward boys, technicians, cashiers, and administrative staff wages'),
        ('CAT-REF-AGT', 'Referral & Partner Commissions', 'Documented referral partner facilitation and agent disbursements'),
        ('CAT-MGT-ADM', 'Hospital Administration & Management', 'Office stationeries, software subscriptions, licensing, and trade permits'),
        ('CAT-VOU-EXP', 'Voucher & Petty Cash Expenses', 'Daily emergency cash vouchers, laundry, and miscellaneous sundries'),
        ('CAT-UTL-RNT', 'Utilities, Rent & Building Maintenance', 'Electricity bill, generator diesel, building rent, water, and sanitation'),
        ('CAT-EQP-MNT', 'Equipment Repair & Maintenance', 'Biomedical machine servicing, AC repairs, X-ray maintenance, and calibration'),
        ('CAT-OTH-EXP', 'Other / Custom Expenses', 'Miscellaneous operational expenses and emergency facility costs')
) AS c(category_code, name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM public.expense_categories ec 
    WHERE ec.organization_id = o.id AND (ec.category_code = c.category_code OR ec.name = c.name)
);

-- Enhance expenses table with rich audit, payment, doctor & recurring attributes
ALTER TABLE IF EXISTS public.expenses
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
ADD COLUMN IF NOT EXISTS expense_type VARCHAR(50) DEFAULT 'GENERAL',
ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS duty_shift VARCHAR(50),
ADD COLUMN IF NOT EXISTS service_period_start DATE,
ADD COLUMN IF NOT EXISTS service_period_end DATE,
ADD COLUMN IF NOT EXISTS department VARCHAR(100),
ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
ADD COLUMN IF NOT EXISTS due_amount NUMERIC(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurrence_period VARCHAR(30),
ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS void_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create sequence for hospital expense vouchers if not exists
CREATE SEQUENCE IF NOT EXISTS public.expense_voucher_seq START WITH 1001;

-- Function to generate sequential expense voucher number
CREATE OR REPLACE FUNCTION public.generate_expense_voucher_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_seq INT;
    v_year VARCHAR(4);
BEGIN
    v_seq := nextval('public.expense_voucher_seq');
    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    RETURN 'VOU-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

-- Create atomic expense recording and GL posting function
CREATE OR REPLACE FUNCTION public.record_hospital_expense_atomic(
    p_org_id UUID,
    p_category_id UUID,
    p_title VARCHAR,
    p_amount NUMERIC,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_paid_to VARCHAR DEFAULT NULL,
    p_expense_date DATE DEFAULT CURRENT_DATE,
    p_expense_type VARCHAR DEFAULT 'GENERAL',
    p_doctor_id UUID DEFAULT NULL,
    p_duty_shift VARCHAR DEFAULT NULL,
    p_department VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_expense_id UUID;
    v_voucher_no VARCHAR(50);
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_id UUID;
    v_je_number VARCHAR(50);
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    -- Generate voucher number
    v_voucher_no := public.generate_expense_voucher_number(p_org_id);

    -- Insert expense record
    INSERT INTO public.expenses (
        organization_id,
        category_id,
        title,
        amount,
        voucher_number,
        paid_to,
        expense_date,
        payment_method,
        payment_reference,
        expense_type,
        doctor_id,
        duty_shift,
        department,
        status,
        due_amount,
        notes,
        approved_by,
        created_at
    ) VALUES (
        p_org_id,
        p_category_id,
        TRIM(p_title),
        p_amount,
        v_voucher_no,
        TRIM(COALESCE(p_paid_to, 'Vendor/Payee')),
        COALESCE(p_expense_date, CURRENT_DATE),
        COALESCE(p_payment_method, 'CASH'),
        p_payment_reference,
        COALESCE(p_expense_type, 'GENERAL'),
        p_doctor_id,
        p_duty_shift,
        p_department,
        'POSTED',
        0.00,
        p_notes,
        p_created_by,
        NOW()
    ) RETURNING id INTO v_expense_id;

    -- Resolve GL Operating Expense Account (5010 or 5020 or general 5000-range)
    SELECT id INTO v_gl_exp_acc_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org_id AND account_code IN ('5010', '5020', '5400', '5100') AND is_active = TRUE
    ORDER BY account_code ASC
    LIMIT 1;

    -- Fallback: resolve any active EXPENSE account
    IF v_gl_exp_acc_id IS NULL THEN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'EXPENSE' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- Resolve Payment Source Account (1010 Cash in Hand or 1020 Bank)
    IF UPPER(p_payment_method) = 'BANK' THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1020' AND is_active = TRUE;
    ELSE
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE;
    END IF;

    -- Fallback to any active cash/bank asset
    IF v_gl_cash_acc_id IS NULL THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- If GL accounts exist, post balanced double-entry journal entry atomically
    IF v_gl_exp_acc_id IS NOT NULL AND v_gl_cash_acc_id IS NOT NULL THEN
        v_je_number := 'JE-EXP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT, 1, 6);

        INSERT INTO public.journal_entries (
            organization_id,
            entry_number,
            entry_date,
            reference_type,
            reference_id,
            narration,
            status,
            total_debit,
            total_credit,
            created_by
        ) VALUES (
            p_org_id,
            v_je_number,
            COALESCE(p_expense_date, CURRENT_DATE),
            'EXPENSE_PAYMENT',
            v_expense_id,
            'Hospital Expense: ' || TRIM(p_title) || ' (Voucher: ' || v_voucher_no || ')',
            'POSTED',
            p_amount,
            p_amount,
            p_created_by
        ) RETURNING id INTO v_je_id;

        -- Debit Expense (Increases Expense)
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_exp_acc_id,
            p_amount,
            0.00,
            TRIM(p_title)
        );

        -- Credit Cash/Bank (Decreases Cash/Bank Asset)
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_cash_acc_id,
            0.00,
            p_amount,
            'Disbursement via ' || UPPER(COALESCE(p_payment_method, 'CASH'))
        );

        -- Link journal entry to expense
        UPDATE public.expenses SET journal_entry_id = v_je_id WHERE id = v_expense_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_no,
        'amount', p_amount,
        'journal_entry_id', v_je_id
    );
END;
$$;

-- Function for comprehensive expense dashboard aggregation
CREATE OR REPLACE FUNCTION public.get_expense_analytics_summary(
    p_org_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_start DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
    v_total_today NUMERIC(14, 2) := 0.00;
    v_total_range NUMERIC(14, 2) := 0.00;
    v_total_month NUMERIC(14, 2) := 0.00;
    v_total_doctor NUMERIC(14, 2) := 0.00;
    v_total_ot NUMERIC(14, 2) := 0.00;
    v_category_breakdown JSONB;
    v_recent_expenses JSONB;
BEGIN
    -- Today's total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_today
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date = CURRENT_DATE
      AND status != 'VOIDED';

    -- Selected range total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_range
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND status != 'VOIDED';

    -- Current month total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_month
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)
      AND status != 'VOIDED';

    -- Doctor specific expenses
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_doctor
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND expense_type IN ('DOCTOR_DUTY', 'DOCTOR_CONSULTATION', 'DOCTOR_MONTHLY')
      AND status != 'VOIDED';

    -- OT specific expenses
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_ot
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND expense_type = 'OT_MEDICINE'
      AND status != 'VOIDED';

    -- Category breakdown
    SELECT jsonb_agg(
        jsonb_build_object(
            'category_id', c.id,
            'category_name', c.name,
            'category_code', c.category_code,
            'total_amount', COALESCE(agg.sum_amount, 0.00),
            'count', COALESCE(agg.cnt, 0)
        )
    )
    INTO v_category_breakdown
    FROM public.expense_categories c
    LEFT JOIN (
        SELECT 
            category_id,
            SUM(amount) AS sum_amount,
            COUNT(*) AS cnt
        FROM public.expenses
        WHERE organization_id = p_org_id
          AND expense_date BETWEEN v_start AND v_end
          AND status != 'VOIDED'
        GROUP BY category_id
    ) agg ON c.id = agg.category_id
    WHERE c.organization_id = p_org_id
      AND c.is_active = TRUE
      AND COALESCE(agg.cnt, 0) > 0;

    -- Recent 15 expenses
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'voucher_number', e.voucher_number,
            'title', e.title,
            'amount', e.amount,
            'expense_date', e.expense_date,
            'paid_to', e.paid_to,
            'payment_method', e.payment_method,
            'expense_type', e.expense_type,
            'status', e.status,
            'category_name', c.name,
            'department', e.department,
            'doctor_name', d.full_name
        )
    )
    INTO v_recent_expenses
    FROM (
        SELECT *
        FROM public.expenses
        WHERE organization_id = p_org_id
        ORDER BY created_at DESC
        LIMIT 15
    ) e
    LEFT JOIN public.expense_categories c ON e.category_id = c.id
    LEFT JOIN public.doctors d ON e.doctor_id = d.id;

    RETURN jsonb_build_object(
        'today_total', v_total_today,
        'range_total', v_total_range,
        'month_total', v_total_month,
        'doctor_total', v_total_doctor,
        'ot_total', v_total_ot,
        'start_date', v_start,
        'end_date', v_end,
        'categories', COALESCE(v_category_breakdown, '[]'::jsonb),
        'recent_expenses', COALESCE(v_recent_expenses, '[]'::jsonb)
    );
END;
$$;

-- Grant execute permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.generate_expense_voucher_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expense_analytics_summary(UUID, DATE, DATE) TO authenticated, service_role;
