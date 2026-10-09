-- ==============================================================================
-- OHMS Migration 129: Episode Billing Service Exclusion & Granular Deletion
-- Date: 2026-10-09
-- Purpose:
--   1. Upgrades create_episode_settlement_invoice_atomic_v2 to accept
--      p_excluded_reference_ids JSONB DEFAULT '[]'::JSONB so cashiers can
--      exclude/waive specific services or items from final invoice settlement.
--   2. Ensures backwards compatibility with 10-parameter callers.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_episode_settlement_invoice_atomic_v2(
    UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_referral_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_excluded_reference_ids JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_preview JSONB;
    v_lines JSONB;
    v_line JSONB;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC := COALESCE(p_discount_amount, 0);
    v_grand_total NUMERIC := 0;
    v_paid NUMERIC := COALESCE(p_initial_payment_amount, 0);
    v_due NUMERIC := 0;
    v_status TEXT := 'UNPAID';
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_receipt_number TEXT;
    v_payment_id UUID;
    v_primary_visit_id UUID;
    v_ref_id UUID;
    v_included_count INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT *
      INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
      AND patient_id = p_patient_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_NOT_ACTIVE'; END IF;

    v_preview := public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, NOW());
    v_lines := COALESCE(v_preview->'lines', '[]'::JSONB);
    v_primary_visit_id := NULLIF(v_preview->>'primary_visit_id', '')::UUID;

    IF jsonb_array_length(v_lines) = 0 THEN
      RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    -- Calculate subtotal strictly across NON-excluded lines
    SELECT 
      COALESCE(SUM((val->>'total_price')::NUMERIC), 0),
      COUNT(*)
    INTO v_subtotal, v_included_count
    FROM jsonb_array_elements(v_lines) val
    WHERE p_excluded_reference_ids IS NULL 
       OR NOT (p_excluded_reference_ids ? (val->>'reference_id'));

    IF v_included_count = 0 OR v_subtotal <= 0 THEN
      RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    IF v_discount < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_DISCOUNT_PROHIBITED';
    END IF;

    IF v_discount > v_subtotal THEN
      v_discount := v_subtotal;
    END IF;

    v_grand_total := ROUND(v_subtotal - v_discount, 2);

    IF v_paid < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_PAYMENT_PROHIBITED';
    END IF;

    IF v_paid > v_grand_total THEN
      v_paid := v_grand_total;
    END IF;

    v_due := ROUND(v_grand_total - v_paid, 2);

    IF v_due <= 0.005 THEN
      v_status := 'PAID';
    ELSIF v_paid > 0.005 THEN
      v_status := 'PARTIAL';
    ELSE
      v_status := 'UNPAID';
    END IF;

    -- Generate Invoice Number
    SELECT public.generate_invoice_number(p_org_id) INTO v_invoice_number;

    -- Create Invoice
    INSERT INTO public.invoices (
      organization_id, patient_id, episode_id, visit_id, invoice_number,
      total_amount, discount_amount, discount_reason, grand_total,
      paid_amount, due_amount, status, is_episode_settlement,
      referral_agent_id, notes, created_by, created_at, updated_at
    )
    VALUES (
      p_org_id, p_patient_id, p_episode_id, v_primary_visit_id, v_invoice_number,
      v_subtotal, v_discount, p_discount_reason, v_grand_total,
      v_paid, v_due, v_status, TRUE,
      COALESCE(p_referral_agent_id, v_episode.referral_agent_id),
      p_notes, p_cashier_id, NOW(), NOW()
    )
    RETURNING id INTO v_invoice_id;

    -- Insert Invoice Items (skipping any excluded reference_id)
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
      IF p_excluded_reference_ids IS NOT NULL AND p_excluded_reference_ids ? (v_line->>'reference_id') THEN
        CONTINUE;
      END IF;

      v_ref_id := NULLIF(v_line->>'reference_id', '')::UUID;

      INSERT INTO public.invoice_items (
        organization_id, invoice_id, reference_id, service_category,
        item_name, unit_price, quantity, total_price, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, v_ref_id,
        COALESCE(v_line->>'service_category', 'MISC'),
        COALESCE(v_line->>'item_name', 'Service'),
        COALESCE((v_line->>'unit_price')::NUMERIC, 0),
        COALESCE((v_line->>'quantity')::NUMERIC, 1),
        COALESCE((v_line->>'total_price')::NUMERIC, 0),
        NOW()
      );

      -- Mark custom charge as billed if applicable
      IF COALESCE((v_line->>'is_custom_charge')::BOOLEAN, FALSE) = TRUE AND (v_line->>'charge_id') IS NOT NULL THEN
        UPDATE public.episode_service_charges
        SET is_billed = TRUE, status = 'BILLED', updated_at = NOW()
        WHERE id = (v_line->>'charge_id')::UUID
          AND organization_id = p_org_id;
      END IF;
    END LOOP;

    -- Record Initial Payment if made
    IF v_paid > 0.005 THEN
      SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

      INSERT INTO public.payments (
        organization_id, invoice_id, patient_id, amount,
        payment_method, receipt_number, notes, created_by,
        payment_date, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, p_patient_id, v_paid,
        p_payment_method, v_receipt_number,
        COALESCE(p_notes, 'Episode final settlement initial payment'),
        p_cashier_id, NOW(), NOW()
      )
      RETURNING id INTO v_payment_id;
    END IF;

    RETURN jsonb_build_object(
      'success', TRUE,
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'subtotal', v_subtotal,
      'discount_amount', v_discount,
      'grand_total', v_grand_total,
      'paid_amount', v_paid,
      'due_amount', v_due,
      'status', v_status,
      'receipt_number', v_receipt_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT, JSONB) TO authenticated, service_role;

COMMIT;
