-- =====================================================================================
-- 20260920060000_harden_webhook_and_org_resolver.sql
-- Onnesha Hospital Management System (OHMS) - Webhook Atomicity & Org Resolver Hardening
--
-- Migration 43:
-- 1. Hardens get_current_org_id() to strictly block anonymous callers from injecting
--    app.current_organization_id session GUC (only service_role can supply org when auth.uid() IS NULL).
-- 2. Integrates webhook_events processing status atomically into verify_and_record_online_payment RPC,
--    guaranteeing that financial settlement, invoice updates, audit logging, and webhook event status
--    are committed or rolled back together in a single database transaction.
-- =====================================================================================

-- 1. Harden get_current_org_id()
CREATE OR REPLACE FUNCTION public.get_current_org_id() 
RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
    v_role_org_count INTEGER;
    v_role_org_id UUID;
BEGIN
    -- 1. Explicit transaction or session setting
    BEGIN
        v_org_id := NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_org_id := NULL;
    END;

    -- If caller supplied an organization ID in session context:
    IF v_org_id IS NOT NULL THEN
        -- If invoked by an authenticated user (JWT caller), strictly verify their active membership
        IF auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() 
                  AND is_active = TRUE 
                  AND (organization_id = v_org_id OR active_organization_id = v_org_id)
                UNION
                SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid() 
                  AND organization_id = v_org_id
            ) THEN
                -- Caller does not belong to the requested organization: fail closed!
                v_org_id := NULL;
            END IF;
        -- If invoked without authenticated session (anonymous / unprivileged), FAIL CLOSED
        -- Only trusted service_role backend processes are permitted to supply org without auth.uid()
        ELSIF current_user != 'service_role' AND (auth.role() IS NULL OR auth.role() != 'service_role') THEN
            v_org_id := NULL;
        END IF;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;
    END IF;

    -- 2. Authenticated user session fallback (Supabase PostgREST JWT caller)
    IF auth.uid() IS NOT NULL THEN
        -- Check active profile active_organization_id or organization_id
        SELECT COALESCE(active_organization_id, organization_id) INTO v_org_id
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;

        -- Fallback to distinct organization mapping in user_roles
        -- Deterministic: if and only if the user belongs to exactly one distinct organization
        SELECT COUNT(DISTINCT organization_id), MIN(organization_id)
        INTO v_role_org_count, v_role_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid();

        IF v_role_org_count = 1 THEN
            RETURN v_role_org_id;
        END IF;

        -- Multiple distinct organizations without an active profile selection: fail closed
        RETURN NULL;
    END IF;

    -- Anonymous caller with no valid service_role session: unconditionally return NULL
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO anon, authenticated, service_role;


-- 2. Drop obsolete 6-argument verify_and_record_online_payment overload
DROP FUNCTION IF EXISTS public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID);

-- 3. Create hardened 7-argument verify_and_record_online_payment RPC with atomic webhook_events ledger update
CREATE OR REPLACE FUNCTION public.verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL,
    p_webhook_event_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_intent RECORD;
    v_invoice RECORD;
    v_webhook_event RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
    v_normalized_method VARCHAR;
    v_normalized_provider VARCHAR;
    v_trimmed_trx_id VARCHAR;
