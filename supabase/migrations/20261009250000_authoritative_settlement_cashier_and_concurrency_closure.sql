-- ==============================================================================
-- OHMS PRODUCTION DATABASE MIGRATION 137
-- File: 20261009250000_authoritative_settlement_cashier_and_concurrency_closure.sql
--
-- CORE OBJECTIVES:
-- 1. Settlement RPC Security Hardening:
--    - Enforce authoritative cashier identity derived from auth.uid().
--    - Reject caller cashier spoofing (p_cashier_id mismatch).
--    - Enforce billing.discount / billing.manage permission & mandatory reason for discounts > 0.
--    - Enforce strict payment method validation ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'VISA', 'MASTERCARD', 'BANK_TRANSFER').
-- 2. Concurrency-Safe Daily Registration Serial Generator:
--    - Acquire per-tenant / per-day transaction-level advisory lock pg_advisory_xact_lock.
--    - Monotonically derive sequence using MAX(serial) + 1 to eliminate race condition duplicates.
-- 3. Billing Waiver Accounting Reconciliation:
--    - In waive_episode_service_atomic: enforce full-line-only waivers (rejecting under-waived lines).
--    - In get_episode_billing_overview: reconcile net billable amount subtracting active waivers,
--      ensuring partially waived items are never completely erased from billing.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CONCURRENCY-SAFE DAILY PATIENT REGISTRATION SERIAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_patient_registration_serial(
    p_org_id UUID,
    p_encounter_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_date_prefix TEXT := TO_CHAR(COALESCE(p_encounter_at, NOW()) AT TIME ZONE 'Asia/Dhaka', 'YYMMDD');
    v_daily_count INT;
    v_serial TEXT;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_ID_REQUIRED';
    END IF;

    -- Tenant isolation check when caller has active org context
    IF auth.uid() IS NOT NULL AND private.get_current_org_id() IS NOT NULL THEN
        IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
            RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
        END IF;
    END IF;

    -- Concurrency Lock: Acquire transaction-level advisory lock for this org and day
    PERFORM pg_advisory_xact_lock(hashtext('patient_reg_serial:' || p_org_id::TEXT || ':' || v_date_prefix));

    -- Monotonic atomic sequence derived from MAX sequence on matching day
    SELECT COALESCE(
        MAX(
            NULLIF(
                SUBSTRING(registration_serial FROM LENGTH(v_date_prefix) + 2),
                ''
            )::INTEGER
        ),
        0
    ) + 1
    INTO v_daily_count
    FROM public.patients
    WHERE organization_id = p_org_id
      AND registration_serial LIKE v_date_prefix || '-%';

    v_serial := v_date_prefix || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    RETURN v_serial;
END;
$$;

COMMENT ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) IS
'Authoritative, race-condition-free sequence generator for daily patient registration serials in YYMMDD-XXXX format using per-tenant transaction advisory locking.';

