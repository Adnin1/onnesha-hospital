-- ==============================================================================
-- Migration 206: Durable Telegram Update Idempotency & Operational Replay Protection
-- File: supabase/migrations/20261015110000_durable_telegram_update_idempotency.sql
-- Description:
--   1. Creates public.telegram_update_receipts to store operational telemetry for update_id deduplication.
--   2. Absolutely zero PHI or sensitive message content is stored (only update_id, operational command_name, and timestamps).
--   3. Implements claim_telegram_update_atomic with automatic 7-day retention cleanup.
--   4. Implements complete_telegram_update_atomic to mark completed processing.
--   5. Restricts direct table access via RLS; grants atomic RPC execution to anon, authenticated, service_role.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_update_receipts (
    update_id BIGINT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    command_name TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Enable Row Level Security
ALTER TABLE public.telegram_update_receipts ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access by default; access strictly through RPC or service_role
DROP POLICY IF EXISTS telegram_receipts_service_role_all ON public.telegram_update_receipts;
CREATE POLICY telegram_receipts_service_role_all
    ON public.telegram_update_receipts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Atomic update_id claim RPC
CREATE OR REPLACE FUNCTION public.claim_telegram_update_atomic(
    p_update_id BIGINT,
    p_command TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing RECORD;
BEGIN
    IF p_update_id IS NULL OR p_update_id <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_duplicate', false,
            'error', 'INVALID_UPDATE_ID'
        );
    END IF;

    -- Clean up expired receipts older than 7 days (operational retention without touching business data)
    DELETE FROM public.telegram_update_receipts
    WHERE expires_at < NOW();

    -- Attempt atomic insertion
    INSERT INTO public.telegram_update_receipts (update_id, command_name, status, received_at, expires_at)
    VALUES (p_update_id, p_command, 'processing', NOW(), NOW() + INTERVAL '7 days')
    ON CONFLICT (update_id) DO NOTHING;

    -- If a row was inserted, FOUND is true
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

-- Mark completed function
CREATE OR REPLACE FUNCTION public.complete_telegram_update_atomic(
    p_update_id BIGINT,
    p_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

REVOKE ALL ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update_atomic(BIGINT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_telegram_update_atomic(BIGINT, TEXT) TO anon, authenticated, service_role;

COMMIT;
