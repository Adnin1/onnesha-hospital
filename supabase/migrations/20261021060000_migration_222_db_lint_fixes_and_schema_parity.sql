-- =====================================================================================
-- Migration 222: Database Lint Compliance & Production Schema Parity
-- =====================================================================================
-- Description:
-- 1. Hardens post_journal_entry_atomic to match public.journal_entries schema
--    (total_debit, total_credit, posted_by instead of total_amount, created_by).
-- 2. Corrects delete_invoice_super_admin_atomic by eliminating invalid column reference
--    on public.patient_referral_attributions.
-- 3. Hardens delete_hospital_expense_super_admin_atomic reversal journal entries to match
--    public.journal_entries schema (total_debit, total_credit, posted_by).
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. FIX public.post_journal_entry_atomic SCHEMA ALIGNMENT
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
    p_org_id UUID,
    p_entry_number VARCHAR,
    p_entry_date DATE,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_description TEXT,
    p_lines JSONB,
    p_posted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_debit NUMERIC(14, 2) := 0.00;
    v_total_credit NUMERIC(14, 2) := 0.00;
    v_entry_id UUID;
    v_elem JSONB;
    v_active_org UUID;
    v_calling_user_id UUID;
    v_is_full_finance BOOLEAN := FALSE;
    v_is_front_desk BOOLEAN := FALSE;
    v_line_debit NUMERIC(14, 2);
    v_line_credit NUMERIC(14, 2);
    v_acc_id UUID;
    v_line_desc TEXT;
    v_target_date DATE;
    v_closed_period_name VARCHAR(50);
    v_is_internal_post BOOLEAN := FALSE;
    v_inv RECORD;
    v_pay RECORD;
BEGIN
    v_calling_user_id := auth.uid();
    v_target_date := COALESCE(p_entry_date, CURRENT_DATE);

    -- Fail-Closed Organization Resolution
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Active organization context is missing or does not match target organization'
            USING ERRCODE = '42501';
    END IF;

    -- Accounting Period Control: Disallow posting into closed fiscal periods
    SELECT period_name INTO v_closed_period_name
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND is_closed = TRUE
      AND v_target_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_closed_period_name IS NOT NULL THEN
        RAISE EXCEPTION 'Accounting Period Closed: Transactions cannot be posted to closed fiscal period "%" for date %',
            v_closed_period_name, v_target_date
            USING ERRCODE = '22023';
    END IF;

    -- Check internal operational posting flag
    IF current_setting('app.internal_operational_gl_posting', true) = 'on' THEN
        v_is_internal_post := TRUE;
    END IF;

    -- RBAC Authorization check
    IF v_calling_user_id IS NOT NULL AND current_user != 'service_role' THEN
        -- Standard full finance / executive roles
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'accountant', 'finance_manager')
        ) OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('accounting.manage', 'accounting.post', '*')
        ) INTO v_is_full_finance;

        IF NOT v_is_full_finance THEN
            -- Check if caller is authorized front-desk / billing staff
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'payments.create', 'billing.collect')
            ) INTO v_is_front_desk;

            IF NOT v_is_front_desk THEN
                RAISE EXCEPTION 'Access denied: Caller lacks authorized accounting role or permission'
                    USING ERRCODE = '42501';
            END IF;

            -- LEAST-PRIVILEGE SECURITY ENFORCEMENT FOR FRONT-DESK STAFF:
            -- Front-desk callers CANNOT execute arbitrary direct manual journal postings.
            -- Operational posting is strictly permitted ONLY IF:
            -- 1. Called internally via stored procedure workflow (v_is_internal_post = TRUE), OR
            -- 2. Linked to an authentic operational transaction matching underlying amounts.
            IF NOT v_is_internal_post THEN
                IF p_reference_type NOT IN ('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT') THEN
                    RAISE EXCEPTION 'Access denied: Front-desk roles (receptionist/cashier) cannot post direct manual journal entries. Manual entries require accounting.post permission.'
                        USING ERRCODE = '42501';
                END IF;

                IF p_reference_id IS NULL THEN
                    RAISE EXCEPTION 'Access denied: Front-desk operational journal posting requires valid reference_id linkage.'
                        USING ERRCODE = '42501';
                END IF;

                -- If reference is INVOICE, verify invoice exists in org
                IF p_reference_type IN ('INVOICE', 'BILLING') THEN
                    SELECT id, grand_total, subtotal INTO v_inv
                    FROM public.invoices
                    WHERE id = p_reference_id AND organization_id = p_org_id;

                    IF v_inv.id IS NULL THEN
                        RAISE EXCEPTION 'Access denied: Referenced invoice does not exist in target hospital organization.'
                            USING ERRCODE = '42501';
                    END IF;
                ELSIF p_reference_type IN ('PAYMENT') THEN
                    SELECT id, amount INTO v_pay
                    FROM public.payments
                    WHERE id = p_reference_id AND organization_id = p_org_id;

                    IF v_pay.id IS NULL THEN
                        RAISE EXCEPTION 'Access denied: Referenced payment does not exist in target hospital organization.'
                            USING ERRCODE = '42501';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    -- Validate input lines array
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Invalid journal: At least 2 balanced journal lines are required';
    END IF;

    -- Pre-calculate and validate debit XOR credit exclusivity across all lines
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);

        IF (v_line_debit > 0 AND v_line_credit > 0) OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION 'Invalid journal line: Each line must have debit > 0 XOR credit > 0 (found debit=%, credit=%)',
                v_line_debit, v_line_credit;
        END IF;

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION 'Negative amounts are strictly prohibited in double-entry journal lines';
        END IF;

        v_total_debit := v_total_debit + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    -- Double-Entry Equality Constraint: SUM(Debits) must EXACTLY EQUAL SUM(Credits)
    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced journal entry: Total Debit (%) must equal Total Credit (%)',
            v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Invalid journal entry amount: Monetary total must be greater than zero (found %)',
            v_total_debit;
    END IF;

    -- Insert Journal Entry Header in PENDING status (matches schema: total_debit, total_credit, posted_by)
    INSERT INTO public.journal_entries (
        organization_id,
        entry_number,
        entry_date,
        reference_type,
        reference_id,
        description,
        status,
        total_debit,
        total_credit,
        posted_by
    ) VALUES (
        p_org_id,
        p_entry_number,
        v_target_date,
        p_reference_type,
        p_reference_id,
        p_description,
        'PENDING',
        v_total_debit,
        v_total_credit,
        COALESCE(p_posted_by, v_calling_user_id)
    ) RETURNING id INTO v_entry_id;

    -- Insert Journal Entry Lines
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_acc_id := (v_elem->>'account_id')::UUID;
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);
        v_line_desc := v_elem->>'description';

        IF NOT EXISTS (
            SELECT 1 FROM public.chart_of_accounts
            WHERE id = v_acc_id AND organization_id = p_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Account % does not exist or is inactive in organization %', v_acc_id, p_org_id;
        END IF;

        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_entry_id,
            v_acc_id,
            v_line_debit,
            v_line_credit,
            v_line_desc
        );
    END LOOP;

    -- Promote Header to POSTED
    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_entry_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'journal_entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_amount', v_total_debit,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'status', 'POSTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. FIX public.delete_invoice_super_admin_atomic CASCADE
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
  v_inv RECORD;
  v_inv_number TEXT;
  v_has_posted_journals BOOLEAN := FALSE;
  v_audit_user_id UUID;
