-- ==============================================================================
-- MIGRATION 237: PURGE LEGACY RPC OVERLOADS, DEFAULT-DENY FUNCTION PRIVILEGES & ZERO-LEAK SECURITY HARDENING
-- ==============================================================================
-- 1. Drops legacy unhardened function overloads that were left accessible to anon/PUBLIC:
--    - update_ipd_admission_atomic (8-parameter overload with p_user_id from Migration 228)
--    - update_waiting_queue_status_atomic (4-parameter VARCHAR overload from Migration 232)
--    - Any duplicate or ambiguous function signatures.
-- 2. Enforces Default-Deny Security Model on Schema Public:
--    - Revokes automatic EXECUTE on all future functions from PUBLIC and anon.
--    - Revokes existing blanket EXECUTE on all public functions from PUBLIC and anon.
-- 3. Explicitly grants EXECUTE ONLY on certified public endpoints (read-only/rate-limited).
-- 4. Re-declares canonical update_ipd_admission_atomic with strict auth.uid() fail-closed guards.
-- 5. Re-declares canonical update_waiting_queue_status_atomic with strict auth.uid() fail-closed guards.
-- 6. Enforces explicit EXECUTE grants to authenticated and service_role for operational RPCs.
-- 7. Notifies PostgREST to reload schema cache.
-- ==============================================================================

-- 1. DROP LEGACY UNHARDENED OVERLOADS
DROP FUNCTION IF EXISTS public.update_ipd_admission_atomic(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_waiting_queue_status_atomic(UUID, UUID, VARCHAR, UUID);

-- 2. ENFORCE DEFAULT-DENY ON SCHEMA PUBLIC
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- Revoke blanket execute on all existing functions from PUBLIC and anon
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- 3. RE-DECLARE CANONICAL UPDATE_IPD_ADMISSION_ATOMIC (FAIL-CLOSED)
CREATE OR REPLACE FUNCTION public.update_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_provisional_diagnosis TEXT DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_guardian_name TEXT DEFAULT NULL,
    p_guardian_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_clinical_findings TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_visit RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- Strict Authentication Gate: fail-closed for anonymous callers
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to update IPD admission.' USING ERRCODE = '42501';
    END IF;

    -- Authorization Gate: caller must have operational role or ipd permissions
    IF v_caller IS NULL OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller
              AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse', 'receptionist') OR is_super_admin = TRUE)
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.role_permissions rp
                JOIN public.user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = v_caller
                  AND ur.organization_id = p_org_id
                  AND (rp.permission_key IN ('ipd.manage', 'ipd.admit', 'ipd.discharge', 'patients.edit') OR rp.permission_key = '*')
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access Denied: Inpatient management permission required to update admission.' USING ERRCODE = '42501';
    END IF;

    -- Validate and lock visit
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Inpatient admission record not found.');
    END IF;

    IF UPPER(v_visit.status) = 'DISCHARGED' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot edit admission: Patient is already discharged.');
    END IF;

    -- Update visit details
    UPDATE public.patient_visits
    SET provisional_diagnosis = COALESCE(TRIM(p_provisional_diagnosis), provisional_diagnosis),
        doctor_id = COALESCE(p_doctor_id, doctor_id),
        notes = COALESCE(TRIM(p_notes), notes),
        clinical_findings = COALESCE(TRIM(p_clinical_findings), clinical_findings),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- Update patient demographics if provided
    IF p_guardian_name IS NOT NULL OR p_guardian_phone IS NOT NULL THEN
        UPDATE public.patients
        SET guardian_name = COALESCE(TRIM(p_guardian_name), guardian_name),
            emergency_contact = COALESCE(TRIM(p_guardian_phone), emergency_contact),
            updated_at = NOW()
        WHERE id = v_visit.patient_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'IPD admission record updated successfully.',
        'visit_id', p_visit_id
    );
END;
$$;

