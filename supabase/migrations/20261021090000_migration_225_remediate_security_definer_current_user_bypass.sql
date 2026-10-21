-- ==============================================================================
-- MIGRATION 225: REMEDIATE SECURITY DEFINER CURRENT_USER BYPASS & HARDEN TELEGRAM RPCs
-- 1. Eliminate current_user IN ('postgres', 'service_role') caller-trust check from all SECURITY DEFINER RPCs.
--    In PostgreSQL, SECURITY DEFINER functions run as the owner (postgres), so current_user is ALWAYS 'postgres',
--    causing false-positive authorization for untrusted authenticated callers.
-- 2. Strictly check auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin')).
-- 3. For save_role_permissions_atomic:
--    - Service-role callers allowed via verified JWT claims or superuser session.
--    - Authenticated callers require auth.uid() IS NOT NULL.
--    - Verify caller has admin/hospital_administrator in target p_org_id (or global super_admin).
--    - Deny non-admin users and cross-organization tampering.
-- 4. For get_organization_role_permissions_matrix:
--    - Verify caller is service_role, global super_admin, or admin/hospital_administrator/hr_manager in p_org_id.
-- 5. For Telegram queue & receipt RPCs:
--    - Restrict claim_next_telegram_command_atomic, claim_telegram_update_atomic, complete_telegram_update_atomic
--      strictly to service_role (revoking authenticated, anon, PUBLIC).
--    - Restrict enqueue_telegram_command_atomic to service_role or authenticated super_admin.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. P0 FIX: save_role_permissions_atomic (Strict Tenant Isolation & No current_user)
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
  v_is_super_admin BOOLEAN := false;
BEGIN
  -- Strict parameter validation
  IF p_org_id IS NULL OR p_role_name IS NULL OR TRIM(p_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID and role name required.');
  END IF;

  -- 1. Trusted service_role or direct database superuser session
  -- NOTE: Do NOT use current_user here, because in SECURITY DEFINER current_user is always the function owner ('postgres')
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) THEN
    v_is_authorized := true;
  -- 2. Authenticated user: Must be admin in target organization or global super_admin
  ELSIF v_caller_id IS NOT NULL THEN
    -- Check if global super_admin
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND r.name = 'super_admin'
    ) INTO v_is_super_admin;

    IF v_is_super_admin THEN
      v_is_authorized := true;
    ELSE
      -- Must have admin or hospital_administrator role specifically in p_org_id
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller_id
          AND ur.organization_id = p_org_id
          AND r.name IN ('admin', 'hospital_administrator')
      ) INTO v_is_authorized;
    END IF;
  ELSE
    -- Anonymous / unauthenticated callers are strictly denied
    v_is_authorized := false;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only authorized administrator can modify RBAC permissions.');
  END IF;

  -- Find or create role for target organization
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

  -- Atomically sync role_permissions for this role
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
-- 2. SECURE: get_organization_role_permissions_matrix (Strict Tenant Isolation)
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
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
  v_is_super_admin BOOLEAN := false;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID required');
  END IF;

  -- 1. Trusted service_role or direct DB admin session
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) THEN
    v_is_authorized := true;
  -- 2. Authenticated user: Must be admin or hr in target organization (or global super_admin)
  ELSIF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND r.name = 'super_admin'
    ) INTO v_is_super_admin;

    IF v_is_super_admin THEN
      v_is_authorized := true;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller_id
          AND ur.organization_id = p_org_id
          AND r.name IN ('admin', 'hospital_administrator', 'hr_manager')
      ) INTO v_is_authorized;
    END IF;
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
    ORDER BY r.name ASC
  LOOP
    SELECT COALESCE(jsonb_agg(rp.permission_key ORDER BY rp.permission_key), '[]'::jsonb)
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id = v_role.id;

    v_result := jsonb_set(v_result, ARRAY[v_role.name], v_perms, true);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'matrix', v_result, 'organization_id', p_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_role_permissions_matrix(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. SECURE TELEGRAM RPCs (Least-Privilege Role Grants & Body Hardening)
-- ------------------------------------------------------------------------------

-- 3A. claim_next_telegram_command_atomic: STRICTLY service_role only
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
BEGIN
    -- Only service_role or direct DB admin session
    IF (auth.role() != 'service_role' AND (auth.role() IS NOT NULL OR session_user NOT IN ('postgres', 'supabase_admin'))) THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only authorized background worker (service_role) can claim queue commands');
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
REVOKE ALL ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) TO service_role;

-- 3B. enqueue_telegram_command_atomic: service_role or authenticated super_admin
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
    -- 1. service_role or direct DB admin session
    IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) THEN
      v_is_authorized := true;
    -- 2. Authenticated caller: Must be super_admin
    ELSIF auth.uid() IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND r.name = 'super_admin'
      ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Direct queue enqueue requires service_role or super_admin authentication');
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
        'queue_id', v_queue_id,
        'status', 'PENDING'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) TO authenticated, service_role;

-- 3C. claim_telegram_update_atomic: STRICTLY service_role only
CREATE OR REPLACE FUNCTION public.claim_telegram_update_atomic(
    p_update_id BIGINT,
    p_command TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing RECORD;
BEGIN
    -- Only trusted service_role or direct DB admin session
    IF (auth.role() != 'service_role' AND (auth.role() IS NOT NULL OR session_user NOT IN ('postgres', 'supabase_admin'))) THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only trusted service_role can claim Telegram update receipts');
    END IF;

    IF p_update_id IS NULL OR p_update_id <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_duplicate', false,
            'error', 'INVALID_UPDATE_ID'
        );
    END IF;

    -- Clean up expired receipts older than 7 days
    DELETE FROM public.telegram_update_receipts
    WHERE expires_at < NOW();

    -- Attempt atomic insertion
    INSERT INTO public.telegram_update_receipts (update_id, command_name, status, received_at, expires_at)
    VALUES (p_update_id, p_command, 'processing', NOW(), NOW() + INTERVAL '7 days')
    ON CONFLICT (update_id) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', false,
            'update_id', p_update_id,
            'status', 'claimed'
        );
    ELSE
        SELECT update_id, status, received_at, completed_at
        INTO v_existing
        FROM public.telegram_update_receipts
        WHERE update_id = p_update_id;

        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'update_id', p_update_id,
            'status', COALESCE(v_existing.status, 'duplicate')
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) TO service_role;

-- 3D. complete_telegram_update_atomic: STRICTLY service_role only
CREATE OR REPLACE FUNCTION public.complete_telegram_update_atomic(
    p_update_id BIGINT,
    p_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Only trusted service_role or direct DB admin session
    IF (auth.role() != 'service_role' AND (auth.role() IS NOT NULL OR session_user NOT IN ('postgres', 'supabase_admin'))) THEN
      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only trusted service_role can complete Telegram update receipts');
    END IF;

    UPDATE public.telegram_update_receipts
    SET status = CASE WHEN p_status IN ('completed', 'failed') THEN p_status ELSE 'completed' END,
        completed_at = NOW()
    WHERE update_id = p_update_id;

    RETURN jsonb_build_object(
        'success', true,
        'update_id', p_update_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) TO service_role;
