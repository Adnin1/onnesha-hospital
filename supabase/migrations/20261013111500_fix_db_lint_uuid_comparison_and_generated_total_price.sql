-- =====================================================================================
-- Migration 176: 20261013111500_fix_db_lint_uuid_comparison_and_generated_total_price.sql
-- 
-- 1. Resilient column constraints:
--    - Drop NOT NULL on beds.bed_type_id so bed creation never fails if bed_types is unseeded.
--    - Drop NOT NULL on episode_service_charges.episode_id for resilient charge recording.
-- 2. Upgrade admit_patient_to_bed_atomic:
--    - Fix SQL error 428C9: Omit generated column "total_price" from episode_service_charges inserts.
--    - Set status = 'UNBILLED' (aligned with CHECK constraint).
--    - Auto-create or resolve active patient_care_episodes and link episode_id.
-- 3. Upgrade get_episode_billing_overview:
--    - Fix SQL error 42883: Type-safe UUID and TEXT comparisons for invoice_items.reference_id.
--    - Deduplicate automatic IPD admission fee (৳300) and daily service charge (৳500).
-- 4. Upgrade record_discretionary_referral_payout_atomic:
--    - Safe approved_by profile resolution.
--    - Record hospital expense with status = 'POSTED' and expense_type = 'MARKETING'.
-- 5. Upgrade get_profit_and_loss_summary:
--    - Resilient tenant verification via profiles and user_roles.
-- =====================================================================================

-- 1. RESILIENT COLUMN CONSTRAINTS
ALTER TABLE IF EXISTS public.beds ALTER COLUMN bed_type_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.episode_service_charges ALTER COLUMN episode_id DROP NOT NULL;

-- 2. UPGRADE admit_patient_to_bed_atomic
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_patient_org UUID;
    v_bed_org UUID;
    v_cabin_org UUID;
    v_visit_id UUID;
    v_episode_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
    v_ref_agent RECORD;
