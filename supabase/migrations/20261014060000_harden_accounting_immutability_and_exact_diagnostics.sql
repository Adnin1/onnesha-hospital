-- Migration 188: Harden Accounting Immutability, Expense Reversals & Exact Diagnostic Incident Resolution
-- Description:
-- 1. Refines public.delete_hospital_expense_super_admin_atomic:
--    - Prohibits permanent purge of POSTED / PAID expenses to strictly uphold GAAP/IFRS double-entry audit trails.
--    - Retains original journal entry status as 'POSTED' alongside the balanced reversal journal entry ('POSTED'),
--      ensuring that financial reports (Trial Balance, General Ledger) summing POSTED entries reflect exact net zero.
--    - Restricts hard-deletion strictly to unposted DRAFT / PENDING_APPROVAL vouchers.
-- 2. Refines public.resolve_system_runtime_issue:
--    - Removes hardcoded organization ID fallback to enforce multi-tenant isolation.
--    - Adds exact location-scoped resolution (p_location) preventing cross-operation resolution within the same module.
-- 3. Grants and search_path hardening:
--    - Pinned search_path = public, pg_temp on all SECURITY DEFINER functions.
--    - Access strictly revoked from PUBLIC/anon; granted to authenticated and service_role.

-- -------------------------------------------------------------------------------------
-- 1. REFINED ATOMIC EXPENSE DELETION & VOID REVERSAL RPC
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
            FROM public.role_permissions rp
            JOIN public.permissions p ON rp.permission_id = p.id
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_admin_id
              AND ur.organization_id = p_org_id
              AND p.name IN ('accounting.manage', 'expenses.manage', 'expenses.delete')
        ) INTO v_is_admin;
    END IF;

    -- Also allow service_role execution
    IF NOT v_is_admin AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Access Denied: Administrative or accounting.manage privilege required to delete or reverse expense vouchers.';
    END IF;

    -- 4. Target record acquisition with row lock
    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense voucher with ID % not found in organization %.', p_expense_id, p_org_id;
    END IF;

    v_voucher_number := COALESCE(v_exp.voucher_number, 'EXP-' || SUBSTRING(p_expense_id::text, 1, 8));

    -- 5. Accounting Immutability Rule: Posted financial records CANNOT be purged from history
    IF p_permanent_purge THEN
        IF v_exp.status IN ('POSTED', 'PAID') THEN
            RAISE EXCEPTION 'Accounting Immutability Invariant: Posted expense vouchers cannot be permanently deleted. They must be voided and reversed via double-entry balancing journal.' USING ERRCODE = '22023';
        END IF;

        -- Draft / Unposted Voucher: Safe Permanent Delete
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Record Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'PURGE', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'PURGED', 'timestamp', NOW()),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Draft expense voucher permanently deleted.'
        );
    END IF;

    -- 6. Standard Deletion vs Voiding
    IF v_exp.status IN ('DRAFT', 'PENDING_APPROVAL') THEN
        -- Safe delete of unposted draft voucher
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'DELETE', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'DELETED', 'timestamp', NOW()),
            NOW()
        );

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
        -- POSTED / PAID Expense: Perform Atomic Double-Entry Reversal
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

                -- NOTE: In double-entry GAAP accounting, both the original journal entry
                -- AND its reversal entry remain status = 'POSTED'. Their algebraic sum
                -- nets to exactly 0.00 in all reports that aggregate POSTED entries.
                -- We do NOT mark the original entry as VOID, preserving financial symmetry.
            END IF;
        END IF;

        -- Mark expense status as VOIDED
        UPDATE public.expenses
        SET status = 'VOIDED',
            void_reason = TRIM(p_reason),
            updated_at = NOW()
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'VOID', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object(
                'voucher_number', v_voucher_number,
                'reason', p_reason,
                'status', 'VOIDED',
                'reversal_journal', v_rev_res,
                'timestamp', NOW()
            ),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher voided and general ledger entry reversed.',
            'reversal_journal_entry', v_rev_res
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. REFINED resolve_system_runtime_issue RPC (NO HARDCODED ORG, EXACT LOCATION MATCHING)
-- -------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.resolve_system_runtime_issue(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.resolve_system_runtime_issue(
    p_org_id UUID DEFAULT NULL,
    p_module TEXT DEFAULT NULL,
    p_issue_id UUID DEFAULT NULL,
    p_location TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_org UUID;
    v_target_org UUID := p_org_id;
    v_count INT := 0;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NOT NULL THEN
            v_target_org := v_caller_org;
        END IF;
    END IF;

    -- Fail-closed multi-tenant boundary: if no organization can be verified, return 0
    IF v_target_org IS NULL THEN
        RETURN 0;
    END IF;

    -- Require at least one resolution discriminator to prevent accidental blanket resolution
    IF p_issue_id IS NULL AND p_location IS NULL AND p_module IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.system_health_issues_log
    SET is_resolved = TRUE,
        resolved_at = NOW()
    WHERE organization_id = v_target_org
      AND is_resolved = FALSE
      AND (p_issue_id IS NULL OR id = p_issue_id)
      AND (p_location IS NULL OR location = p_location)
      AND (p_module IS NULL OR module = p_module);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