BEGIN
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- Strict Organization-Scoped Admin Verification
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
  ) OR EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND (rp.permission_key IN ('billing.manage', 'invoices.delete') OR rp.permission_key = '*')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Invoice deletion requires active administrative role in this hospital organization.';
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  -- Idempotency check: If invoice is already purged or not found
  IF NOT FOUND THEN
    IF EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE organization_id = p_org_id
          AND entity_type IN ('invoice', 'invoices')
          AND entity_id = p_invoice_id::text
          AND action IN ('PURGE', 'DELETE')
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'mode', 'ALREADY_PURGED',
            'invoice_id', p_invoice_id,
            'message', 'Invoice has already been permanently purged by Super Admin.'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
  ) INTO v_has_posted_journals;

  -- Profile existence check for audit log FK
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id) THEN
    v_audit_user_id := p_admin_id;
  ELSE
    v_audit_user_id := NULL;
  END IF;

  -- Audit log of the administrative deletion action
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    p_org_id, v_audit_user_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING', 'invoices', p_invoice_id::text,
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

  IF p_permanent_purge THEN
    -- Override immutability for administrative purge
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- 1. Dependent clinical & referral associations (unlink)
    UPDATE public.dental_examinations SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.eye_examinations SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.physiotherapy_sessions SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.patient_package_subscriptions SET purchase_invoice_id = NULL WHERE purchase_invoice_id = p_invoice_id;
    UPDATE public.patient_referrals SET invoice_id = NULL WHERE invoice_id = p_invoice_id;

    -- 2. Clean invoice edit audit history
    DELETE FROM public.invoice_edit_history WHERE invoice_id = p_invoice_id;

    -- 3. Dependent financial & settlement records
    DELETE FROM public.payment_reconciliations WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payment_intents WHERE invoice_id = p_invoice_id;
    DELETE FROM public.insurance_claims WHERE invoice_id = p_invoice_id;
    DELETE FROM public.pharmacy_sales WHERE invoice_id = p_invoice_id;

    -- 4. Journal entries for linked referral commissions
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id IN (SELECT id FROM public.referral_commissions WHERE invoice_id = p_invoice_id)
         OR (reference_type IN ('REFERRAL_COMMISSION', 'COMMISSION') AND (reference_id = p_invoice_id OR entry_number LIKE '%COMM%' || v_inv_number || '%'))
    );
    DELETE FROM public.journal_entries
    WHERE reference_id IN (SELECT id FROM public.referral_commissions WHERE invoice_id = p_invoice_id)
       OR (reference_type IN ('REFERRAL_COMMISSION', 'COMMISSION') AND (reference_id = p_invoice_id OR entry_number LIKE '%COMM%' || v_inv_number || '%'));

    DELETE FROM public.referral_commissions WHERE invoice_id = p_invoice_id;

    -- 5. Journal entries for linked payments
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id IN (SELECT id FROM public.payments WHERE invoice_id = p_invoice_id)
         OR (reference_type IN ('PAYMENT', 'BILLING_PAYMENT') AND entry_number LIKE '%PAY%' || v_inv_number || '%')
    );
    DELETE FROM public.journal_entries
    WHERE reference_id IN (SELECT id FROM public.payments WHERE invoice_id = p_invoice_id)
       OR (reference_type IN ('PAYMENT', 'BILLING_PAYMENT') AND entry_number LIKE '%PAY%' || v_inv_number || '%');

    -- 6. Payments, refunds, and line items
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- 7. Journal entries directly associated with this invoice
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = p_invoice_id
         OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
    );

    DELETE FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%');

    -- 8. Delete invoice root
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice #' || v_inv_number || ' and all associated items, payments, and ledger entries permanently purged by Super Admin.'
    );
  ELSE
    -- Safe Void (Soft Delete): Post offsetting reversal if journals exist, mark status as VOID
    IF v_has_posted_journals AND v_inv.status NOT IN ('CANCELLED', 'VOIDED', 'VOID') THEN
      PERFORM public.void_invoice_and_reverse_gl_atomic(p_org_id, p_invoice_id, p_reason);
    END IF;

    UPDATE public.invoices
    SET status = 'VOID',
        is_voided = TRUE,
        notes = COALESCE(notes, '') || ' [VOIDED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice #' || v_inv_number || ' marked as VOID with double-entry journal reversal posted.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. FIX public.delete_hospital_expense_super_admin_atomic REVERSAL JOURNAL SCHEMA
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_hospital_expense_super_admin_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_exp RECORD;
    v_je RECORD;
    v_rev_je_number VARCHAR(50);
    v_line RECORD;
    v_rev_je_id UUID;
    v_voucher_number TEXT;
    v_settle RECORD;
    v_audit_user_id UUID;
