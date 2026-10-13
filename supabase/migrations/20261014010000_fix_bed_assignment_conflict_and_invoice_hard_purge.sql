-- Migration: 20261014010000_fix_bed_assignment_conflict_and_invoice_hard_purge.sql
-- Description:
--   1. Harden journal entry and line immutability triggers (trg_fn_enforce_journal_entry_immutability,
--      trg_fn_enforce_journal_line_immutability) to support in-transaction override
--      (app.override_journal_immutability = 'on') for authorized Super Admin permanent purges.
--   2. Upgrade delete_invoice_super_admin_atomic to set transaction-local override and purge
--      all dependent financial and journal records (reconciliations, intents, commissions, claims,
--      refunds, payments, items, journal_entry_lines, journal_entries) before deleting invoice.
--   3. Reconcile bed & cabin occupancy statuses with existing active assignments and install
--      real-time synchronization trigger (trg_sync_bed_occupancy) on bed_assignments.
--   4. Upgrade create_patient_intake_atomic to lock beds/cabins FOR UPDATE and verify no active
--      assignment exists before inserting, gracefully catching unique constraint conflicts.

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. JOURNAL IMMUTABILITY TRIGGER UPGRADE (IN-TRANSACTION SUPER ADMIN PURGE OVERRIDE)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_line_count INT;
    v_sum_debit NUMERIC(14, 2);
    v_sum_credit NUMERIC(14, 2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Allow authorized transaction-local override by Super Admin permanent purge
        IF current_setting('app.override_journal_immutability', true) = 'on' THEN
            RETURN OLD;
        END IF;

        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Error: Cannot delete posted/reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Allow controlled atomic transition from PENDING or DRAFT to POSTED
        IF OLD.status IN ('DRAFT', 'PENDING') AND NEW.status = 'POSTED' THEN
            -- Invariant 1: Total Debit must equal Total Credit and be positive
            IF NEW.total_debit != NEW.total_credit OR NEW.total_debit <= 0 THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Journal entry must have non-zero balanced totals (debit=%, credit=%)',
                    NEW.total_debit, NEW.total_credit USING ERRCODE = '22023';
            END IF;

            -- Invariant 2: Line count must be at least 2
            SELECT COUNT(*), COALESCE(SUM(debit), 0.00), COALESCE(SUM(credit), 0.00)
            INTO v_line_count, v_sum_debit, v_sum_credit
            FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id;

            IF v_line_count < 2 THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Journal entry % must have at least 2 lines (found %)',
                    NEW.entry_number, v_line_count USING ERRCODE = '22023';
            END IF;

            -- Invariant 3: Line sums must strictly match header totals
            IF v_sum_debit != NEW.total_debit OR v_sum_credit != NEW.total_credit THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Line sums (DR=%, CR=%) do not match header totals (DR=%, CR=%) for %',
                    v_sum_debit, v_sum_credit, NEW.total_debit, NEW.total_credit, NEW.entry_number USING ERRCODE = '22023';
            END IF;

            RETURN NEW;
        END IF;

        -- Allow transition from POSTED to REVERSED ONLY when financial figures and all metadata are strictly unchanged
        IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED' THEN
            IF NEW.entry_number = OLD.entry_number
               AND NEW.organization_id = OLD.organization_id
               AND NEW.entry_date = OLD.entry_date
               AND NEW.reference_type IS NOT DISTINCT FROM OLD.reference_type
               AND NEW.reference_id IS NOT DISTINCT FROM OLD.reference_id
               AND NEW.description IS NOT DISTINCT FROM OLD.description
               AND NEW.total_debit = OLD.total_debit
               AND NEW.total_credit = OLD.total_credit
               AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
               AND NEW.created_at = OLD.created_at THEN
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'Immutable Journal Error: Cannot alter financial fields, metadata, or dates during reversal of journal % (ID %)',
                    OLD.entry_number, OLD.id USING ERRCODE = '23506';
            END IF;
        END IF;

        -- All other modifications to posted or reversed entries are strictly prohibited
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Error: Cannot modify posted or reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_immutability ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_immutability
    BEFORE UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_enforce_journal_entry_immutability();


CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_status VARCHAR(20);
    v_parent_number VARCHAR(40);
    v_target_status VARCHAR(20);
    v_target_number VARCHAR(40);
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Allow authorized transaction-local override by Super Admin permanent purge
        IF current_setting('app.override_journal_immutability', true) = 'on' THEN
            RETURN OLD;
        END IF;

        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot delete lines for posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = NEW.journal_entry_id;

        -- Block insertions into already posted or reversed entries
        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot insert lines into already posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Check source journal entry status
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot modify lines belonging to posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;

        -- Block Line Move Attack: Moving a line to a different journal entry
        IF NEW.journal_entry_id != OLD.journal_entry_id THEN
            SELECT status, entry_number INTO v_target_status, v_target_number
            FROM public.journal_entries
            WHERE id = NEW.journal_entry_id;

            IF v_target_status IN ('POSTED', 'REVERSED') THEN
                RAISE EXCEPTION 'Immutable Journal Line Error: Cannot transfer line into posted/reversed entry %',
                    v_target_number USING ERRCODE = '23506';
            END IF;

            RAISE EXCEPTION 'Immutable Journal Line Error: Transferring lines across journal entries is strictly prohibited'
                USING ERRCODE = '23506';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_immutability ON public.journal_entry_lines;
CREATE TRIGGER trg_journal_lines_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_enforce_journal_line_immutability();


-- -------------------------------------------------------------------------------------
-- 2. HARDENED SUPER ADMIN PERMANENT INVOICE PURGE RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_admin_id UUID,
  p_reason TEXT,
  p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv RECORD;
  v_payment_count INT;
  v_inv_number TEXT;
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
BEGIN
  -- A. Input validation
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  -- B. Direct RPC caller authentication hardening
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- C. Role verification: Enforce active Super Admin role via user_roles & roles
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Permanent invoice deletion requires active Super Admin role in this organization.';
  END IF;

  -- D. Lock target invoice and verify tenant
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  -- E. In-Transaction Mandatory Audit Logging (Rolls back if audit fails)
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    module,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    p_org_id,
    p_admin_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING',
    'invoices',
    p_invoice_id::text,
    to_jsonb(v_inv),
    jsonb_build_object(
      'invoice_number', v_inv_number,
      'reason', p_reason,
      'permanent_purge', p_permanent_purge,
      'total_amount', v_inv.total_amount,
      'paid_amount', v_inv.paid_amount,
      'due_amount', v_inv.due_amount,
      'status', v_inv.status,
      'timestamp', NOW()
    ),
    NOW()
  );

  -- F. Branching execution based on purge mode
  IF p_permanent_purge THEN
    -- Authoritative local transactional bypass for Super Admin hard purge
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- 1. Dependent payment integrations & reconciliations
    DELETE FROM public.payment_reconciliations WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payment_intents WHERE invoice_id = p_invoice_id;
    DELETE FROM public.referral_commissions WHERE invoice_id = p_invoice_id;
    DELETE FROM public.insurance_claims WHERE invoice_id = p_invoice_id;

    -- 2. Financial transactions & line items
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- 3. Journal entries and lines associated with this invoice
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = p_invoice_id
         OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
    );

    DELETE FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%');

    -- 4. Delete invoice root
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice, line items, payments, and associated journal entries permanently purged.'
    );
  ELSE
    -- SOFT CANCEL / VOID: Fail closed if real revenue collected
    IF v_inv.status = 'PAID' OR v_inv.paid_amount > 0 THEN
      SELECT COUNT(*) INTO v_payment_count
      FROM public.payments
      WHERE invoice_id = p_invoice_id;

      IF v_payment_count > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot soft-delete an invoice with collected payments. Use permanent purge with valid justification or process refund.'
        );
      END IF;
    END IF;

    UPDATE public.invoices
    SET status = 'VOID',
        is_voided = TRUE,
        voided_by = p_admin_id,
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice marked as void successfully.'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.delete_invoice_super_admin_atomic(p_org_id, p_invoice_id, p_admin_id, p_reason, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) FROM anon, public;