REVOKE ALL ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. HARDEN WAIVE_EPISODE_SERVICE_ATOMIC (FULL-LINE INVARIANT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waive_episode_service_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_reference_id UUID,
    p_service_category VARCHAR DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_waived_amount NUMERIC DEFAULT NULL,
    p_waiver_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_reason TEXT := NULLIF(trim(p_waiver_reason), '');
    v_waiver_id UUID;
    v_derived_category VARCHAR(50);
    v_derived_item_name TEXT;
    v_derived_amount NUMERIC(14, 2);
    v_final_waived_amount NUMERIC(14, 2);
BEGIN
    -- 1. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    -- 2. Tenant Isolation Check
    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    -- 3. RBAC Privilege Enforcement
    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.discount')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_WAIVER';
    END IF;

    -- 4. Audit Reason Validation
    IF v_clean_reason IS NULL OR char_length(v_clean_reason) < 3 THEN
        RAISE EXCEPTION 'WAIVER_REASON_REQUIRED_MIN_3_CHARS';
    END IF;

    -- 5. Concurrency Control: Acquire Row Lock on Episode
    PERFORM 1 FROM public.patient_care_episodes
    WHERE id = p_episode_id AND organization_id = p_org_id AND patient_id = p_patient_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EPISODE_NOT_FOUND';
    END IF;

    -- 6. Unbilled Invariant: Reject if Item is Already Billed in an Active Invoice
    IF EXISTS (
        SELECT 1
        FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE inv.organization_id = p_org_id
          AND inv.is_voided = FALSE
          AND ii.reference_id = p_reference_id
    ) THEN
        RAISE EXCEPTION 'ITEM_ALREADY_INVOICED';
    END IF;

    -- 7. Server-Authoritative Derivation from Source Tables
    -- A. OPD Consultation
    SELECT
        'OPD'::VARCHAR,
        ('OPD Consultation - ' || COALESCE(doc.full_name, 'Attending Doctor'))::TEXT,
        COALESCE(doc.consultation_fee, doc.opd_fee, 800.00)::NUMERIC
    INTO v_derived_category, v_derived_item_name, v_derived_amount
    FROM public.patient_visits pv
    JOIN public.doctors doc ON doc.id = pv.doctor_id
    WHERE pv.id = p_reference_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = p_patient_id
      AND pv.episode_id = p_episode_id;

    -- B. Bed or Cabin Stay
    IF v_derived_amount IS NULL THEN
        SELECT
            (CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END)::VARCHAR,
            (CASE
                WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
                ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed')
            END)::TEXT,
            (COALESCE(ba.daily_charge, 0) * public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, NOW())))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.bed_assignments ba
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.id = p_reference_id
          AND ba.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = p_episode_id;
    END IF;

    -- C. Critical Care Unit Stay
    IF v_derived_amount IS NULL THEN
        SELECT
            'MISC'::VARCHAR,
            ('Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') || ' (' || cca.bed_number || ')')::TEXT,
            (COALESCE(u.daily_charge, 0) * public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, NOW())))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.critical_care_admissions cca
        JOIN public.critical_care_units u ON u.id = cca.unit_id
        WHERE cca.id = p_reference_id
          AND cca.organization_id = p_org_id
          AND cca.patient_id = p_patient_id
          AND (cca.episode_id = p_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')));
    END IF;

    -- D. Additional Episode Service Charges
    IF v_derived_amount IS NULL THEN
        SELECT
            esc.service_category::VARCHAR,
            COALESCE(esc.item_name, esc.description, 'Service Charge')::TEXT,
            (COALESCE(esc.unit_price, 0) * COALESCE(esc.quantity, 1))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.episode_service_charges esc
        WHERE esc.id = p_reference_id
          AND esc.organization_id = p_org_id
          AND esc.patient_id = p_patient_id
          AND esc.episode_id = p_episode_id
          AND COALESCE(esc.is_billed, FALSE) = FALSE;
    END IF;

    -- E. Operation Theatre (OT) Procedures
    IF v_derived_amount IS NULL THEN
        SELECT
            'PROCEDURE'::VARCHAR,
            ('OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure'))::TEXT,
            COALESCE(ob.ot_charge, 0)::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.ot_bookings ob
        JOIN public.patient_visits pv ON pv.id = ob.visit_id
        WHERE ob.id = p_reference_id
          AND ob.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = p_episode_id
          AND ob.status != 'CANCELLED';
    END IF;

    -- Invariant: Service Must Exist and Belong to This Episode/Patient
    IF v_derived_amount IS NULL THEN
        RAISE EXCEPTION 'REFERENCED_SERVICE_NOT_FOUND_OR_INELIGIBLE';
    END IF;

    -- Strict Full-Line Waiver Invariant:
    -- If p_waived_amount is supplied and less than full billable amount, reject.
    IF p_waived_amount IS NOT NULL AND p_waived_amount > 0 AND p_waived_amount < v_derived_amount THEN
        RAISE EXCEPTION 'PARTIAL_LINE_WAIVER_PROHIBITED: Service line waivers must waive the full billable line amount (%). For monetary concessions, apply an invoice discount.', v_derived_amount;
    END IF;

    v_final_waived_amount := ROUND(v_derived_amount, 2);

    -- Deactivate previous active waiver on this item if any
    UPDATE public.episode_service_waivers
    SET status = 'RESTORED', updated_at = NOW()
    WHERE organization_id = p_org_id
      AND episode_id = p_episode_id
      AND reference_id = p_reference_id
      AND status = 'ACTIVE';

    -- Insert new active waiver
    INSERT INTO public.episode_service_waivers (
        organization_id, patient_id, episode_id, reference_id,
        service_category, item_name, waived_amount, waiver_reason,
        waived_by, status, created_at, updated_at
    )
    VALUES (
        p_org_id, p_patient_id, p_episode_id, p_reference_id,
        COALESCE(v_derived_category, p_service_category, 'MISC'),
        COALESCE(v_derived_item_name, p_item_name, 'Service Charge'),
        v_final_waived_amount, v_clean_reason,
        auth.uid(), 'ACTIVE', NOW(), NOW()
    )
    RETURNING id INTO v_waiver_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'waiver_id', v_waiver_id,
        'waived_amount', v_final_waived_amount,
        'item_name', COALESCE(v_derived_item_name, p_item_name, 'Service Charge')
    );