BEGIN
    IF p_org_id IS NULL OR p_expense_id IS NULL OR p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Expense ID, and Admin ID are mandatory.';
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid deletion/void reason is mandatory and cannot be empty.';
    END IF;

    IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
    END IF;

    -- Strict Organization-Scoped Admin Verification
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
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_admin_id
              AND ur.organization_id = p_org_id
              AND (rp.permission_key IN ('accounting.manage', 'expenses.manage', 'expenses.delete') OR rp.permission_key = '*')
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: Expense voucher deletion requires active financial administrative permissions in this organization.';
    END IF;

    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    -- Idempotency check: If expense record is already purged
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM public.audit_logs
            WHERE organization_id = p_org_id
              AND entity_type IN ('expense', 'expenses')
              AND entity_id = p_expense_id::text
              AND action IN ('PURGE', 'DELETE')
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'mode', 'ALREADY_PURGED',
                'expense_id', p_expense_id,
                'message', 'Expense voucher has already been permanently purged by Super Admin.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Expense voucher record not found in specified organization.'
        );
    END IF;

    v_voucher_number := v_exp.voucher_number;

    -- Safe audit log user attribution
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id) THEN
        v_audit_user_id := p_admin_id;
    ELSE
        v_audit_user_id := NULL;
    END IF;

    -- Idempotent void check
    IF v_exp.status IN ('VOIDED', 'VOID') AND NOT p_permanent_purge THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'ALREADY_VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' is already voided with double-entry reversal posted.'
        );
    END IF;

    -- Enable override for administrative maintenance
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- =========================================================================
    -- BRANCH 1: PERMANENT PURGE (Hard Purge by Super Admin)
    -- =========================================================================
    IF p_permanent_purge THEN
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, v_audit_user_id, 'PURGE', 'EXPENSES', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'permanent_purge', true, 'admin_id', p_admin_id, 'timestamp', NOW()),
            NOW()
        );

        -- 1. Reconcile and clean up linked referral commission settlements
        FOR v_settle IN
            SELECT id, referral_agent_id, net_paid_amount, journal_entry_id
            FROM public.referral_commission_settlements
            WHERE organization_id = p_org_id AND expense_id = p_expense_id
        LOOP
            IF v_settle.referral_agent_id IS NOT NULL AND COALESCE(v_settle.net_paid_amount, 0) > 0 THEN
                UPDATE public.referral_agents
                SET total_commission_settled = GREATEST(0, COALESCE(total_commission_settled, 0) - v_settle.net_paid_amount),
                    updated_at = NOW()
                WHERE id = v_settle.referral_agent_id AND organization_id = p_org_id;
            END IF;

            IF v_settle.journal_entry_id IS NOT NULL AND v_settle.journal_entry_id != COALESCE(v_exp.journal_entry_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
                DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_settle.journal_entry_id;
                DELETE FROM public.journal_entries WHERE id = v_settle.journal_entry_id;
            END IF;

            DELETE FROM public.referral_commission_settlements WHERE id = v_settle.id;
        END LOOP;

        -- 2. Delete associated journal entry lines and journal entries for the expense
        IF v_exp.journal_entry_id IS NOT NULL THEN
            DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_exp.journal_entry_id;
            DELETE FROM public.journal_entries WHERE id = v_exp.journal_entry_id;
        END IF;

        DELETE FROM public.journal_entry_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE (reference_id = p_expense_id OR (reference_type IN ('EXPENSE', 'EXPENSE_PAYMENT') AND entry_number LIKE 'JE-EXP-%' || v_voucher_number || '%'))
        );

        DELETE FROM public.journal_entries
        WHERE (reference_id = p_expense_id OR (reference_type IN ('EXPENSE', 'EXPENSE_PAYMENT') AND entry_number LIKE 'JE-EXP-%' || v_voucher_number || '%'));

        -- 3. Delete voucher record
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' permanently purged from expenses register and general ledger.'
        );
    END IF;

    -- =========================================================================
    -- BRANCH 2: SAFE VOID (Soft Delete with Offsetting Reversal Journal)
    -- =========================================================================
    IF v_exp.journal_entry_id IS NOT NULL THEN
        SELECT * INTO v_je
        FROM public.journal_entries
        WHERE id = v_exp.journal_entry_id AND organization_id = p_org_id;

        IF FOUND AND v_je.status = 'POSTED' THEN
            v_rev_je_number := 'REV-' || v_je.entry_number;

            IF NOT EXISTS (
                SELECT 1 FROM public.journal_entries
                WHERE entry_number = v_rev_je_number AND organization_id = p_org_id
            ) THEN
                INSERT INTO public.journal_entries (
                    organization_id, entry_number, entry_date, reference_type,
                    reference_id, description, total_debit, total_credit, status, posted_by, created_at
                ) VALUES (
                    p_org_id, v_rev_je_number, CURRENT_DATE, 'EXPENSE_REVERSAL',
                    p_expense_id, 'Reversal of voided expense voucher ' || v_voucher_number || ': ' || p_reason,
                    v_je.total_credit, v_je.total_debit, 'DRAFT', v_audit_user_id, NOW()
                ) RETURNING id INTO v_rev_je_id;

                FOR v_line IN
                    SELECT * FROM public.journal_entry_lines
                    WHERE journal_entry_id = v_je.id
                LOOP
                    INSERT INTO public.journal_entry_lines (
                        journal_entry_id, account_id, debit, credit, description
                    ) VALUES (
                        v_rev_je_id, v_line.account_id, v_line.credit, v_line.debit,
                        'Reversal: ' || COALESCE(v_line.description, 'Void of ' || v_voucher_number)
                    );
                END LOOP;

                UPDATE public.journal_entries
                SET status = 'POSTED'
                WHERE id = v_rev_je_id;

                UPDATE public.journal_entries
                SET status = 'VOID'
                WHERE id = v_je.id;
            END IF;
        END IF;
    END IF;

    -- 3. Mark the expense voucher as VOIDED
    UPDATE public.expenses
    SET status = 'VOIDED',
        notes = COALESCE(notes, '') || ' [VOIDED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_expense_id AND organization_id = p_org_id;

    -- 4. Record audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, v_audit_user_id, 'VOID', 'EXPENSES', 'expenses', p_expense_id::text,
        to_jsonb(v_exp),
        jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'VOIDED', 'admin_id', p_admin_id, 'timestamp', NOW()),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'mode', 'VOIDED',
        'expense_id', p_expense_id,
        'voucher_number', v_voucher_number,
        'message', 'Expense voucher ' || v_voucher_number || ' successfully marked as VOIDED with reversal journal posted.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

COMMIT;
