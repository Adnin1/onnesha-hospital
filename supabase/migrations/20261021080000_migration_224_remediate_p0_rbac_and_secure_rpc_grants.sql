-- ==============================================================================
-- MIGRATION 224: REMEDIATE P0 RBAC MUTATION & SECURE RPC & TABLE GRANTS
-- 1. Fix P0 vulnerability in public.save_role_permissions_atomic (prevent unauthenticated role mutation).
-- 2. Secure public.get_organization_role_permissions_matrix (enforce organization admin authorization).
-- 3. Secure Telegram Queue RPCs (claim_next_telegram_command_atomic, enqueue_telegram_command_atomic, claim_telegram_update_atomic, complete_telegram_update_atomic).
-- 4. Revoke anonymous execution (anon, PUBLIC) from sensitive internal and accounting RPCs.
-- 5. Add tenant-isolation RLS policies and revoke anonymous table grants on 26 un-policied tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. P0 FIX: save_role_permissions_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_role_permissions_atomic(
  p_org_id UUID,
  p_role_name TEXT,
  p_permission_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
  v_perm_key TEXT;
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
BEGIN
  -- Strict validation of organization context
  IF p_org_id IS NULL OR p_role_name IS NULL OR TRIM(p_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID and role name required.');
  END IF;

  -- Verify caller: Only trusted service_role OR authenticated admin in target org
  IF (auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
    v_is_authorized := true;
  ELSIF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND ur.organization_id = p_org_id
        AND r.name IN ('super_admin', 'admin', 'hospital_administrator')
    ) INTO v_is_authorized;
  ELSE
    -- Anonymous / unauthenticated callers are strictly denied
    v_is_authorized := false;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only authorized administrator can modify RBAC permissions.');
  END IF;

  -- Find or create role for this organization
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE organization_id = p_org_id AND name = TRIM(p_role_name);

  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (organization_id, name, description, is_system, created_at)
    VALUES (p_org_id, TRIM(p_role_name), 'Configured role: ' || TRIM(p_role_name), false, now())
    RETURNING id INTO v_role_id;
  END IF;

  -- Ensure all permission keys exist in public.permissions catalog if catalog exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    IF p_permission_keys IS NOT NULL AND array_length(p_permission_keys, 1) > 0 THEN
      FOREACH v_perm_key IN ARRAY p_permission_keys
      LOOP
        IF v_perm_key IS NOT NULL AND TRIM(v_perm_key) <> '' THEN
          INSERT INTO public.permissions (key, module, description)
          VALUES (TRIM(v_perm_key), split_part(TRIM(v_perm_key), '.', 1), 'System permission ' || TRIM(v_perm_key))
          ON CONFLICT (key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Atomically sync role_permissions
  DELETE FROM public.role_permissions WHERE role_id = v_role_id;

  IF p_permission_keys IS NOT NULL AND array_length(p_permission_keys, 1) > 0 THEN
    FOREACH v_perm_key IN ARRAY p_permission_keys
    LOOP
      IF v_perm_key IS NOT NULL AND TRIM(v_perm_key) <> '' THEN
        INSERT INTO public.role_permissions (role_id, permission_key)
        VALUES (v_role_id, TRIM(v_perm_key))
        ON CONFLICT (role_id, permission_key) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'role_id', v_role_id,
    'role_name', TRIM(p_role_name),
    'permissions_count', COALESCE(array_length(p_permission_keys, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. SECURE: get_organization_role_permissions_matrix
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_role_permissions_matrix(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_role RECORD;
  v_perms JSONB;
  v_is_authorized BOOLEAN := false;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID required');
  END IF;

  -- Authorization check
  IF (auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = p_org_id
        AND r.name IN ('super_admin', 'admin', 'hospital_administrator', 'hr_manager')
    ) INTO v_is_authorized;
  ELSE
    v_is_authorized := false;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Unauthorized access to organization role matrix.');
  END IF;

  FOR v_role IN 
    SELECT r.id, r.name 
    FROM public.roles r 
    WHERE r.organization_id = p_org_id
  LOOP
    SELECT COALESCE(jsonb_agg(rp.permission_key), '[]'::jsonb)
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id = v_role.id;

    v_result := jsonb_set(v_result, ARRAY[v_role.name], v_perms, true);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'matrix', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_role_permissions_matrix(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. SECURE: Telegram Queue RPCs
-- ------------------------------------------------------------------------------

-- 3A. claim_next_telegram_command_atomic: ONLY service_role or authenticated super_admin
CREATE OR REPLACE FUNCTION public.claim_next_telegram_command_atomic(
    p_worker_id TEXT DEFAULT 'local-agent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cmd RECORD;
    v_is_authorized BOOLEAN := false;
BEGIN
    IF (auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
      v_is_authorized := true;
    ELSIF auth.uid() IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND r.name = 'super_admin'
      ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only authorized background worker or super_admin can claim queue commands');
    END IF;

    SELECT * INTO v_cmd
    FROM public.telegram_command_queue
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'has_command', false);
    END IF;

    UPDATE public.telegram_command_queue
    SET status = 'PROCESSING',
        processed_at = NOW(),
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id, 'claimed_at', NOW())
    WHERE id = v_cmd.id;

    RETURN jsonb_build_object(
        'success', true,
        'has_command', true,
        'queue_id', v_cmd.id,
        'update_id', v_cmd.update_id,
        'chat_id', v_cmd.chat_id,
        'user_id', v_cmd.user_id,
        'command_text', v_cmd.command_text,
        'payload', v_cmd.payload,
        'created_at', v_cmd.created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) TO authenticated, service_role;

-- 3B. enqueue_telegram_command_atomic: Require service_role or authenticated admin
CREATE OR REPLACE FUNCTION public.enqueue_telegram_command_atomic(
    p_update_id BIGINT,
    p_chat_id BIGINT,
    p_user_id BIGINT,
    p_command_text TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_queue_id UUID;
    v_existing RECORD;
    v_is_authorized BOOLEAN := false;
BEGIN
    IF (auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role')) THEN
      v_is_authorized := true;
    ELSIF auth.uid() IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND r.name IN ('super_admin', 'admin')
      ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Direct queue enqueue requires service_role or admin authentication');
    END IF;

    IF p_chat_id IS NULL OR p_user_id IS NULL OR p_command_text IS NULL OR TRIM(p_command_text) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
    END IF;

    -- Update deduplication if update_id is provided
    IF p_update_id IS NOT NULL AND p_update_id > 0 THEN
        SELECT id, status INTO v_existing
        FROM public.telegram_command_queue
        WHERE update_id = p_update_id
        LIMIT 1;

        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'queue_id', v_existing.id,
                'status', v_existing.status
            );
        END IF;
    END IF;

    INSERT INTO public.telegram_command_queue (
        update_id, chat_id, user_id, command_text, status, payload, created_at
    ) VALUES (
        p_update_id, p_chat_id, p_user_id, TRIM(p_command_text), 'PENDING', COALESCE(p_payload, '{}'::jsonb), NOW()
    ) RETURNING id INTO v_queue_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'queue_id', v_queue_id,
        'status', 'PENDING'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) TO authenticated, service_role;

-- 3C. claim_telegram_update_atomic and complete_telegram_update_atomic
REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. REVOKE ANONYMOUS EXECUTION FROM SENSITIVE INTERNAL RPCs & TRIGGERS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_is_admin_caller(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_system_health_diagnostics(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_fiscal_period(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_fiscal_period(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disburse_payroll_to_gl_atomic(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_payroll_accrual_to_gl_atomic(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_expense_voucher_number(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_next_po_number(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_referral_code(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_referral_settlement_number(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pg_cron_monitoring_telemetry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_grn_to_inventory_and_gl_atomic(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_asset_depreciation_to_gl_atomic(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_asset_maintenance_to_gl_atomic(UUID, UUID, BOOLEAN, CHARACTER VARYING) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_pharmacy_sale_erp_atomic(UUID, UUID, JSONB, CHARACTER VARYING, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_supplier_payment_to_gl_atomic(UUID, UUID, NUMERIC, CHARACTER VARYING, CHARACTER VARYING, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_and_issue_blood_bag_atomic(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_journal_entry_atomic(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_hospital_service_tariff_atomic(UUID, UUID, CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING, NUMERIC, CHARACTER VARYING, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_default_chart_of_accounts(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_and_resolve_system_issue_atomic(UUID, UUID, JSONB) FROM PUBLIC, anon;

-- Revoke execute on trigger functions from PUBLIC, anon, and authenticated (triggers execute internally via PostgreSQL engine)
REVOKE ALL ON FUNCTION public.fn_audit_detector_registry_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintain_invoice_arithmetic_invariants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_doctors_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_doctor_fees() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_patient_nid_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fn_enforce_journal_entry_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fn_enforce_journal_line_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fn_sync_bed_occupancy_on_assignment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fn_sync_bed_occupancy_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_patient_episodes_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_patient_episodes_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sync_episode_service_charges() FROM PUBLIC, anon, authenticated;

-- Ensure authenticated still has execute on internal ERP functions:
GRANT EXECUTE ON FUNCTION public.check_is_admin_caller(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_period(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disburse_payroll_to_gl_atomic(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_payroll_accrual_to_gl_atomic(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_expense_voucher_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_po_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_referral_settlement_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_grn_to_inventory_and_gl_atomic(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_asset_depreciation_to_gl_atomic(UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_asset_maintenance_to_gl_atomic(UUID, UUID, BOOLEAN, CHARACTER VARYING) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_pharmacy_sale_erp_atomic(UUID, UUID, JSONB, CHARACTER VARYING, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_to_gl_atomic(UUID, UUID, NUMERIC, CHARACTER VARYING, CHARACTER VARYING, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_and_issue_blood_bag_atomic(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_atomic(UUID, UUID, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_hospital_service_tariff_atomic(UUID, UUID, CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING, NUMERIC, CHARACTER VARYING, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_chart_of_accounts(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_and_resolve_system_issue_atomic(UUID, UUID, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. SECURE 26 TABLES WITH RLS POLICIES & REVOKE UNNECESSARY TABLE PRIVILEGES
-- ------------------------------------------------------------------------------

-- Revoke broad anonymous grants from all 26 tables
REVOKE ALL ON TABLE public.cash_transactions FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.department_services FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.diagnostic_report_verification_logs FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.diagnostic_report_verifications FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.diagnostic_result_values FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.diagnostic_results FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.inventory_items FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.medicine_batches FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.medicines FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.organization_branches FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_addresses FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_contacts FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_documents FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_history FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_identifications FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.patient_notes FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.payroll_runs FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.prescriptions FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.purchase_orders FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.referral_commission_settlement_items FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.refunds FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sample_collections FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sms_logs FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.token_counters FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vital_signs FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.waiting_queue FROM anon, PUBLIC;

-- Grant required permissions to authenticated and service_role
GRANT ALL ON TABLE public.cash_transactions TO service_role;
GRANT ALL ON TABLE public.department_services TO service_role;
GRANT ALL ON TABLE public.diagnostic_report_verification_logs TO service_role;
GRANT ALL ON TABLE public.diagnostic_report_verifications TO service_role;
GRANT ALL ON TABLE public.diagnostic_result_values TO service_role;
GRANT ALL ON TABLE public.diagnostic_results TO service_role;
GRANT ALL ON TABLE public.inventory_items TO service_role;
GRANT ALL ON TABLE public.medicine_batches TO service_role;
GRANT ALL ON TABLE public.medicines TO service_role;
GRANT ALL ON TABLE public.organization_branches TO service_role;
GRANT ALL ON TABLE public.patient_addresses TO service_role;
GRANT ALL ON TABLE public.patient_contacts TO service_role;
GRANT ALL ON TABLE public.patient_documents TO service_role;
GRANT ALL ON TABLE public.patient_history TO service_role;
GRANT ALL ON TABLE public.patient_identifications TO service_role;
GRANT ALL ON TABLE public.patient_notes TO service_role;
GRANT ALL ON TABLE public.payroll_runs TO service_role;
GRANT ALL ON TABLE public.prescriptions TO service_role;
GRANT ALL ON TABLE public.purchase_orders TO service_role;
GRANT ALL ON TABLE public.referral_commission_settlement_items TO service_role;
GRANT ALL ON TABLE public.refunds TO service_role;
GRANT ALL ON TABLE public.sample_collections TO service_role;
GRANT ALL ON TABLE public.sms_logs TO service_role;
GRANT ALL ON TABLE public.token_counters TO service_role;
GRANT ALL ON TABLE public.vital_signs TO service_role;
GRANT ALL ON TABLE public.waiting_queue TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.department_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diagnostic_report_verification_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diagnostic_report_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diagnostic_result_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diagnostic_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.medicine_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.medicines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_identifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prescriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referral_commission_settlement_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.refunds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sample_collections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sms_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.token_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vital_signs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waiting_queue TO authenticated;

-- Add tenant-isolation RLS policies on tables with organization_id:
DO $$
DECLARE
  t TEXT;
  tables_with_org TEXT[] := ARRAY[
    'cash_transactions', 'department_services', 'diagnostic_result_values',
    'diagnostic_results', 'inventory_items', 'medicine_batches', 'medicines',
    'organization_branches', 'payroll_runs', 'prescriptions', 'purchase_orders',
    'referral_commission_settlement_items', 'refunds', 'sms_logs', 'token_counters', 'waiting_queue'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_org
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY rls_tenant_%I ON public.%I FOR ALL TO authenticated ' ||
      'USING (organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))) ' ||
      'WITH CHECK (organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));',
      t, t
    );
  END LOOP;
END;
$$;

-- Add tenant-isolation RLS policies on patient-linked child tables (via patient_id -> patients.organization_id):
DO $$
DECLARE
  t TEXT;
  tables_with_patient TEXT[] := ARRAY[
    'patient_addresses', 'patient_contacts', 'patient_documents',
    'patient_history', 'patient_identifications', 'patient_notes'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_patient
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY rls_tenant_%I ON public.%I FOR ALL TO authenticated ' ||
      'USING (EXISTS (SELECT 1 FROM public.patients p WHERE p.id = %I.patient_id AND p.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid())))) ' ||
      'WITH CHECK (EXISTS (SELECT 1 FROM public.patients p WHERE p.id = %I.patient_id AND p.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))));',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- Diagnostic verifications and sample collections
DROP POLICY IF EXISTS rls_tenant_diagnostic_report_verification_logs ON public.diagnostic_report_verification_logs;
CREATE POLICY rls_tenant_diagnostic_report_verification_logs ON public.diagnostic_report_verification_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.diagnostic_orders dord WHERE dord.id = diagnostic_report_verification_logs.order_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.diagnostic_orders dord WHERE dord.id = diagnostic_report_verification_logs.order_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))));

DROP POLICY IF EXISTS rls_tenant_diagnostic_report_verifications ON public.diagnostic_report_verifications;
CREATE POLICY rls_tenant_diagnostic_report_verifications ON public.diagnostic_report_verifications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.diagnostic_order_items doi JOIN public.diagnostic_orders dord ON dord.id = doi.order_id WHERE doi.id = diagnostic_report_verifications.order_item_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.diagnostic_order_items doi JOIN public.diagnostic_orders dord ON dord.id = doi.order_id WHERE doi.id = diagnostic_report_verifications.order_item_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))));

DROP POLICY IF EXISTS rls_tenant_sample_collections ON public.sample_collections;
CREATE POLICY rls_tenant_sample_collections ON public.sample_collections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.diagnostic_order_items doi JOIN public.diagnostic_orders dord ON dord.id = doi.order_id WHERE doi.id = sample_collections.order_item_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.diagnostic_order_items doi JOIN public.diagnostic_orders dord ON dord.id = doi.order_id WHERE doi.id = sample_collections.order_item_id AND dord.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))));

DROP POLICY IF EXISTS rls_tenant_vital_signs ON public.vital_signs;
CREATE POLICY rls_tenant_vital_signs ON public.vital_signs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.patient_visits pv WHERE pv.id = vital_signs.visit_id AND pv.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.patient_visits pv WHERE pv.id = vital_signs.visit_id AND pv.organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))));