BEGIN
    v_calling_user_id := auth.uid();

    -- Gate 1: Execution is restricted strictly to server-side service_role
    IF auth.role() IS NOT NULL AND auth.role() != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', '403 Forbidden: Direct client payment settlement is prohibited. Settlement must be processed via verified provider webhook.');
    END IF;

    -- Gate 2: If invoked from client environment without service_role credentials, deny access
    IF current_user != 'service_role' AND (auth.role() IS NULL OR auth.role() != 'service_role') THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'error', '401 Unauthorized: Only trusted webhook settlement service can invoke payment settlement.');
    END IF;

    -- Gate 3: Validate transaction ID format (non-null and non-empty after trim)
    v_trimmed_trx_id := TRIM(COALESCE(p_provider_trx_id, ''));
    IF v_trimmed_trx_id = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSACTION_ID', 'error', 'Provider transaction ID is required and cannot be empty or whitespace.');
    END IF;

    -- Gate 4: Concurrency lock on Webhook Event (if provided)
    IF p_webhook_event_id IS NOT NULL THEN
        SELECT * INTO v_webhook_event FROM public.webhook_events
        WHERE id = p_webhook_event_id AND organization_id = p_org_id FOR UPDATE;

        IF FOUND AND v_webhook_event.processing_status = 'PROCESSED' THEN
            RETURN jsonb_build_object('success', true, 'already_processed', true, 'message', 'Webhook event already processed');
        END IF;
    END IF;

    -- Gate 5: Lock payment intent within the specified organization
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INTENT_NOT_FOUND', 'error', 'Payment intent not found in organization.');
    END IF;

    -- Gate 6: Validate Gateway Method matches stored intent provider (Prevent method mismatch / CASH injection)
    v_normalized_method := UPPER(TRIM(COALESCE(p_gateway_method, '')));
    v_normalized_provider := UPPER(TRIM(COALESCE(v_intent.provider, '')));

    IF v_normalized_method = 'CASH' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_METHOD', 'error', 'Invalid gateway method: CASH cannot be settled via online gateway settlement.');
    END IF;

    IF v_normalized_method != v_normalized_provider THEN
        RETURN jsonb_build_object('success', false, 'code', 'PROVIDER_MISMATCH', 'error', 'Gateway method mismatch: method (' || v_normalized_method || ') does not match payment intent provider (' || v_normalized_provider || ').');
    END IF;

    -- Gate 7: Idempotent return if already settled
    IF v_intent.status = 'PAID' THEN
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE public.webhook_events
            SET processing_status = 'PROCESSED', processed_at = NOW()
            WHERE id = p_webhook_event_id AND organization_id = p_org_id;
        END IF;
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    -- Gate 8: Lock invoice within the same organization
    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVOICE_NOT_FOUND', 'error', 'Associated invoice not found.');
    END IF;

    -- Gate 9: Duplicate provider transaction check across all payments within organization
    IF EXISTS (
        SELECT 1 FROM public.payments 
        WHERE gateway_transaction_id = v_trimmed_trx_id 
          AND organization_id = p_org_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_TRANSACTION', 'error', 'Duplicate transaction ID: Provider transaction has already been recorded.');
    END IF;

    -- Gate 10: Strict positive amount and exact matching against intent
    IF p_paid_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_AMOUNT', 'error', 'Paid amount must be positive.');
    END IF;

    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO public.payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, v_trimmed_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'code', 'AMOUNT_MISMATCH', 'error', 'Paid amount does not match expected payable amount.');
    END IF;

    -- Gate 11: Cashier Semantics (Zero Arbitrary Fallback)
    IF p_cashier_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cashier_id AND organization_id = p_org_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_CASHIER', 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or is inactive.');
        END IF;
        v_cashier_uuid := p_cashier_id;
    ELSE
        v_cashier_uuid := NULL;
    END IF;

    -- Compute new invoice financial state
    v_new_paid := v_invoice.paid_amount + p_paid_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;
    v_receipt_no := public.generate_receipt_number(p_org_id);

    -- Insert payment ledger record
    INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no, v_normalized_method,
        p_paid_amount, v_trimmed_trx_id,
        v_cashier_uuid,
        'Online Gateway Settlement: ' || v_normalized_method || ' (Trx: ' || v_trimmed_trx_id || ')'
    ) RETURNING id INTO v_payment_id;

    -- Update invoice master
    UPDATE public.invoices 
    SET paid_amount = v_new_paid, 
        due_amount = v_new_due,
        status = v_new_status, 
        updated_at = NOW() 
    WHERE id = v_invoice.id;

    -- Mark payment intent settled
    UPDATE public.payment_intents 
    SET status = 'PAID', 
        provider_transaction_id = v_trimmed_trx_id,
        verified_at = NOW(), 
        updated_at = NOW() 
    WHERE id = v_intent.id;

    -- Atomic Audit Log for Online Settlement
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'ONLINE_SETTLEMENT', 'BILLING', 'payment', v_payment_id::text,
        jsonb_build_object(
            'invoice_id', v_invoice.id,
            'invoice_number', v_invoice.invoice_number,
            'previous_paid', v_invoice.paid_amount,
            'previous_due', v_invoice.due_amount,
            'previous_status', v_invoice.status,
            'intent_status', v_intent.status
        ),
        jsonb_build_object(
            'payment_id', v_payment_id,
            'receipt_number', v_receipt_no,
            'amount', p_paid_amount,
            'payment_method', v_normalized_method,
            'gateway_transaction_id', v_trimmed_trx_id,
            'cashier_id', v_cashier_uuid,
            'new_paid', v_new_paid,
            'new_due', v_new_due,
            'new_status', v_new_status,
            'intent_id', v_intent.id
        )
    );

    -- Atomic Webhook Ledger update (guarantees webhook_events status is committed with financial record)
    IF p_webhook_event_id IS NOT NULL THEN
        UPDATE public.webhook_events
        SET processing_status = 'PROCESSED',
            processed_at = NOW(),
            failure_reason = NULL
        WHERE id = p_webhook_event_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_no,
        'new_due', v_new_due,
        'new_status', v_new_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'EXECUTION_ERROR', 'error', 'Payment settlement could not be processed: ' || SQLERRM);
END;
$$;

-- Revoke execute from public, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID, UUID) TO service_role;
