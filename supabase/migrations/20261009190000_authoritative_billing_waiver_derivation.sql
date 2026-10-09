-- ==============================================================================
-- Migration 131: Authoritative Billing Waiver Derivation & Concurrency Hardening
-- ==============================================================================
-- Description:
--   Hardens public.waive_episode_service_atomic against client-side parameter
--   tampering and race conditions:
--   1. Validates referenced item ownership across the 5 authoritative source entities
--      (OPD consultations, Bed/Cabin stays, Critical Care admissions, Episode charges, OT bookings).
--   2. Derives item category, description, and billable amount directly from server-side data.
--   3. Enforces unbilled eligibility: rejects waivers for items already present in active invoices.
--   4. Enforces row-level locking on patient_care_episodes to prevent race conditions
--      with concurrent episode settlement invoices.
--   5. Establishes a unique partial index on active episode service waivers to guarantee
--      duplicate active waivers cannot be created for the same referenced service.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. UNIQUE ACTIVE WAIVER CONSTRAINT
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_service_waivers_active
    ON public.episode_service_waivers (organization_id, episode_id, reference_id)
    WHERE status = 'ACTIVE';

-- ------------------------------------------------------------------------------
-- 2. HARDENED ATOMIC WAIVE RPC WITH AUTHORITATIVE DERIVATION
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
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
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
            (COALESCE(u.daily_charge, 0) * public.ohms_billable_days(COALESCE(cca.admission_time, cca.admitted_at), COALESCE(cca.discharge_time, NOW())))::NUMERIC
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

    -- Derive Final Authoritative Waived Amount
    IF p_waived_amount IS NOT NULL AND p_waived_amount > 0 AND p_waived_amount <= v_derived_amount THEN
        v_final_waived_amount := ROUND(p_waived_amount, 2);
    ELSE
        v_final_waived_amount := ROUND(v_derived_amount, 2);
    END IF;

    -- Deactivate any previous active waiver for the same reference item in this episode
    UPDATE public.episode_service_waivers
    SET status = 'RESTORED', updated_at = NOW()
    WHERE organization_id = p_org_id
      AND episode_id = p_episode_id
      AND reference_id = p_reference_id
      AND status = 'ACTIVE';

    -- Insert new audited active waiver
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
'Authoritative server-validated atomic service charge waiver with source entity verification, concurrency row lock, and duplicate prevention.';

REVOKE ALL ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

COMMIT;