-- -------------------------------------------------------------------------------------
-- 3. BED & CABIN OCCUPANCY SYNCHRONIZATION AND REAL-TIME TRIGGER
-- -------------------------------------------------------------------------------------

-- One-time reconciliation of beds & cabins with active assignments
UPDATE public.beds b
SET status = 'OCCUPIED', updated_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM public.bed_assignments ba 
    WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE'
) AND b.status != 'OCCUPIED';

UPDATE public.cabins c
SET status = 'OCCUPIED', updated_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM public.bed_assignments ba 
    WHERE ba.cabin_id = c.id AND ba.status = 'ACTIVE'
) AND c.status != 'OCCUPIED';

-- Real-time trigger function
CREATE OR REPLACE FUNCTION public.trg_fn_sync_bed_occupancy_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        IF OLD.status = 'ACTIVE' AND NEW.status != 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'AVAILABLE', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'AVAILABLE', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'AVAILABLE', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'AVAILABLE', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bed_occupancy ON public.bed_assignments;
CREATE TRIGGER trg_sync_bed_occupancy
AFTER INSERT OR UPDATE OR DELETE ON public.bed_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_bed_occupancy_status();


-- -------------------------------------------------------------------------------------
-- 4. HARDENED create_patient_intake_atomic WITH STRICT BED & CABIN CONCURRENCY CHECK
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_patient_intake_atomic(p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_actor_id UUID;
    v_org_id UUID;
    v_encounter_at TIMESTAMPTZ;
    v_services JSONB;
    v_patient JSONB;
    v_opd JSONB;
    v_ipd JSONB;
    v_cc JSONB;
    v_ot JSONB;

    v_patient_id UUID;
    v_patient_code TEXT;
    v_registration_serial TEXT;
    v_episode_id UUID;
    v_episode_number TEXT;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
    v_cc_visit_id UUID;
    v_bed_assignment_id UUID;
    v_cca_id UUID;
    v_ot_booking_id UUID;

    v_dob DATE;
    v_age INT;
    v_nid TEXT;
    v_gender VARCHAR(10);
    v_phone TEXT;
    v_full_name TEXT;

    v_department_id UUID;
    v_doctor_id UUID;
    v_referral_agent_id UUID;
    v_unit_id UUID;
    v_bed_id UUID;
    v_cabin_id UUID;
    v_ot_room_id UUID;
    v_ot_surgeon_id UUID;
    v_ot_anesthetist_id UUID;

    v_opd_fee NUMERIC(10, 2) := 500.00;
    v_bed_charge NUMERIC(10, 2) := 0.00;
    v_cc_charge NUMERIC(10, 2) := 0.00;
    v_ot_charge NUMERIC(10, 2) := 6000.00;
    v_visit_number TEXT;
    v_ot_procedure TEXT;
    v_bed_number_cc TEXT;
    v_target_status TEXT;
    v_target_label TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    v_org_id := NULLIF(trim(p_request->>'organization_id'), '')::UUID;
    IF v_org_id IS NULL THEN
        v_org_id := private.get_current_org_id();
    END IF;

    IF v_org_id IS NULL OR private.get_current_org_id() IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(v_org_id, 'patients.create')
        OR public.is_org_admin_or_has_permission(v_org_id, 'reception.manage')
        OR public.is_org_admin_or_has_permission(v_org_id, 'ipd.admit')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_INTAKE';
    END IF;

    v_actor_id := v_caller_id;

    v_encounter_at := COALESCE(
        NULLIF(trim(COALESCE(p_request->>'encounter_time', p_request->>'encounterAt', p_request->>'encounter_at')), '')::TIMESTAMPTZ,
        NOW()
    );

    v_patient := COALESCE(p_request->'patient', '{}'::JSONB);
    v_services := COALESCE(p_request->'services', '{}'::JSONB);

    -- Resilient extraction supporting nested services and top-level keys
    v_opd := COALESCE(v_services->'opd', p_request->'opd');
    v_ipd := COALESCE(v_services->'ipd', p_request->'ipd');
    v_cc := COALESCE(v_services->'criticalCare', v_services->'critical_care', p_request->'criticalCare', p_request->'critical_care');
    v_ot := COALESCE(v_services->'ot', p_request->'ot');

    v_referral_agent_id := NULLIF(COALESCE(
        p_request->>'referral_agent_id',
        p_request->>'referralAgentId',
        v_ipd->>'referral_agent_id',
        v_ipd->>'referralAgentId'
    ), '')::UUID;

    v_full_name := trim(COALESCE(v_patient->>'full_name', v_patient->>'fullName', ''));
    v_phone := trim(COALESCE(v_patient->>'phone', ''));
    v_gender := UPPER(COALESCE(NULLIF(trim(v_patient->>'gender'), ''), 'OTHER'));
    IF v_gender NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        v_gender := 'OTHER';
    END IF;

    IF v_full_name = '' THEN
        RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
    END IF;

    IF v_phone = '' THEN
        RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
    END IF;

    v_nid := NULLIF(COALESCE(v_patient->>'nid', v_patient->>'nid_or_birth_cert'), '');
    v_dob := NULLIF(v_patient->>'dob', '')::DATE;
    v_age := NULLIF(COALESCE(v_patient->>'age_years', v_patient->>'age'), '')::INT;

    v_patient_id := NULLIF(COALESCE(p_request->>'patient_id', p_request->>'existingPatientId', p_request->>'existing_patient_id'), '')::UUID;

    -- Lookup existing or insert new patient
    IF v_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_patient_id AND organization_id = v_org_id;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;
    ELSE
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE organization_id = v_org_id
          AND phone = v_phone
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;

        IF v_patient_id IS NULL AND v_nid IS NOT NULL THEN
            SELECT id, patient_code, registration_serial
            INTO v_patient_id, v_patient_code, v_registration_serial
            FROM public.patients
            WHERE organization_id = v_org_id
              AND (nid_or_birth_cert = v_nid OR nid = v_nid)
            LIMIT 1;
        END IF;

        IF v_patient_id IS NULL THEN
            SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
            SELECT public.generate_patient_registration_serial(v_org_id, v_encounter_at) INTO v_registration_serial;

            INSERT INTO public.patients (
                organization_id, patient_code, registration_serial,
                full_name, phone, alternate_phone, email, gender, blood_group, dob,
                marital_status, occupation, emergency_contact_name,
                emergency_contact_phone, emergency_contact_relation,
                nid_or_birth_cert, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_code, v_registration_serial,
                v_full_name, v_phone,
                NULLIF(trim(COALESCE(v_patient->>'alternate_phone', v_patient->>'alternatePhone')), ''),
                NULLIF(trim(v_patient->>'email'), ''),
                v_gender,
                NULLIF(trim(v_patient->>'blood_group'), ''),
                v_dob,
                NULLIF(trim(v_patient->>'marital_status'), ''),
                NULLIF(trim(v_patient->>'occupation'), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_name', v_patient->>'emergencyName')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_phone', v_patient->>'emergencyPhone')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_relation', v_patient->>'emergencyRelation')), ''),
                v_nid,
                v_actor_id,
                NOW(),
                NOW()
            )
            RETURNING id INTO v_patient_id;
        END IF;
    END IF;

    -- Create Patient Care Episode
    SELECT public.generate_episode_number(v_org_id) INTO v_episode_number;

    INSERT INTO public.patient_care_episodes (
        organization_id, patient_id, episode_number,
        status, referral_agent_id, started_at, created_at, updated_at
    )
    VALUES (
        v_org_id, v_patient_id, v_episode_number,
        'ACTIVE', v_referral_agent_id, v_encounter_at, NOW(), NOW()
    )
    RETURNING id INTO v_episode_id;

    -- Common visit_number format
    v_visit_number := 'VISIT-' || TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6);

    -- Service Branch: OPD
    IF v_opd IS NOT NULL AND v_opd != 'null'::JSONB AND COALESCE((v_opd->>'enabled')::BOOLEAN, TRUE) THEN
        v_department_id := NULLIF(COALESCE(v_opd->>'department_id', v_opd->>'departmentId'), '')::UUID;
        v_doctor_id := NULLIF(COALESCE(v_opd->>'doctor_id', v_opd->>'doctorId'), '')::UUID;

        IF v_doctor_id IS NOT NULL THEN
            SELECT COALESCE(opd_fee, consultation_fee, 500.00) INTO v_opd_fee
            FROM public.doctors
            WHERE id = v_doctor_id;
        END IF;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, chief_complaint, admitted_at,
            opd_fee_snapshot, status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'OPD', v_department_id, v_doctor_id,
            NULLIF(trim(COALESCE(v_opd->>'chief_complaint', v_opd->>'chiefComplaint')), ''),
            v_encounter_at,
            v_opd_fee,
            'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_opd_visit_id;

        v_visit_id := v_opd_visit_id;
    END IF;

    -- Service Branch: IPD
    IF v_ipd IS NOT NULL AND v_ipd != 'null'::JSONB AND COALESCE((v_ipd->>'enabled')::BOOLEAN, TRUE) THEN
        v_department_id := NULLIF(COALESCE(v_ipd->>'department_id', v_ipd->>'departmentId'), '')::UUID;
        v_doctor_id := NULLIF(COALESCE(v_ipd->>'doctor_id', v_ipd->>'doctorId'), '')::UUID;
        v_bed_id := NULLIF(COALESCE(v_ipd->>'bed_id', v_ipd->>'bedId'), '')::UUID;
        v_cabin_id := NULLIF(COALESCE(v_ipd->>'cabin_id', v_ipd->>'cabinId'), '')::UUID;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, chief_complaint, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'IPD', v_department_id, v_doctor_id,
            NULLIF(trim(COALESCE(v_ipd->>'provisional_diagnosis', v_ipd->>'provisionalDiagnosis')), ''),
            v_encounter_at,
            'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_ipd_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_ipd_visit_id;
        END IF;

        IF v_bed_id IS NOT NULL THEN
            -- 1. Lock bed row FOR UPDATE to guard against race conditions
            SELECT status, bed_number, daily_rate 
            INTO v_target_status, v_target_label, v_bed_charge
            FROM public.beds
            WHERE id = v_bed_id
            FOR UPDATE;

            IF v_target_status IS NULL THEN
                RAISE EXCEPTION 'BED_NOT_FOUND: Selected bed does not exist.' USING ERRCODE = 'P0002';
            END IF;

            -- 2. Verify no active assignment in bed_assignments
            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE bed_id = v_bed_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is already occupied by an active patient.', v_target_label USING ERRCODE = '23505';
            END IF;

            -- 3. Verify bed status is vacant or available
            IF UPPER(COALESCE(v_target_status, '')) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is currently in % status and cannot accept admission.', v_target_label, v_target_status USING ERRCODE = '23505';
            END IF;

            UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_bed_id;
        ELSIF v_cabin_id IS NOT NULL THEN
            -- 1. Lock cabin row FOR UPDATE
            SELECT status, cabin_number, daily_rate 
            INTO v_target_status, v_target_label, v_bed_charge
            FROM public.cabins
            WHERE id = v_cabin_id
            FOR UPDATE;

            IF v_target_status IS NULL THEN
                RAISE EXCEPTION 'CABIN_NOT_FOUND: Selected cabin does not exist.' USING ERRCODE = 'P0002';
            END IF;

            -- 2. Verify no active assignment in bed_assignments
            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE cabin_id = v_cabin_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is already occupied by an active patient.', v_target_label USING ERRCODE = '23505';
            END IF;

            -- 3. Verify cabin status is vacant or available
            IF UPPER(COALESCE(v_target_status, '')) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is currently in % status and cannot accept admission.', v_target_label, v_target_status USING ERRCODE = '23505';
            END IF;

            UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_cabin_id;
        END IF;

        IF v_bed_id IS NOT NULL OR v_cabin_id IS NOT NULL THEN
            BEGIN
                INSERT INTO public.bed_assignments (
                    organization_id, visit_id, patient_id, bed_id, cabin_id,
                    assigned_at, daily_charge, status, assigned_by
                )
                VALUES (
                    v_org_id, v_ipd_visit_id, v_patient_id, v_bed_id, v_cabin_id,
                    v_encounter_at, COALESCE(v_bed_charge, 0), 'ACTIVE', v_actor_id
                )
                RETURNING id INTO v_bed_assignment_id;
            EXCEPTION
                WHEN unique_violation THEN
                    IF v_bed_id IS NOT NULL THEN
                        RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is already occupied by another active patient.', COALESCE(v_target_label, 'selected') USING ERRCODE = '23505';
                    ELSE
                        RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is already occupied by another active patient.', COALESCE(v_target_label, 'selected') USING ERRCODE = '23505';
                    END IF;
            END;
        END IF;
    END IF;

    -- Service Branch: Critical Care
    IF v_cc IS NOT NULL AND v_cc != 'null'::JSONB AND COALESCE((v_cc->>'enabled')::BOOLEAN, TRUE) THEN
        v_unit_id := NULLIF(COALESCE(v_cc->>'unit_id', v_cc->>'unitId'), '')::UUID;
        v_bed_number_cc := COALESCE(v_cc->>'bed_number', v_cc->>'bedNumber', '1');

        -- Ensure unit exists
        IF v_unit_id IS NULL THEN
            SELECT id INTO v_unit_id FROM public.critical_care_units WHERE organization_id = v_org_id AND is_active = TRUE LIMIT 1;
        END IF;
        IF v_unit_id IS NULL THEN
            SELECT id INTO v_unit_id FROM public.critical_care_units WHERE is_active = TRUE LIMIT 1;
        END IF;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, admitted_at, status, chief_complaint, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'EMERGENCY', v_encounter_at, 'ACTIVE',
            COALESCE(NULLIF(trim(COALESCE(v_cc->>'initial_diagnosis', v_cc->>'initialDiagnosis')), ''), 'Critical Care Admission'),
            v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_cc_visit_id;
        END IF;

        IF v_unit_id IS NOT NULL THEN
            SELECT COALESCE(daily_charge, 0) INTO v_cc_charge FROM public.critical_care_units WHERE id = v_unit_id;

            INSERT INTO public.critical_care_admissions (
                organization_id, patient_id, episode_id, unit_id,
                bed_number, initial_diagnosis, admission_time, status, created_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_unit_id,
                v_bed_number_cc,
                NULLIF(trim(COALESCE(v_cc->>'initial_diagnosis', v_cc->>'initialDiagnosis')), ''),
                v_encounter_at,
                'ADMITTED',
                NOW()
            )
            RETURNING id INTO v_cca_id;

            -- Update CC bed occupancy if bed exists
            UPDATE public.beds
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE organization_id = v_org_id
              AND bed_number = v_bed_number_cc
              AND (critical_care_unit_id = v_unit_id OR v_unit_id IS NULL);
        END IF;
    END IF;

    -- Service Branch: OT
    IF v_ot IS NOT NULL AND v_ot != 'null'::JSONB AND COALESCE((v_ot->>'enabled')::BOOLEAN, TRUE) THEN
        IF v_visit_id IS NULL THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, admitted_at, status, chief_complaint, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number,
                'IPD', v_encounter_at, 'ACTIVE',
                'Operation Theatre Surgery',
                v_actor_id, NOW(), NOW()
            )
            RETURNING id INTO v_visit_id;
        END IF;

        v_ot_room_id := NULLIF(COALESCE(v_ot->>'ot_room_id', v_ot->>'roomId', v_ot->>'room_id'), '')::UUID;
        v_ot_surgeon_id := NULLIF(COALESCE(v_ot->>'surgeon_id', v_ot->>'surgeonId', v_ot->>'lead_surgeon_id'), '')::UUID;
        v_ot_anesthetist_id := NULLIF(COALESCE(v_ot->>'anesthetist_id', v_ot->>'anesthetistId'), '')::UUID;
        v_ot_charge := COALESCE((v_ot->>'ot_charge')::NUMERIC, (v_ot->>'estimatedCharge')::NUMERIC, 6000.00);
        v_ot_procedure := COALESCE(NULLIF(trim(COALESCE(v_ot->>'procedure_name', v_ot->>'procedureName')), ''), 'General Surgical Procedure');

        -- Resilient OT room resolution
        IF v_ot_room_id IS NULL THEN
            SELECT id INTO v_ot_room_id FROM public.ot_rooms WHERE organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_ot_room_id IS NULL THEN
            SELECT id INTO v_ot_room_id FROM public.ot_rooms LIMIT 1;
        END IF;
        IF v_ot_room_id IS NULL THEN
            INSERT INTO public.ot_rooms (organization_id, room_number, room_name, is_major_ot, status)
            VALUES (v_org_id, 'OT-01', 'Main Operation Theatre', TRUE, 'AVAILABLE')
            ON CONFLICT (organization_id, room_number) DO UPDATE SET status = 'AVAILABLE'
            RETURNING id INTO v_ot_room_id;
        END IF;

        IF v_ot_surgeon_id IS NULL THEN
            SELECT id INTO v_ot_surgeon_id FROM public.doctors WHERE organization_id = v_org_id AND is_active = TRUE LIMIT 1;
        END IF;
        IF v_ot_surgeon_id IS NULL THEN
            SELECT id INTO v_ot_surgeon_id FROM public.doctors LIMIT 1;
        END IF;

        IF v_ot_room_id IS NOT NULL AND v_ot_surgeon_id IS NOT NULL THEN
            INSERT INTO public.ot_bookings (
                organization_id, visit_id, ot_room_id, lead_surgeon_id, surgeon_id,
                anesthetist_id, procedure_name, scheduled_start, scheduled_end,
                ot_charge, status, created_at, updated_at
            )
            VALUES (
                v_org_id, v_visit_id, v_ot_room_id,
                v_ot_surgeon_id,
                v_ot_surgeon_id,
                v_ot_anesthetist_id,
                v_ot_procedure,
                v_encounter_at,
                v_encounter_at + INTERVAL '2 hours',
                v_ot_charge,
                'SCHEDULED',
                NOW(),
                NOW()
            )
            RETURNING id INTO v_ot_booking_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'primary_visit_id', v_visit_id,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'ipd_assignment_id', v_bed_assignment_id,
        'critical_care_admission_id', v_cca_id,
        'ot_booking_id', v_ot_booking_id,
        'encounter_at', v_encounter_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

COMMIT;