END;
$$;

COMMENT ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) IS
'Authoritative server-validated atomic service charge waiver enforcing full-line invariant, concurrency row locks, and duplicate prevention.';

REVOKE ALL ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. RECONCILE GET_EPISODE_BILLING_OVERVIEW (AUTHORITATIVE WAIVER & REMAINING SUMS)
-- ------------------------------------------------------------------------------
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
    v_waived_items JSONB := '[]'::JSONB;
    v_service_charges JSONB := '[]'::JSONB;
    v_total NUMERIC(14,2) := 0;
    v_previous_invoiced NUMERIC(14,2) := 0;
    v_previous_paid NUMERIC(14,2) := 0;
    v_previous_due NUMERIC(14,2) := 0;
    v_episode_invoiced NUMERIC(14,2) := 0;
    v_episode_paid NUMERIC(14,2) := 0;
    v_episode_due NUMERIC(14,2) := 0;
    v_primary_visit_id UUID := NULL;
    v_episode RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.view')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
        OR public.is_org_admin_or_has_permission(p_org_id, 'clinical.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'patients.view')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
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
      SELECT id INTO v_episode_id
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
    END IF;

    IF v_episode_id IS NOT NULL THEN
      SELECT
        id, episode_number, status, started_at, ended_at,
        admission_discount_amount, referral_agent_id
      INTO v_episode
      FROM public.patient_care_episodes
      WHERE id = v_episode_id
        AND organization_id = p_org_id
        AND patient_id = v_patient_id;
    END IF;

    -- Primary Visit ID
    SELECT pv.id INTO v_primary_visit_id
    FROM public.patient_visits pv
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (pv.episode_id = v_episode_id OR (v_episode_id IS NULL AND pv.status = 'ACTIVE'))
    ORDER BY pv.admitted_at ASC
    LIMIT 1;

    -- 1. Encounters Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'department_name', d.name,
          'doctor_name', doc.full_name,
          'admitted_at', pv.admitted_at,
          'discharged_at', pv.discharged_at,
          'status', pv.status
        )
        ORDER BY pv.admitted_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_encounters
    FROM public.patient_visits pv
    LEFT JOIN public.departments d ON d.id = pv.department_id
    LEFT JOIN public.doctors doc ON doc.id = pv.doctor_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 2. Bed & Cabin Stays Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'resource_type', CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END,
          'resource_number', COALESCE(c.cabin_number, b.bed_number, '—'),
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'daily_charge', ba.daily_charge,
          'status', ba.status
        )
        ORDER BY ba.assigned_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_resources
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv ON pv.id = ba.visit_id
    LEFT JOIN public.beds b ON b.id = ba.bed_id
    LEFT JOIN public.cabins c ON c.id = ba.cabin_id
    LEFT JOIN public.wards w ON w.id = b.ward_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 3. Critical Care Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', cca.admission_time,
          'discharge_time', cca.discharge_time,
          'daily_charge', u.daily_charge,
          'status', cca.status
        )
        ORDER BY cca.admission_time ASC
      ),
      '[]'::JSONB
    )
    INTO v_critical
    FROM public.critical_care_admissions cca
    JOIN public.critical_care_units u ON u.id = cca.unit_id
    WHERE cca.organization_id = p_org_id
      AND cca.patient_id = v_patient_id
      AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')));

    -- 4. Active Durable Waivers Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'reference_id', w.reference_id,
          'service_category', w.service_category,
          'item_name', w.item_name,
          'waived_amount', w.waived_amount,
          'waiver_reason', w.waiver_reason,
          'waived_by', w.waived_by,
          'waived_by_name', COALESCE(up.full_name, 'Staff Member'),
          'created_at', w.created_at,
          'status', w.status
        )
        ORDER BY w.created_at DESC
      ),
      '[]'::JSONB
    )
    INTO v_waived_items
    FROM public.episode_service_waivers w
    LEFT JOIN public.profiles up ON up.id = w.waived_by
    WHERE w.organization_id = p_org_id
      AND w.patient_id = v_patient_id
      AND w.episode_id = v_episode_id
      AND w.status = 'ACTIVE';

    -- 5. Additional Episode Service Charges List
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', esc.id,
          'service_category', esc.service_category,
          'item_name', esc.item_name,
          'description', COALESCE(esc.description, esc.notes),
          'quantity', esc.quantity,
          'unit_price', esc.unit_price,
          'total_amount', COALESCE(esc.total_amount, esc.total_price),
          'status', esc.status,
          'is_billed', COALESCE(esc.is_billed, FALSE),
          'created_at', esc.created_at
        )
        ORDER BY esc.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_service_charges
    FROM public.episode_service_charges esc
    WHERE esc.organization_id = p_org_id
      AND esc.patient_id = v_patient_id
      AND esc.episode_id = v_episode_id;

    -- 6. Invoices Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', inv.id,
          'invoice_number', inv.invoice_number,
          'grand_total', inv.grand_total,
          'paid_amount', inv.paid_amount,
          'due_amount', inv.due_amount,
          'status', inv.status,
          'created_at', inv.created_at,
          'is_episode_settlement', inv.is_episode_settlement
        )
        ORDER BY inv.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_invoices
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND (inv.episode_id = v_episode_id OR (v_episode_id IS NULL AND inv.status IN ('PAID', 'PARTIAL', 'UNPAID')))
      AND inv.is_voided = FALSE;

    -- Financial Totals
    SELECT
      COALESCE(SUM(inv.grand_total), 0),
      COALESCE(SUM(inv.paid_amount), 0),
      COALESCE(SUM(inv.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND inv.is_voided = FALSE;

    IF v_episode_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(inv.grand_total), 0),
        COALESCE(SUM(inv.paid_amount), 0),
        COALESCE(SUM(inv.due_amount), 0)
      INTO v_episode_invoiced, v_episode_paid, v_episode_due
      FROM public.invoices inv
      WHERE inv.organization_id = p_org_id
        AND inv.patient_id = v_patient_id
        AND inv.episode_id = v_episode_id
        AND inv.is_voided = FALSE;
    END IF;

    -- 7. Unbilled Lines Assembly (Reconciled with Partial & Full Waiver Accounting)
    WITH raw_candidates AS (
      -- A. OPD Consultations
      SELECT
        pv.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(doc.full_name, 'General Doctor') AS item_name,
        COALESCE(doc.consultation_fee, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at,
        ROUND((COALESCE(doc.consultation_fee, 0) * 1)::NUMERIC, 2) AS gross_price
      FROM public.patient_visits pv
      JOIN public.doctors doc ON doc.id = pv.doctor_id
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
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

      -- B. Bed & Cabin Stays
      SELECT
        ba.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END AS category,
        CASE
          WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
          ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed') || ' (' || COALESCE(w.name, 'Ward') || ')'
        END AS item_name,
        COALESCE(ba.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity,
        ba.assigned_at AS started_at,
        ROUND((COALESCE(ba.daily_charge, 0) * public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of)))::NUMERIC, 2) AS gross_price
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      LEFT JOIN public.beds b ON b.id = ba.bed_id
      LEFT JOIN public.cabins c ON c.id = ba.cabin_id
      LEFT JOIN public.wards w ON w.id = b.ward_id
      WHERE ba.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ba.id
        )

      UNION ALL

      -- C. Critical Care Stays
      SELECT
        cca.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'MISC'::TEXT AS category,
        'Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') ||
          ' (' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        cca.admission_time AS started_at,
        ROUND((COALESCE(u.daily_charge, 0) * public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of)))::NUMERIC, 2) AS gross_price
      FROM public.critical_care_admissions cca
      JOIN public.critical_care_units u ON u.id = cca.unit_id
      WHERE cca.organization_id = p_org_id
        AND cca.patient_id = v_patient_id
        AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')))
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id
        )

      UNION ALL

      -- D. Additional Episode Service Charges
      SELECT
        esc.id AS source_id,
        esc.id AS charge_id,
        TRUE AS is_custom_charge,
        esc.service_category::TEXT AS category,
        COALESCE(esc.item_name, esc.description, esc.notes, 'Service Charge') AS item_name,
        COALESCE(esc.unit_price, 0)::NUMERIC AS unit_price,
        COALESCE(esc.quantity, 1)::NUMERIC AS quantity,
        esc.created_at AS started_at,
        ROUND((COALESCE(esc.unit_price, 0) * COALESCE(esc.quantity, 1))::NUMERIC, 2) AS gross_price
      FROM public.episode_service_charges esc
      WHERE esc.organization_id = p_org_id
        AND esc.patient_id = v_patient_id
        AND esc.episode_id = v_episode_id
        AND COALESCE(esc.status, 'UNBILLED') IN ('UNBILLED', 'PENDING')
        AND COALESCE(esc.is_billed, FALSE) = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = esc.id
        )

      UNION ALL

      -- E. Unbilled Operation Theatre (OT) Procedures & Surgeries
      SELECT
        ob.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'PROCEDURE'::TEXT AS category,
        'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') AS item_name,
        COALESCE(ob.ot_charge, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        ob.scheduled_start AS started_at,
        ROUND((COALESCE(ob.ot_charge, 0) * 1)::NUMERIC, 2) AS gross_price
      FROM public.ot_bookings ob
      JOIN public.patient_visits pv ON pv.id = ob.visit_id
      WHERE ob.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
        AND ob.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ob.id
        )
    ),
    reconciled AS (
      SELECT
        rc.source_id,
        rc.charge_id,
        rc.is_custom_charge,
        rc.category,
        rc.item_name,
        rc.unit_price,
        rc.quantity,
        rc.started_at,
        rc.gross_price,
        COALESCE(w.waived_amount, 0)::NUMERIC AS waived_amount,
        GREATEST(0, ROUND(rc.gross_price - COALESCE(w.waived_amount, 0), 2)) AS net_billable
      FROM raw_candidates rc
      LEFT JOIN public.episode_service_waivers w
        ON w.organization_id = p_org_id
       AND w.episode_id = v_episode_id
       AND w.reference_id = rc.source_id
       AND w.status = 'ACTIVE'
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', source_id,
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', net_billable,
            'started_at', started_at
          )
          ORDER BY started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(net_billable), 0)
    INTO v_lines, v_total
    FROM reconciled
    WHERE net_billable > 0;

    RETURN jsonb_build_object(
      'episode', CASE WHEN v_episode.id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_episode.id,
          'episode_number', v_episode.episode_number,
          'status', v_episode.status,
          'started_at', v_episode.started_at,
          'ended_at', v_episode.ended_at,
          'referral_agent_id', v_episode.referral_agent_id
        )
      ELSE NULL END,
      'primary_visit_id', v_primary_visit_id,
      'lines', v_lines,
      'unbilled_total', v_total,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'service_charges', v_service_charges,
      'waived_items', v_waived_items,
      'invoices', v_invoices,
      'financial_summary', jsonb_build_object(
        'unbilled_total', v_total,
        'previous_invoiced', v_previous_invoiced,
        'previous_paid', v_previous_paid,
        'previous_due', v_previous_due,
        'episode_invoiced', v_episode_invoiced,
        'episode_paid', v_episode_paid,
        'episode_due', v_episode_due
      )
    );
