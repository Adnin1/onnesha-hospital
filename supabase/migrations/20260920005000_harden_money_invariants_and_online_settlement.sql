-- =====================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- Migration: 20260920005000_harden_money_invariants_and_online_settlement.sql
-- 1. Enforce strict PostgreSQL table CHECK constraints for all financial invariants:
--    invoices (subtotal >= 0, discount >= 0, discount <= subtotal, grand_total >= 0,
--              paid >= 0, due >= 0, paid <= grand_total, due = grand_total - paid)
--    invoice_items (unit_price >= 0, quantity > 0, total_price >= 0)
--    payments (amount > 0, cash must have cashier, cash cannot have gateway trx id)
-- 2. Allow cashier_id to be NULL on public.payments for automated gateway settlements.
-- 3. Eliminate arbitrary cashier fallback in verify_and_record_online_payment():
--    Online gateway automated settlement sets cashier_id = NULL.
--    Explicit cashier must belong to org and be active.
-- 4. Restrict verify_and_record_online_payment strictly to service_role.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. PAYMENTS LEDGER CONSTRAINTS & NULLABLE CASHIER FOR ONLINE GATEWAYS
-- -------------------------------------------------------------------------------------
-- Drop NOT NULL on cashier_id so automated online gateway settlements do not fabricate cashiers
ALTER TABLE public.payments ALTER COLUMN cashier_id DROP NOT NULL;

-- Payment amount must be positive
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_amount_positive;
ALTER TABLE public.payments ADD CONSTRAINT chk_payments_amount_positive 
    CHECK (amount > 0);

-- Cash payments MUST have an authenticated human cashier
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_cashier_method;
ALTER TABLE public.payments ADD CONSTRAINT chk_payments_cashier_method 
    CHECK (payment_method != 'CASH' OR cashier_id IS NOT NULL);

-- Cash payments must NOT have a gateway transaction ID
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_cash_no_gateway_trx;
ALTER TABLE public.payments ADD CONSTRAINT chk_payments_cash_no_gateway_trx 
    CHECK (payment_method != 'CASH' OR gateway_transaction_id IS NULL OR TRIM(gateway_transaction_id) = '');

-- -------------------------------------------------------------------------------------
-- 2. INVOICE ITEMS FINANCIAL CONSTRAINTS
-- -------------------------------------------------------------------------------------
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS chk_invoice_items_unit_price;
ALTER TABLE public.invoice_items ADD CONSTRAINT chk_invoice_items_unit_price 
    CHECK (unit_price >= 0);

ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS chk_invoice_items_quantity;
ALTER TABLE public.invoice_items ADD CONSTRAINT chk_invoice_items_quantity 
    CHECK (quantity > 0);

ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS chk_invoice_items_total_price;
ALTER TABLE public.invoice_items ADD CONSTRAINT chk_invoice_items_total_price 
    CHECK (total_price >= 0);

-- -------------------------------------------------------------------------------------
-- 3. INVOICES MASTER STRICT MONEY INVARIANTS
-- -------------------------------------------------------------------------------------
-- Ensure existing records adhere before adding constraints
UPDATE public.invoices 
SET subtotal = GREATEST(0, COALESCE(subtotal, 0)),
    discount_amount = GREATEST(0, LEAST(COALESCE(discount_amount, 0), COALESCE(subtotal, 0))),
    tax_amount = GREATEST(0, COALESCE(tax_amount, 0)),
    grand_total = GREATEST(0, COALESCE(subtotal, 0) - GREATEST(0, LEAST(COALESCE(discount_amount, 0), COALESCE(subtotal, 0))) + GREATEST(0, COALESCE(tax_amount, 0))),
    paid_amount = GREATEST(0, LEAST(COALESCE(paid_amount, 0), GREATEST(0, COALESCE(subtotal, 0) - GREATEST(0, LEAST(COALESCE(discount_amount, 0), COALESCE(subtotal, 0))) + GREATEST(0, COALESCE(tax_amount, 0))))),
    due_amount = GREATEST(0, (GREATEST(0, COALESCE(subtotal, 0) - GREATEST(0, LEAST(COALESCE(discount_amount, 0), COALESCE(subtotal, 0))) + GREATEST(0, COALESCE(tax_amount, 0)))) - (GREATEST(0, LEAST(COALESCE(paid_amount, 0), GREATEST(0, COALESCE(subtotal, 0) - GREATEST(0, LEAST(COALESCE(discount_amount, 0), COALESCE(subtotal, 0))) + GREATEST(0, COALESCE(tax_amount, 0)))))))