BEGIN
    v_calling_user := auth.uid();

    -- Tenant Authorization
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_calling_user 
              AND (organization_id = p_organization_id OR active_organization_id = p_organization_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_calling_user AND organization_id = p_organization_id
        ) THEN
            RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
        END IF;

        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND rp.permission_key IN ('ipd.admit', 'beds.allocate', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks IPD admission permission (ipd.admit)' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    SELECT full_name, organization_id INTO v_patient_name, v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    IF v_patient_org != p_organization_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Patient belongs to organization % but admission requested for %', v_patient_org, p_organization_id USING ERRCODE = '42501';
    END IF;

    -- Bed Check
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_bed_org
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF v_bed_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Bed belongs to organization % but admission requested for %', v_bed_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Bed % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- Cabin Check
    IF p_cabin_id IS NOT NULL THEN
        SELECT status, cabin_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_cabin_org
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF v_cabin_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Cabin belongs to organization % but admission requested for %', v_cabin_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Cabin % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- Resolve or create active patient care episode
    SELECT id INTO v_episode_id
    FROM public.patient_care_episodes
    WHERE organization_id = p_organization_id
      AND patient_id = p_patient_id
      AND status = 'ACTIVE'
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_episode_id IS NULL THEN
        INSERT INTO public.patient_care_episodes (
            organization_id,
            patient_id,
            episode_type,
            status,
            started_at,
            created_by
        ) VALUES (
            p_organization_id,
            p_patient_id,
            'IPD',
            'ACTIVE',
            NOW(),
            COALESCE(v_calling_user, p_assigned_by)
        ) RETURNING id INTO v_episode_id;
    END IF;

    -- Insert into canonical patient_visits
    INSERT INTO public.patient_visits (
        organization_id,
        patient_id,
        episode_id,
        visit_number,
        doctor_id,
        visit_type,
        admitted_at,
        admission_fee_snapshot,
        daily_service_rate_snapshot,
        status,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        v_episode_id,
        'VISIT-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6)),
        p_doctor_id,
        COALESCE(p_admission_type, 'IPD'),
        NOW(),
        300.00,
        500.00,
        'ACTIVE',
        COALESCE(v_calling_user, p_assigned_by),
        NOW(),
        NOW()
    ) RETURNING id INTO v_visit_id;

    -- Insert into bed_assignments
    INSERT INTO public.bed_assignments (
        organization_id,
        patient_id,
        visit_id,
        bed_id,
        cabin_id,
        assigned_at,
        daily_charge,
        status,
        assigned_by
    ) VALUES (
        p_organization_id,
        p_patient_id,
        v_visit_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        COALESCE(v_calling_user, p_assigned_by)
    ) RETURNING id INTO v_assignment_id;

    -- Mark Occupied
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = p_bed_id;
    END IF;

    IF p_cabin_id IS NOT NULL THEN
        UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = p_cabin_id;
    END IF;

    -- Automatically record IPD Admission Fee (300 BDT) in episode_service_charges
    -- NOTE: Column "total_price" is GENERATED ALWAYS AS (ROUND((quantity * unit_price), 2)) STORED
    -- Do NOT insert non-default value into total_price (Error 428C9 avoidance)
    INSERT INTO public.episode_service_charges (
        organization_id,
        episode_id,
        patient_id,
        service_category,
        item_name,
        quantity,
        unit_price,
        status,
        is_billed,
        created_by,
        notes
    ) VALUES (
        p_organization_id,
        v_episode_id,
        p_patient_id,
        'MISC',
        'IPD Admission Fee (ভর্তি ফি - এককালীন)',
        1,
        300.00,
        'UNBILLED',
        FALSE,
        COALESCE(v_calling_user, p_assigned_by),
        'Automated IPD admission fee snapshot'
    );

    -- Automatically record IPD Daily Service Charge (500 BDT) in episode_service_charges
    INSERT INTO public.episode_service_charges (
        organization_id,
        episode_id,
        patient_id,
        service_category,
        item_name,
        quantity,
        unit_price,
        status,
        is_billed,
        created_by,
        notes
    ) VALUES (
        p_organization_id,
        v_episode_id,
        p_patient_id,
        'MISC',
        'IPD Daily Service Charge (দৈনিক সেবা চার্জ)',
        1,
        500.00,
        'UNBILLED',
        FALSE,
        COALESCE(v_calling_user, p_assigned_by),
        'Automated IPD daily hospital service charge'
    );

    -- Record Referral Attribution if agent provided
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, agent_code, is_active, organization_id, full_name
        INTO v_ref_agent
        FROM public.referral_agents
        WHERE id = p_referral_agent_id;

        IF v_ref_agent.id IS NOT NULL
           AND v_ref_agent.organization_id = p_organization_id
           AND v_ref_agent.is_active IS TRUE THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id,
                patient_id,
                visit_id,
                referral_agent_id,
                referral_code_snapshot,
                referral_name_snapshot,
                assigned_by,
                status,
                notes
            ) VALUES (
                p_organization_id,
                p_patient_id,
                v_visit_id,
                v_ref_agent.id,
                v_ref_agent.agent_code,
                v_ref_agent.full_name,
                COALESCE(v_calling_user, p_assigned_by),
                'ACTIVE',
                'Attributed during IPD admission'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'visit_id', v_visit_id,
        'episode_id', v_episode_id,
        'patient_id', p_patient_id,
        'daily_charge', COALESCE(v_charge, 0),
        'admission_fee', 300.00,
        'daily_service_charge', 500.00
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;


-- 3. UPGRADE get_episode_billing_overview
CREATE OR REPLACE FUNCTION public.get_episode_billing_overview(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID DEFAULT NULL,
    p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode_id UUID := p_episode_id;
    v_patient_id UUID := p_patient_id;
    v_lines JSONB := '[]'::JSONB;
    v_encounters JSONB := '[]'::JSONB;
    v_resources JSONB := '[]'::JSONB;
    v_critical JSONB := '[]'::JSONB;
    v_invoices JSONB := '[]'::JSONB;
    v_total NUMERIC(14,2) := 0;
    v_previous_invoiced NUMERIC(14,2) := 0;
    v_previous_paid NUMERIC(14,2) := 0;
    v_previous_due NUMERIC(14,2) := 0;
    v_episode_invoiced NUMERIC(14,2) := 0;
    v_episode_paid NUMERIC(14,2) := 0;
    v_episode_due NUMERIC(14,2) := 0;
    v_primary_visit_id UUID := NULL;
    v_admission_discount_amount NUMERIC(14,2) := 0;
    v_admission_discount_reason TEXT := NULL;
    v_referral_agent_id UUID := NULL;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.patients
      WHERE id = v_patient_id
        AND organization_id = p_org_id
        AND is_deleted = FALSE
    ) THEN
      RAISE EXCEPTION 'PATIENT_NOT_FOUND';
    END IF;

    IF v_episode_id IS NULL THEN
      SELECT id, admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode_id, v_admission_discount_amount, v_admission_discount_reason, v_referral_agent_id
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
    ELSE
      SELECT admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_admission_discount_amount, v_admission_discount_reason, v_referral_agent_id
      FROM public.patient_care_episodes
      WHERE id = v_episode_id;
    END IF;

    IF v_episode_id IS NOT NULL THEN
      SELECT pv.id
        INTO v_primary_visit_id
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
      ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 ELSE 1 END, pv.admitted_at
      LIMIT 1;
    ELSE
      SELECT pv.id
        INTO v_primary_visit_id
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
      ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 ELSE 1 END, pv.admitted_at DESC
      LIMIT 1;
    END IF;

    -- Encounters history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'status', pv.status,
          'admitted_at', pv.admitted_at,
          'discharged_at', pv.discharged_at,
          'doctor_name', d.full_name,
          'department_name', dep.name,
          'chief_complaint', pv.chief_complaint,
          'opd_fee_snapshot', COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0),
          'admission_fee_snapshot', COALESCE(pv.admission_fee_snapshot, 300.00),
          'daily_service_rate_snapshot', COALESCE(pv.daily_service_rate_snapshot, 500.00)
        )
        ORDER BY pv.admitted_at
      ),
      '[]'::JSONB
    )
    INTO v_encounters
    FROM public.patient_visits pv
    LEFT JOIN public.doctors d ON d.id = pv.doctor_id
    LEFT JOIN public.departments dep ON dep.id = pv.department_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id);

    -- Bed/cabin allocation history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'resource_type', CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END,
          'resource_number', COALESCE(c.cabin_number, b.bed_number),
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'status', ba.status,
          'daily_charge', ba.daily_charge
        )
        ORDER BY ba.assigned_at
      ),
      '[]'::JSONB
    )
    INTO v_resources
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv ON pv.id = ba.visit_id
    LEFT JOIN public.beds b ON b.id = ba.bed_id
    LEFT JOIN public.wards w ON w.id = b.ward_id
    LEFT JOIN public.cabins c ON c.id = ba.cabin_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id);

    -- Critical care history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', cca.admission_time,
          'discharge_time', cca.discharge_time,
          'status', cca.status,
          'daily_charge', u.daily_charge,
          'ventilator_required', cca.ventilator_required,
          'doctor_name', d.full_name,
          'initial_diagnosis', cca.initial_diagnosis
        )
        ORDER BY cca.admission_time
      ),
      '[]'::JSONB
    )
    INTO v_critical
    FROM public.critical_care_admissions cca
    LEFT JOIN public.critical_care_units u ON u.id = cca.unit_id
    LEFT JOIN public.doctors d ON d.id = cca.admitting_doctor_id
    WHERE cca.organization_id = p_org_id
      AND cca.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR cca.episode_id = v_episode_id);

    -- Billable candidate items (Type-Safe comparisons: reference_id UUID vs UUID or reference_id::TEXT vs TEXT)
    WITH candidates AS (
      -- 1. OPD Consultations
      SELECT
        pv.id::TEXT AS source_id,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
        COALESCE(pv.opd_fee_snapshot, d.opd_fee, 500.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      LEFT JOIN public.doctors d ON d.id = pv.doctor_id
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'OPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = pv.id
        )

      UNION ALL

      -- 2. Bed & Cabin stays
      SELECT
        ba.id::TEXT AS source_id,
        CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END::TEXT AS category,
        CASE
          WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
          ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed')
        END AS item_name,
        COALESCE(ba.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity,
        ba.assigned_at AS started_at
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      LEFT JOIN public.beds b ON b.id = ba.bed_id
      LEFT JOIN public.wards w ON w.id = b.ward_id
      LEFT JOIN public.cabins c ON c.id = ba.cabin_id
      WHERE ba.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ba.id
        )

      UNION ALL

      -- 3. IPD Daily Hospital Service Charge (derived dynamically if not recorded in episode_service_charges)
      SELECT
        ('srv-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Daily Service Charge (দৈনিক সেবা চার্জ)' AS item_name,
        COALESCE(pv.daily_service_rate_snapshot, 500.00)::NUMERIC AS unit_price,
        public.ohms_billable_days(pv.admitted_at, COALESCE(pv.discharged_at, p_as_of))::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'IPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_charges esc
          WHERE esc.organization_id = p_org_id
            AND esc.patient_id = v_patient_id
            AND (v_episode_id IS NULL OR esc.episode_id = v_episode_id)
            AND (esc.item_name ILIKE '%Service Charge%' OR esc.item_name ILIKE '%সেবা চার্জ%')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND (ii.item_name ILIKE '%Service Charge%' OR ii.item_name ILIKE '%সেবা চার্জ%')
            AND (ii.reference_id::TEXT = pv.id::TEXT OR ii.reference_id::TEXT = ('srv-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 4. IPD One-Time Admission Fee (derived dynamically if not recorded in episode_service_charges)
      SELECT
        ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Admission Fee (ভর্তি ফি - এককালীন)' AS item_name,
        COALESCE(pv.admission_fee_snapshot, 300.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'IPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_charges esc
          WHERE esc.organization_id = p_org_id
            AND esc.patient_id = v_patient_id
            AND (v_episode_id IS NULL OR esc.episode_id = v_episode_id)
            AND (esc.item_name ILIKE '%Admission Fee%' OR esc.item_name ILIKE '%ভর্তি ফি%')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND (ii.item_name ILIKE '%Admission Fee%' OR ii.item_name ILIKE '%ভর্তি ফি%')
            AND (ii.reference_id::TEXT = pv.id::TEXT OR ii.reference_id::TEXT = ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 5. Unbilled Episode Service Charges (including durable IPD ৳300 & ৳500 entries)
      SELECT
        esc.id::TEXT AS source_id,
        COALESCE(esc.service_category, 'MISC')::TEXT AS category,
        esc.item_name::TEXT AS item_name,
        COALESCE(esc.unit_price, 0)::NUMERIC AS unit_price,
        COALESCE(esc.quantity, 1)::NUMERIC AS quantity,
        esc.created_at AS started_at
      FROM public.episode_service_charges esc
      WHERE esc.organization_id = p_org_id
        AND esc.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR esc.episode_id = v_episode_id)
        AND esc.status = 'UNBILLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = esc.id
        )

      UNION ALL

      -- 6. Critical care (ICU/CCU) stays
      SELECT
        cca.id::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') ||
          ' (' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        cca.admission_time AS started_at
      FROM public.critical_care_admissions cca
      JOIN public.critical_care_units u ON u.id = cca.unit_id
      WHERE cca.organization_id = p_org_id
        AND cca.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR cca.episode_id = v_episode_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id
        )

      UNION ALL

      -- 7. Operation Theatre (OT) Procedures & Surgeries
      SELECT
        ob.id::TEXT AS source_id,
        'OT'::TEXT AS category,
        'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') AS item_name,
        COALESCE(ob.charges, 6000.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        ob.scheduled_start AS started_at
      FROM public.ot_bookings ob
      WHERE ob.organization_id = p_org_id
        AND ob.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR ob.patient_id = v_patient_id)
        AND ob.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ob.id
        )

      UNION ALL

      -- 8. Diagnostic Test Orders (Lab, X-Ray, USG, ECG)
      SELECT
        doi.id::TEXT AS source_id,
        COALESCE(d_cat.code, doi.service_category, 'LAB')::TEXT AS category,
        doi.test_name::TEXT AS item_name,
        COALESCE(doi.price, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        d_ord.order_date AS started_at
      FROM public.diagnostic_order_items doi
      JOIN public.diagnostic_orders d_ord ON d_ord.id = doi.order_id
      LEFT JOIN public.lab_tests lt ON lt.id = doi.test_id
      LEFT JOIN public.diagnostic_categories d_cat ON d_cat.id = lt.category_id
      WHERE d_ord.organization_id = p_org_id
        AND d_ord.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR d_ord.episode_id = v_episode_id)
        AND d_ord.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = doi.id
        )
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', c.source_id,
            'charge_id', NULL,
            'is_custom_charge', FALSE,
            'service_category', c.category,
            'item_name', c.item_name,
            'unit_price', c.unit_price,
            'quantity', c.quantity,
            'total_price', (c.unit_price * c.quantity),
            'started_at', c.started_at
          )
          ORDER BY c.started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(c.unit_price * c.quantity), 0)
    INTO v_lines, v_total
    FROM candidates c;

    -- Invoices history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', inv.id,
          'invoice_number', inv.invoice_number,
          'created_at', inv.created_at,
          'grand_total', inv.grand_total,
          'paid_amount', inv.paid_amount,
          'due_amount', inv.due_amount,
          'status', inv.status,
          'is_voided', inv.is_voided
        )
        ORDER BY inv.created_at
      ),
      '[]'::JSONB
    )
    INTO v_invoices
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR inv.episode_id = v_episode_id);

    -- Previous and episode totals
    SELECT
      COALESCE(SUM(inv.grand_total) FILTER (WHERE inv.is_voided = FALSE), 0),
      COALESCE(SUM(inv.paid_amount) FILTER (WHERE inv.is_voided = FALSE), 0),
      COALESCE(SUM(inv.due_amount) FILTER (WHERE inv.is_voided = FALSE), 0)
    INTO v_episode_invoiced, v_episode_paid, v_episode_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR inv.episode_id = v_episode_id);

    SELECT
      COALESCE(SUM(inv.grand_total) FILTER (WHERE inv.is_voided = FALSE), 0),
      COALESCE(SUM(inv.paid_amount) FILTER (WHERE inv.is_voided = FALSE), 0),
      COALESCE(SUM(inv.due_amount) FILTER (WHERE inv.is_voided = FALSE), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND (v_episode_id IS NOT NULL AND (inv.episode_id IS NULL OR inv.episode_id != v_episode_id));

    RETURN jsonb_build_object(
      'success', true,
      'episode_id', v_episode_id,
      'primary_visit_id', v_primary_visit_id,
      'admission_discount_amount', v_admission_discount_amount,
      'admission_discount_reason', v_admission_discount_reason,
      'referral_agent_id', v_referral_agent_id,
      'lines', v_lines,
      'total', v_total,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'invoice_history', v_invoices,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due,
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'lifetime_invoiced', (v_episode_invoiced + v_previous_invoiced),
      'lifetime_paid', (v_episode_paid + v_previous_paid),
      'lifetime_due', (v_episode_due + v_previous_due)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;


-- 4. UPGRADE record_discretionary_referral_payout_atomic
CREATE OR REPLACE FUNCTION public.record_discretionary_referral_payout_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_transaction_reference VARCHAR DEFAULT NULL,
    p_notes VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_approved_by UUID;
    v_agent RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(60);
    v_category_id UUID;
    v_voucher_number VARCHAR(60);
    v_expense_id UUID;
    v_new_settled NUMERIC(14,2);
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authentication & Tenant Authorization Check
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Validate Amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payout amount must be greater than zero.';
    END IF;

    -- 3. Validate Same-Org Agent
    SELECT id, agent_code, full_name, total_commission_settled
    INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RAISE EXCEPTION 'Referral agent not found in the active organization.';
    END IF;

    -- 4. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        SELECT id, settlement_number
        INTO v_settlement_id, v_settlement_number
        FROM public.referral_commission_settlements
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND transaction_reference = TRIM(p_idempotency_key)
        LIMIT 1;

        IF v_settlement_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'settlement_id', v_settlement_id,
                'settlement_number', v_settlement_number
            );
        END IF;
    END IF;

    -- 5. Generate Collision-Safe Settlement Number
    v_settlement_number := 'SETTLE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

    -- 6. Insert Settlement Record
    INSERT INTO public.referral_commission_settlements (
        organization_id,
        settlement_number,
        referral_agent_id,
        settlement_date,
        gross_commission_selected,
        adjustment_amount,
        net_paid_amount,
        payment_method,
        transaction_reference,
        paid_by,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        v_settlement_number,
        p_agent_id,
        v_now,
        p_amount,
        0,
        p_amount,
        COALESCE(p_payment_method, 'CASH'),
        COALESCE(TRIM(p_idempotency_key), TRIM(p_transaction_reference)),
        v_caller_id,
        COALESCE(TRIM(p_notes), 'Discretionary partner payout'),
        v_now
    )
    RETURNING id INTO v_settlement_id;

    -- 7. Update Agent Settled Total
    v_new_settled := COALESCE(v_agent.total_commission_settled, 0) + p_amount;
    UPDATE public.referral_agents
    SET total_commission_settled = v_new_settled,
        updated_at = v_now
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    -- 8. Resolve or Create Expense Category
    SELECT id INTO v_category_id
    FROM public.expense_categories
    WHERE organization_id = p_org_id
      AND (category_code = 'EXP-MARKETING' OR name ILIKE '%Marketing%' OR name ILIKE '%Referral%')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
        INSERT INTO public.expense_categories (
            organization_id,
            name,
            category_code,
            is_active
        ) VALUES (
            p_org_id,
            'Marketing & Referral Commission (মার্কেটিং ও রেফারেল কমিশন)',
            'EXP-MARKETING',
            true
        )
        RETURNING id INTO v_category_id;
    END IF;

    -- 9. Resolve safe approved_by profile
    IF v_caller_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id) THEN
        v_approved_by := v_caller_id;
    ELSE
        SELECT id INTO v_approved_by FROM public.profiles WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- 10. Generate Voucher Number and Insert Hospital Expense
    v_voucher_number := 'VOUCHER-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

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
        status,
        notes,
        approved_by,
        created_at
    ) VALUES (
        p_org_id,
        v_category_id,
        'Referral Partner Payout: ' || v_agent.full_name || ' (' || v_agent.agent_code || ')',
        p_amount,
        v_voucher_number,
        v_agent.full_name,
        CURRENT_DATE,
        COALESCE(p_payment_method, 'CASH'),
        v_settlement_number,
        'MARKETING',
        'POSTED',
        COALESCE(TRIM(p_notes), 'Discretionary referral payout booked to operational hospital expense'),
        v_approved_by,
        v_now
    )
    RETURNING id INTO v_expense_id;

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'voucher_number', v_voucher_number,
        'expense_id', v_expense_id,
        'amount', p_amount,
        'agent_name', v_agent.full_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_discretionary_referral_payout_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discretionary_referral_payout_atomic TO authenticated, service_role;