END;
$$;

COMMENT ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) IS
'Authoritative consolidated unbilled episode charges, history, and financial summary with exact net-billable waiver derivation.';

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- Maintain alias compatibility
CREATE OR REPLACE FUNCTION public.get_episode_billing_preview(
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
BEGIN
    RETURN public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, p_as_of);
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. HARDEN CREATE_EPISODE_SETTLEMENT_INVOICE_ATOMIC_V2
--    - Authoritative cashier identity derived from auth.uid()
--    - Rejects caller cashier spoofing (p_cashier_id mismatch)
--    - Enforces billing.discount / billing.manage permission for discounts > 0
--    - Requires mandatory discount reason for discounts > 0
--    - Enforces payment method validation ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'VISA', 'MASTERCARD', 'BANK_TRANSFER')
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_paid_amount NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_referral_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_excluded_reference_ids JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID := auth.uid();
    v_effective_cashier UUID;
    v_clean_discount_reason TEXT := NULLIF(trim(p_discount_reason), '');
    v_clean_payment_method VARCHAR;
    v_episode RECORD;
    v_preview JSONB;
    v_lines JSONB;
    v_line JSONB;
    v_primary_visit_id UUID;
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_subtotal NUMERIC(14,2) := 0;
    v_discount NUMERIC(14,2) := COALESCE(p_discount_amount, 0);
    v_grand_total NUMERIC(14,2) := 0;
    v_paid NUMERIC(14,2) := COALESCE(p_paid_amount, 0);
    v_due NUMERIC(14,2) := 0;
    v_status VARCHAR(20);
    v_receipt_number TEXT;
    v_payment_id UUID;
    v_ref_id UUID;
    v_included_count INT := 0;
