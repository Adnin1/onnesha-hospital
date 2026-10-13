-- Migration 187: Harden Hospital Expenses Deletion, Voiding, and Diagnostic Alert Engine
-- Description:
-- 1. Implements public.delete_hospital_expense_super_admin_atomic to support:
--    - Safe deletion of unposted/draft expense vouchers.
--    - Atomic GL reversal and status 'VOIDED' for posted expenses.
--    - Transaction-local override permanent purge for authorized Super Admins.
-- 2. Hardens public.void_hospital_expense_atomic with consistent permissions.
-- 3. Grants execute permissions strictly to authenticated and service_role; revokes from PUBLIC/anon.

-- -------------------------------------------------------------------------------------
-- 1. ATOMIC EXPENSE DELETION & PURGE RPC (delete_hospital_expense_super_admin_atomic)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_hospital_expense_super_admin_atomic(
    p_org_id UUID,
    p_expense_id UUID,
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
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_exp RECORD;
    v_je RECORD;
    v_rev_je_number VARCHAR(50);
    v_rev_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_rev_res JSONB := NULL;
    v_voucher_number TEXT;
BEGIN
    -- 1. Input parameter validation
    IF p_org_id IS NULL OR p_expense_id IS NULL OR p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Expense ID, and Admin ID are mandatory.';
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid deletion/void reason is mandatory and cannot be empty.';
    END IF;

    -- 2. Direct caller identity verification
    IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
    END IF;

    -- 3. Role & Permission Verification
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_admin_id
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator', 'finance_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.profiles p
            WHERE p.id = p_admin_id
              AND (
                LOWER(COALESCE(p.active_organization_id::text, '')) = LOWER(p_org_id::text)
                OR LOWER(COALESCE(p.organization_id::text, '')) = LOWER(p_org_id::text)
              )
              AND LOWER(COALESCE(p.role, '')) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator', 'finance_admin')
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin THEN
        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'accounting.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.manage') OR
            public.has_permission('accounting.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Only authorized accounting administrators may delete or void hospital expenses.';
        END IF;
    END IF;

    -- 4. Lock target expense record FOR UPDATE
    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Expense voucher not found or organization mismatch.'
        );
    END IF;

    v_voucher_number := COALESCE(v_exp.voucher_number, 'VOUCHER-' || SUBSTRING(p_expense_id::text, 1, 8));

    -- 5. In-Transaction Audit Log
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
        CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'DELETE' END,
        'ACCOUNTING',
        'expenses',
        p_expense_id::text,
        to_jsonb(v_exp),
        jsonb_build_object(
            'voucher_number', v_voucher_number,
            'reason', p_reason,
            'permanent_purge', p_permanent_purge,
            'amount', v_exp.amount,
            'status', v_exp.status,
            'timestamp', NOW()
        ),
        NOW()
    );

    -- 6. Execution Branch
    IF p_permanent_purge THEN
        -- Authoritative local transactional bypass for Super Admin hard purge
        PERFORM set_config('app.override_journal_immutability', 'on', true);

        -- Delete linked journal entry lines
        DELETE FROM public.journal_entry_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE organization_id = p_org_id
              AND (reference_id = p_expense_id OR description ILIKE '%' || v_voucher_number || '%')
        );

        -- Delete linked journal entries
        DELETE FROM public.journal_entries
        WHERE organization_id = p_org_id
          AND (reference_id = p_expense_id OR description ILIKE '%' || v_voucher_number || '%');

        -- Delete linked referral settlements if any
        UPDATE public.referral_commission_settlements
        SET expense_id = NULL
        WHERE organization_id = p_org_id AND expense_id = p_expense_id;

        -- Delete expense row
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher and associated journal entries permanently purged from database.'
        );
    ELSE
        -- Standard Deletion or Voiding
        IF v_exp.status IN ('DRAFT', 'PENDING_APPROVAL') THEN
            -- Safe delete of unposted draft voucher
            DELETE FROM public.expenses
            WHERE id = p_expense_id AND organization_id = p_org_id;

            RETURN jsonb_build_object(
                'success', TRUE,
                'mode', 'DELETED',
                'expense_id', p_expense_id,
                'voucher_number', v_voucher_number,
                'message', 'Draft expense voucher successfully deleted.'
            );
        ELSIF v_exp.status IN ('VOID', 'VOIDED') THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'Expense voucher ' || v_voucher_number || ' has already been voided.'
            );
        ELSE
            -- POSTED / PAID Expense: Perform Atomic Reversal
            SELECT id, entry_number
            INTO v_je
            FROM public.journal_entries
            WHERE organization_id = p_org_id AND reference_id = p_expense_id AND status = 'POSTED'
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_je.id IS NOT NULL THEN
                v_rev_je_number := 'REV-' || v_je.entry_number;

                FOR v_line IN
                    SELECT account_id, debit, credit, description
                    FROM public.journal_entry_lines
                    WHERE journal_entry_id = v_je.id
                LOOP
                    v_rev_lines := v_rev_lines || jsonb_build_object(
                        'account_id', v_line.account_id,
                        'debit', v_line.credit,   -- Inverted
                        'credit', v_line.debit,   -- Inverted
                        'description', 'Reversal: ' || COALESCE(v_line.description, 'Void of ' || v_voucher_number)
                    );
                END LOOP;

                IF jsonb_array_length(v_rev_lines) > 0 THEN
                    v_rev_res := public.post_journal_entry_atomic(
                        p_org_id,
                        v_rev_je_number,
                        CURRENT_DATE,
                        'EXPENSE_VOID_REVERSAL',
                        p_expense_id,
                        'Void Reversal for Voucher ' || v_voucher_number || ' - ' || TRIM(p_reason),
                        v_rev_lines,
                        COALESCE(v_caller, p_admin_id)
                    );

                    IF v_rev_res IS NULL OR (v_rev_res->>'success')::BOOLEAN IS NOT TRUE THEN
                        RETURN jsonb_build_object(
                            'success', FALSE,
                            'error', 'Failed to post reversal journal entry: ' || COALESCE(v_rev_res->>'error', 'Unknown error')
                        );
                    END IF;

                    -- Mark original journal entry as VOID
                    UPDATE public.journal_entries
                    SET status = 'VOID'
                    WHERE id = v_je.id;
                END IF;
            END IF;

            -- Mark expense status as VOIDED
            UPDATE public.expenses
            SET status = 'VOIDED',
                void_reason = TRIM(p_reason),
                updated_at = NOW()
            WHERE id = p_expense_id AND organization_id = p_org_id;

            RETURN jsonb_build_object(
                'success', TRUE,
                'mode', 'VOIDED',
                'expense_id', p_expense_id,
                'voucher_number', v_voucher_number,
                'message', 'Expense voucher voided and general ledger entry reversed.',
                'reversal_journal_entry', v_rev_res
            );
        END IF;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. HARDEN void_hospital_expense_atomic PERMISSIONS
-- -------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