-- 5. UPGRADE get_profit_and_loss_summary
CREATE OR REPLACE FUNCTION public.get_profit_and_loss_summary(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_start_date_d DATE;
    v_end_date_d DATE;
    v_gross_revenue NUMERIC(14, 2) := 0.00;
    v_discounts NUMERIC(14, 2) := 0.00;
    v_net_revenue NUMERIC(14, 2) := 0.00;
    v_operating_expenses NUMERIC(14, 2) := 0.00;
    v_expenses_table_total NUMERIC(14, 2) := 0.00;
    v_gl_expense_total NUMERIC(14, 2) := 0.00;
    v_operating_surplus NUMERIC(14, 2) := 0.00;
    v_patient_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_operating_disbursements NUMERIC(14, 2) := 0.00;
    v_total_cash_inflow NUMERIC(14, 2) := 0.00;
    v_total_cash_outflow NUMERIC(14, 2) := 0.00;
    v_net_cash_movement NUMERIC(14, 2) := 0.00;
    v_expense_breakdown JSONB := '[]'::JSONB;
BEGIN
    -- Strict Fail-Closed Check
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Normalize start and end boundaries to Asia/Dhaka calendar dates for DATE-column queries
    v_start_date_d := (p_start_date AT TIME ZONE 'Asia/Dhaka')::DATE;
    v_end_date_d   := (p_end_date AT TIME ZONE 'Asia/Dhaka')::DATE;

    -- Accrual: Gross revenue and discounts recognized on invoices in half-open period [start, end)
    SELECT
        COALESCE(SUM(subtotal) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(discount_amount) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(grand_total) FILTER (WHERE is_voided = FALSE), 0.00)
    INTO
        v_gross_revenue,
        v_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Operating Expenses: Query active expenses vouchers table directly
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_expenses_table_total
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND status NOT IN ('VOID', 'VOIDED')
      AND expense_date >= v_start_date_d
      AND expense_date < v_end_date_d;

    -- Also check general ledger expense entries, strictly excluding contra-revenue discounts (4090)
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0.00)
    INTO v_gl_expense_total
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'EXPENSE'
      AND coa.account_code NOT IN ('4090')
      AND coa.account_name NOT ILIKE '%Discount%'
      AND je.entry_date >= v_start_date_d
      AND je.entry_date < v_end_date_d;

    IF v_expenses_table_total > 0 THEN
        v_operating_expenses := v_expenses_table_total;

        SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
        INTO v_expense_breakdown
        FROM (
            SELECT jsonb_build_object(
                'category', COALESCE(ec.name, e.expense_type, 'General Expense'),
                'amount', COALESCE(SUM(e.amount), 0.00)
            ) AS row_data
            FROM public.expenses e
            LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
            WHERE e.organization_id = p_org_id
              AND e.status NOT IN ('VOID', 'VOIDED')
              AND e.expense_date >= v_start_date_d
              AND e.expense_date < v_end_date_d
            GROUP BY COALESCE(ec.name, e.expense_type, 'General Expense')
            ORDER BY SUM(e.amount) DESC
        ) sub;
    ELSE
        v_operating_expenses := v_gl_expense_total;

        SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
        INTO v_expense_breakdown
        FROM (
            SELECT jsonb_build_object(
                'category', coa.account_name || ' (' || coa.account_code || ')',
                'amount', COALESCE(SUM(jel.debit - jel.credit), 0.00)
            ) AS row_data
            FROM public.journal_entry_lines jel
            JOIN public.journal_entries je ON je.id = jel.journal_entry_id
            JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
            WHERE je.organization_id = p_org_id
              AND je.status = 'POSTED'
              AND coa.account_type = 'EXPENSE'
              AND coa.account_code NOT IN ('4090')
              AND coa.account_name NOT ILIKE '%Discount%'
              AND je.entry_date >= v_start_date_d
              AND je.entry_date < v_end_date_d
            GROUP BY coa.account_name, coa.account_code
            ORDER BY SUM(jel.debit - jel.credit) DESC
        ) sub;
    END IF;

    v_operating_surplus := v_net_revenue - v_operating_expenses;

    -- Cash Movement: Inflows (Patient Collections) in half-open period [start, end)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_patient_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    v_total_cash_inflow := v_patient_collections;

    -- Cash Refunds
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    -- Cash Operating Disbursements
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_operating_disbursements
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND status NOT IN ('VOID', 'VOIDED')
      AND UPPER(payment_method) = 'CASH'
      AND expense_date >= v_start_date_d
      AND expense_date < v_end_date_d;

    IF v_operating_disbursements = 0 THEN
        SELECT COALESCE(SUM(jel.credit - jel.debit), 0.00)
        INTO v_operating_disbursements
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        WHERE je.organization_id = p_org_id
          AND je.status = 'POSTED'
          AND coa.account_type = 'ASSET'
          AND coa.account_code LIKE '10%'
          AND je.entry_date >= v_start_date_d
          AND je.entry_date < v_end_date_d
          AND (je.reference_type IS NULL OR je.reference_type NOT IN ('REFUND', 'PATIENT_REFUND', 'PAYMENT'));
        v_operating_disbursements := GREATEST(v_operating_disbursements, 0.00);
    END IF;

    v_total_cash_outflow := v_cash_refunds + v_operating_disbursements;
    v_net_cash_movement := v_total_cash_inflow - v_total_cash_outflow;

    RETURN jsonb_build_object(
        'success', true,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'accrual_basis', jsonb_build_object(
            'gross_revenue', v_gross_revenue,
            'discounts', v_discounts,
            'net_recognized_revenue', v_net_revenue,
            'operating_expenses', v_operating_expenses,
            'net_operating_surplus', v_operating_surplus,
            'expense_breakdown', v_expense_breakdown
        ),
        'cash_basis', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
        ),
        'cash_movement', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