BEGIN
    -- 1. Authentication & Caller Identity
    IF v_calling_user IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    -- Authoritative cashier identity is derived directly from authenticated session
    v_effective_cashier := v_calling_user;

    -- Anti-Spoofing: If client supplies a cashier ID, it MUST match the authenticated caller
    IF p_cashier_id IS NOT NULL AND p_cashier_id <> v_calling_user THEN
        RAISE EXCEPTION 'CASHIER_SPOOFING_PROHIBITED: Caller identity does not match specified cashier ID';
    END IF;

    -- 2. Tenant Isolation
    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    -- 3. RBAC Privilege Enforcement
    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- 4. Patient & Episode Verification
    IF NOT EXISTS (
        SELECT 1
        FROM public.patients
        WHERE id = p_patient_id
          AND organization_id = p_org_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND';
    END IF;

    SELECT id, episode_number, status, referral_agent_id
    INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
      AND patient_id = p_patient_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_NOT_ACTIVE'; END IF;

    -- 5. Billable Lines Preview
    v_preview := public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, NOW());
    v_lines := COALESCE(v_preview->'lines', '[]'::JSONB);
    v_primary_visit_id := NULLIF(v_preview->>'primary_visit_id', '')::UUID;

    IF jsonb_array_length(v_lines) = 0 THEN
        RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    -- Calculate subtotal strictly across NON-excluded lines
    SELECT 
        COALESCE(SUM((val->>'total_price')::NUMERIC), 0),
        COUNT(*)
    INTO v_subtotal, v_included_count
    FROM jsonb_array_elements(v_lines) val
    WHERE p_excluded_reference_ids IS NULL 
       OR NOT (p_excluded_reference_ids ? (val->>'reference_id'));

    IF v_included_count = 0 OR v_subtotal <= 0 THEN
        RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    -- 6. Financial Discount Validation & Authorization
    IF v_discount < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_DISCOUNT_PROHIBITED';
    END IF;

    IF v_discount > 0 THEN
        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'billing.discount')
            OR public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        ) THEN
            RAISE EXCEPTION 'DISCOUNT_UNAUTHORIZED: billing.discount permission required for concession';
        END IF;

        IF v_clean_discount_reason IS NULL OR char_length(v_clean_discount_reason) < 3 THEN
            RAISE EXCEPTION 'DISCOUNT_REASON_REQUIRED: Non-zero discount requires an auditable reason';
        END IF;
    END IF;

    IF v_discount > v_subtotal THEN
        v_discount := v_subtotal;
    END IF;

    v_grand_total := ROUND(v_subtotal - v_discount, 2);

    -- 7. Payment Amount & Payment Method Validation
    IF v_paid < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_PAYMENT_PROHIBITED';
    END IF;

    IF v_paid > v_grand_total THEN
        v_paid := v_grand_total;
    END IF;

    v_clean_payment_method := UPPER(trim(COALESCE(p_payment_method, 'CASH')));

    IF v_paid > 0.005 THEN
        IF v_clean_payment_method NOT IN ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'VISA', 'MASTERCARD', 'BANK_TRANSFER') THEN
            RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: % is not an authorized payment method', p_payment_method;
        END IF;
    END IF;

    v_due := ROUND(v_grand_total - v_paid, 2);

    IF v_due <= 0.005 THEN
        v_status := 'PAID';
    ELSIF v_paid > 0.005 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'UNPAID';
    END IF;

    -- 8. Generate Authoritative Invoice Number
    SELECT public.generate_invoice_number(p_org_id) INTO v_invoice_number;

    -- 9. Insert Invoice with Authoritative Audited Cashier
    INSERT INTO public.invoices (
        organization_id, patient_id, episode_id, visit_id, invoice_number,
        total_amount, discount_amount, discount_reason, grand_total,
        paid_amount, due_amount, status, is_episode_settlement,
        referral_agent_id, notes, created_by, created_at, updated_at
    )
    VALUES (
        p_org_id, p_patient_id, p_episode_id, v_primary_visit_id, v_invoice_number,
        v_subtotal, v_discount, v_clean_discount_reason, v_grand_total,
        v_paid, v_due, v_status, TRUE,
        COALESCE(p_referral_agent_id, v_episode.referral_agent_id),
        p_notes, v_effective_cashier, NOW(), NOW()
    )
    RETURNING id INTO v_invoice_id;

    -- 10. Insert Invoice Items (skipping excluded references)
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        IF p_excluded_reference_ids IS NOT NULL AND p_excluded_reference_ids ? (v_line->>'reference_id') THEN
            CONTINUE;
        END IF;

        v_ref_id := NULLIF(v_line->>'reference_id', '')::UUID;

        INSERT INTO public.invoice_items (
            organization_id, invoice_id, reference_id, service_category,
            item_name, unit_price, quantity, total_price, created_at
        )
        VALUES (
            p_org_id, v_invoice_id, v_ref_id,
            COALESCE(v_line->>'service_category', 'MISC'),
            COALESCE(v_line->>'item_name', 'Service'),
            COALESCE((v_line->>'unit_price')::NUMERIC, 0),
            COALESCE((v_line->>'quantity')::NUMERIC, 1),
            COALESCE((v_line->>'total_price')::NUMERIC, 0),
            NOW()
        );

        -- Mark custom charge as billed if applicable
        IF COALESCE((v_line->>'is_custom_charge')::BOOLEAN, FALSE) = TRUE AND (v_line->>'charge_id') IS NOT NULL THEN
            UPDATE public.episode_service_charges
            SET is_billed = TRUE, status = 'BILLED', updated_at = NOW()
            WHERE id = (v_line->>'charge_id')::UUID
              AND organization_id = p_org_id;
        END IF;
    END LOOP;

    -- 11. Record Initial Payment with Authoritative Cashier
    IF v_paid > 0.005 THEN
        SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

        INSERT INTO public.payments (
            organization_id, invoice_id, patient_id, amount,
            payment_method, receipt_number, notes, cashier_id, created_by,
            payment_date, created_at
        )
        VALUES (
            p_org_id, v_invoice_id, p_patient_id, v_paid,
            v_clean_payment_method, v_receipt_number,
            COALESCE(p_notes, 'Episode final settlement initial payment'),
            v_effective_cashier, v_effective_cashier, NOW(), NOW()
        )
        RETURNING id INTO v_payment_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'grand_total', v_grand_total,
        'paid_amount', v_paid,
        'due_amount', v_due,
        'status', v_status,
        'items_count', v_included_count
    );
END;
$$;

COMMENT ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT, JSONB) IS
'Authoritative atomic episode settlement with anti-spoofing cashier verification, strict discount permissions, payment method validation, and audited ledger persistence.';

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT, JSONB) TO authenticated, service_role;