-- 4. RE-DECLARE CANONICAL UPDATE_WAITING_QUEUE_STATUS_ATOMIC (FAIL-CLOSED)
CREATE OR REPLACE FUNCTION public.update_waiting_queue_status_atomic(
    p_org_id UUID,
    p_queue_id UUID,
    p_status TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := COALESCE(auth.uid(), p_user_id);
    v_queue RECORD;
    v_new_status TEXT := UPPER(TRIM(p_status));
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- Strict Authentication Gate: fail-closed for anonymous callers
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to manage OPD queue.' USING ERRCODE = '42501';
    END IF;

    -- Authorization Gate
    IF v_caller IS NULL OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller
              AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse', 'receptionist') OR is_super_admin = TRUE)
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.role_permissions rp
                JOIN public.user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = v_caller
                  AND ur.organization_id = p_org_id
                  AND (rp.permission_key IN ('opd.queue', 'opd.manage', 'appointments.manage') OR rp.permission_key = '*')
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access Denied: OPD queue management permission required.' USING ERRCODE = '42501';
    END IF;

    -- Validate Status
    IF v_new_status NOT IN ('WAITING', 'CALLED', 'SERVING', 'IN_ROOM', 'COMPLETED', 'CANCELLED', 'SKIPPED', 'NO_SHOW') THEN
        RAISE EXCEPTION 'Invalid queue status: %. Must be WAITING, CALLED, IN_ROOM/SERVING, COMPLETED, CANCELLED, or NO_SHOW.', p_status;
    END IF;

    -- Normalize IN_ROOM / SERVING
    IF v_new_status = 'SERVING' THEN
        v_new_status := 'IN_ROOM';
    END IF;

    -- Lock Queue Entry
    SELECT * INTO v_queue
    FROM public.waiting_queue
    WHERE id = p_queue_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Queue entry not found.');
    END IF;

    -- Update Queue Status and Timestamps
    UPDATE public.waiting_queue
    SET queue_status = v_new_status,
        status = v_new_status,
        started_at = CASE 
            WHEN v_new_status IN ('CALLED', 'IN_ROOM') AND started_at IS NULL THEN NOW() 
            ELSE started_at 
        END,
        finished_at = CASE 
            WHEN v_new_status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW') THEN NOW() 
            ELSE finished_at 
        END,
        called_at = CASE 
            WHEN v_new_status = 'CALLED' THEN NOW() 
            ELSE called_at 
        END,
        updated_at = NOW()
    WHERE id = p_queue_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'queue_id', p_queue_id,
        'status', v_new_status,
        'message', 'Queue status updated successfully.'
    );
END;
$$;

-- 5. EXPLICITLY GRANT CERTIFIED PUBLIC FUNCTIONS TO ANON & AUTHENTICATED
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics TO anon, authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_public_online_booking_metadata') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_public_online_booking_metadata TO anon, authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_public_doctor_available_slots') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_public_doctor_available_slots TO anon, authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_public_verified_doctors') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_public_verified_doctors TO anon, authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_public_online_appointment_booking') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_public_online_appointment_booking TO anon, authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'track_public_online_booking_status') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.track_public_online_booking_status TO anon, authenticated, service_role;';
    END IF;
END $$;

-- 6. EXPLICITLY GRANT AUTHENTICATED & SERVICE_ROLE ON CANONICAL OPERATIONAL RPCS
GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ipd_admission_atomic(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_waiting_queue_status_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_role_permissions_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_role_permissions_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverse_journal_entry_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'settle_referral_commissions_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_referral_commissions_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_invoice_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_invoice_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'void_invoice_and_reverse_gl_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_gl_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_blood_transfusion_dossier_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_blood_transfusion_dossier_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'run_authoritative_health_cycle') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_authoritative_health_cycle TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_hospital_expense_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reconcile_bed_vacancy_drift_atomic') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.reconcile_bed_vacancy_drift_atomic TO authenticated, service_role;';
    END IF;
END $$;

-- 7. NOTIFY POSTGREST SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