WHERE subtotal < 0 
   OR discount_amount < 0 
   OR discount_amount > subtotal 
   OR tax_amount < 0 
   OR grand_total < 0 
   OR paid_amount < 0 
   OR due_amount < 0 
   OR paid_amount > grand_total 
   OR due_amount != (grand_total - paid_amount);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_subtotal;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_subtotal 
    CHECK (subtotal >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_discount_non_negative;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_discount_non_negative 
    CHECK (discount_amount >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_discount_le_subtotal;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_discount_le_subtotal 
    CHECK (discount_amount <= subtotal);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_tax_non_negative;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_tax_non_negative 
    CHECK (tax_amount >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_grand_total;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_grand_total 
    CHECK (grand_total >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_paid_amount;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_paid_amount 
    CHECK (paid_amount >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_due_amount;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_due_amount 
    CHECK (due_amount >= 0);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_paid_le_grand_total;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_paid_le_grand_total 
    CHECK (paid_amount <= grand_total);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_due_eq_difference;
ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_due_eq_difference 
    CHECK (due_amount = grand_total - paid_amount);

-- -------------------------------------------------------------------------------------
-- 4. HARDEN verify_and_record_online_payment (Zero Arbitrary Cashier Fallback)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL
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
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
BEGIN
    v_calling_user_id := auth.uid();

    -- Gate 1: Execution is restricted strictly to server-side service_role / internal webhook caller
    IF auth.role() IS NOT NULL AND auth.role() != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Direct client payment settlement is prohibited. Settlement must be processed via verified provider webhook.');
    END IF;

    -- Gate 2: If invoked from client environment without service_role credentials, deny access
    IF current_user != 'service_role' AND (auth.role() IS NULL OR auth.role() != 'service_role') THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Only trusted webhook settlement service can invoke payment settlement.');
    END IF;

    -- Gate 3: Lock payment intent within the specified organization
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment intent not found in organization.');
    END IF;

    -- Gate 4: Idempotent return if already settled
    IF v_intent.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    -- Gate 5: Lock invoice within the same organization
    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated invoice not found.');
    END IF;

    -- Gate 6: Duplicate provider transaction check across all payments
    IF EXISTS (
        SELECT 1 FROM public.payments 
        WHERE gateway_transaction_id = p_provider_trx_id 
          AND organization_id = p_org_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID: Provider transaction has already been recorded.');
    END IF;

    -- Gate 7: Strict positive amount and exact matching against intent
    IF p_paid_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount must be positive.');
    END IF;

    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO public.payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, p_provider_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount does not match expected payable amount.');
    END IF;

    -- Gate 8: Authoritative Cashier Semantics (Zero Arbitrary Fallback)
    -- If p_cashier_id is explicitly passed, validate that it belongs to org and is active.
    -- If p_cashier_id is NULL, cashier is NULL (automated online gateway settlement without human cashier).
    IF p_cashier_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cashier_id AND organization_id = p_org_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or is inactive.');
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
        p_org_id, v_invoice.id, v_receipt_no, p_gateway_method,
        p_paid_amount, p_provider_trx_id,
        v_cashier_uuid,
        'Online Gateway Settlement: ' || p_gateway_method || ' (Trx: ' || p_provider_trx_id || ')'
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
        provider_transaction_id = p_provider_trx_id,
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
            'payment_method', p_gateway_method,
            'gateway_transaction_id', p_provider_trx_id,
            'cashier_id', v_cashier_uuid,
            'new_paid', v_new_paid,
            'new_due', v_new_due,
            'new_status', v_new_status,
            'intent_id', v_intent.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_no,
        'new_due', v_new_due,
        'new_status', v_new_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment settlement could not be processed.');
END;
$$;

-- Revoke execute from public, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID) TO service_role;
