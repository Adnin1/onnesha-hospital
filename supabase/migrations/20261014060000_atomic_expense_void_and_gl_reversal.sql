-- OHMS migration 187: authoritative, tenant-scoped expense-voucher void with balanced GL reversal.
-- Posted accounting records are never hard-deleted. A void produces a separate reversing
-- journal entry and changes the original POSTED journal's status to REVERSED in one transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.void_hospital_expense_atomic(
  p_org_id UUID,
  p_expense_id UUID,
  p_void_reason TEXT,
  p_voided_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_expense RECORD;
  v_original_je RECORD;
  v_reverse_je_id UUID;
  v_reverse_entry_number VARCHAR(60);
  v_line_count INTEGER := 0;
  v_line_debit NUMERIC(14,2) := 0;
  v_line_credit NUMERIC(14,2) := 0;
  v_reverse_debit NUMERIC(14,2) := 0;
  v_reverse_credit NUMERIC(14,2) := 0;
BEGIN
  IF v_user_id IS NULL OR p_voided_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'An authenticated caller must void their own authorized expense operation'
      USING ERRCODE = '42501';
  END IF;

  IF p_org_id IS NULL OR p_expense_id IS NULL OR NULLIF(BTRIM(p_void_reason), '') IS NULL OR LENGTH(BTRIM(p_void_reason)) < 4 THEN
    RAISE EXCEPTION 'Organization, expense, and a void reason of at least 4 characters are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.organization_id = p_org_id
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
      AND COALESCE(p.active_organization_id, p.organization_id) = p_org_id
  ) THEN
    RAISE EXCEPTION 'Active organization membership is required to void an expense voucher'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.organization_id = p_org_id
    JOIN public.roles r
      ON r.id = ur.role_id
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
      AND COALESCE(p.active_organization_id, p.organization_id) = p_org_id
      AND (
        LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator')
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role_id = ur.role_id
            AND rp.permission_key IN ('accounting.manage', '*')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Accounting management permission is required to void an expense voucher'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.*
  INTO v_expense
  FROM public.expenses e
  WHERE e.id = p_expense_id
    AND e.organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Expense voucher not found in the active organization.'
    );
  END IF;

  IF UPPER(COALESCE(v_expense.status, '')) IN ('VOID', 'VOIDED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'VOIDED',
      'already_voided', true,
      'message', 'Voucher was already voided; no duplicate journal reversal was created.'
    );
  END IF;

  -- Resolve the linked journal by authoritative FK first, then by source transaction identity.
  SELECT je.*
  INTO v_original_je
  FROM public.journal_entries je
  WHERE je.organization_id = p_org_id
    AND (
      je.id = v_expense.journal_entry_id
      OR je.reference_id = p_expense_id
    )
  ORDER BY
    CASE WHEN je.id = v_expense.journal_entry_id THEN 0 ELSE 1 END,
    je.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Drafts never posted to GL may be voided without fabricating a reversal.
    IF UPPER(COALESCE(v_expense.status, '')) IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED') THEN
      UPDATE public.expenses
      SET status = 'VOIDED',
          voided_at = pg_catalog.now(),
          voided_by = v_user_id,
          void_reason = BTRIM(p_void_reason),
          updated_at = pg_catalog.now()
      WHERE id = p_expense_id
        AND organization_id = p_org_id;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'VOIDED',
        'message', 'Unposted voucher was voided; no general-ledger reversal was needed.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Posted voucher has no linked journal entry. The voucher was not changed; repair the ledger link first.'
    );
  END IF;

  IF v_original_je.status <> 'POSTED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'The linked journal is not POSTED. No voucher status was changed; review journal status and existing reversal history.'
    );
  END IF;

  IF v_original_je.total_debit IS NULL
     OR v_original_je.total_credit IS NULL
     OR v_original_je.total_debit <= 0
     OR v_original_je.total_debit <> v_original_je.total_credit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'The source journal is not balanced. No voucher status was changed; reconcile the original journal first.'
    );
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(jel.debit), 0),
    COALESCE(SUM(jel.credit), 0)
  INTO v_line_count, v_line_debit, v_line_credit
  FROM public.journal_entry_lines jel
  WHERE jel.journal_entry_id = v_original_je.id;

  IF v_line_count < 2
     OR v_line_debit <> v_original_je.total_debit
     OR v_line_credit <> v_original_je.total_credit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source journal lines do not reconcile to the journal header. No voucher status was changed.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines jel
    LEFT JOIN public.chart_of_accounts coa
      ON coa.id = jel.account_id
    WHERE jel.journal_entry_id = v_original_je.id
      AND (coa.id IS NULL OR coa.organization_id <> p_org_id)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source journal contains a missing or cross-organization account. No voucher status was changed.'
    );
  END IF;

  v_reverse_entry_number :=
    'JE-EXP-VOID-' ||
    pg_catalog.to_char(CURRENT_DATE, 'YYYYMMDD') ||
    '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 8));

  -- Insert the reversal in PENDING state; the existing immutability trigger checks
  -- at least two balanced lines before it permits transition to POSTED.
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
    v_reverse_entry_number,
    CURRENT_DATE,
    'EXPENSE_VOID_REVERSAL',
    p_expense_id,
    'Reversal of expense voucher ' || COALESCE(v_expense.voucher_number, p_expense_id::TEXT) ||
      '. Reason: ' || BTRIM(p_void_reason),
    'PENDING',
    v_original_je.total_credit,
    v_original_je.total_debit,
    v_user_id
  )
  RETURNING id INTO v_reverse_je_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description
  )
  SELECT
    v_reverse_je_id,
    jel.account_id,
    jel.credit,
    jel.debit,
    'Expense void reversal: ' || COALESCE(jel.description, v_expense.title, 'Expense')
  FROM public.journal_entry_lines jel
  WHERE jel.journal_entry_id = v_original_je.id;

  SELECT
    COALESCE(SUM(jel.debit), 0),
    COALESCE(SUM(jel.credit), 0)
  INTO v_reverse_debit, v_reverse_credit
  FROM public.journal_entry_lines jel
  WHERE jel.journal_entry_id = v_reverse_je_id;

  IF v_reverse_debit <> v_original_je.total_credit
     OR v_reverse_credit <> v_original_je.total_debit
     OR v_reverse_debit <> v_reverse_credit THEN
    RAISE EXCEPTION 'Generated expense reversal does not balance'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.journal_entries
  SET status = 'POSTED'
  WHERE id = v_reverse_je_id
    AND organization_id = p_org_id;

  -- Preserve the original journal values and metadata; only its status changes.
  UPDATE public.journal_entries
  SET status = 'REVERSED'
  WHERE id = v_original_je.id
    AND organization_id = p_org_id
    AND status = 'POSTED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source journal could not be marked REVERSED; operation rolled back'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expenses
  SET status = 'VOIDED',
      voided_at = pg_catalog.now(),
      voided_by = v_user_id,
      void_reason = BTRIM(p_void_reason),
      updated_at = pg_catalog.now()
  WHERE id = p_expense_id
    AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense voucher could not be marked VOIDED; operation rolled back'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'VOIDED',
    'voucher_number', v_expense.voucher_number,
    'reversed_journal_entry_id', v_original_je.id,
    'reversal_journal_entry_id', v_reverse_je_id,
    'reversal_entry_number', v_reverse_entry_number,
    'message', 'Expense voucher voided; original journal preserved and balanced reversal posted.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
