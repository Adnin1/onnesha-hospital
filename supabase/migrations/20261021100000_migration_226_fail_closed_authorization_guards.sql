-- ==============================================================================
-- MIGRATION 226: FAIL-CLOSED AUTHORIZATION GUARDS & LEAST-PRIVILEGE AUDIT
-- 1. Replace all nullable / negated role conditions with IS DISTINCT FROM fail-closed guards.
--    In PL/pgSQL, IF (cond) THEN skips the branch if cond evaluates to SQL NULL.
--    Negated checks like `auth.role() != 'service_role'` evaluate to NULL when auth.role() is NULL,
--    failing to enter the deny block.
-- 2. Enforce:
--    IF auth.role() IS DISTINCT FROM 'service_role'
--       AND NOT (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
--      RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient privilege');
--    END IF;
-- 3. Re-verify least-privilege grants across all 6 sensitive RBAC and Telegram functions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. claim_next_telegram_command_atomic: STRICT FAIL-CLOSED GUARD
-- ------------------------------------------------------------------------------
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
    -- Explicit fail-closed authorization guard immune to SQL NULL ternary evaluation
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND NOT (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '403 Forbidden: Only authorized background worker (service_role) can claim queue commands'
      );
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

-- ------------------------------------------------------------------------------
-- 2. claim_telegram_update_atomic: STRICT FAIL-CLOSED GUARD
-- ------------------------------------------------------------------------------
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
    -- Explicit fail-closed authorization guard immune to SQL NULL ternary evaluation
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND NOT (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
      RETURN jsonb_build_object(
        'success', false,
        'is_duplicate', false,
        'error', '403 Forbidden: Only trusted service_role can claim Telegram update receipts'
      );
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

-- ------------------------------------------------------------------------------
-- 3. complete_telegram_update_atomic: STRICT FAIL-CLOSED GUARD
-- ------------------------------------------------------------------------------
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
    -- Explicit fail-closed authorization guard immune to SQL NULL ternary evaluation
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND NOT (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '403 Forbidden: Only trusted service_role can complete Telegram update receipts'
      );
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

-- ------------------------------------------------------------------------------
-- 4. enqueue_telegram_command_atomic: FAIL-CLOSED SUPER_ADMIN / SERVICE_ROLE GUARD
-- ------------------------------------------------------------------------------
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
    -- 1. Trusted service_role or direct DB admin session (Fail-closed evaluation)
    IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) IS TRUE THEN
      v_is_authorized := true;
    -- 2. Authenticated caller: Must be super_admin
    ELSIF auth.uid() IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND r.name = 'super_admin'
      ) INTO v_is_authorized;
    ELSE
      v_is_authorized := false;
    END IF;

    IF v_is_authorized IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '403 Forbidden: Direct queue enqueue requires service_role or super_admin authentication'
      );
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

-- ------------------------------------------------------------------------------
-- 5. save_role_permissions_atomic: FAIL-CLOSED RBAC MUTATION GUARD
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

  -- 1. Trusted service_role or direct superuser session
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) IS TRUE THEN
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
    v_is_authorized := false;
  END IF;

  IF v_is_authorized IS NOT TRUE THEN
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
-- 6. get_organization_role_permissions_matrix: FAIL-CLOSED QUERY GUARD
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
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) IS TRUE THEN
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

  IF v_is_authorized IS NOT TRUE THEN
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
