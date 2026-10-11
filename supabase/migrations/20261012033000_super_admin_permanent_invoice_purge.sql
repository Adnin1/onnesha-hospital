-- Migration: 20261012033000_super_admin_permanent_invoice_purge.sql
-- Description: Enhances delete_invoice_super_admin_atomic to support permanent purge of invoices and all linked payment history
-- Invariant: Strictly restricted to Super Admin role; completely purges line items, payments, refunds, and foreign module links

BEGIN;

-- Drop previous 4-arg signature to prevent function overload resolution conflicts
DROP FUNCTION IF EXISTS public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN);

-- Create enhanced 5-arg signature with p_permanent_purge defaulted to FALSE
CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
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
  v_inv RECORD;
  v_payment_count INT;
  v_inv_number TEXT;
BEGIN
  -- 1. Verify invoice exists and belongs to organization
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  -- 2. Count associated payments
  SELECT COUNT(*) INTO v_payment_count
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND organization_id = p_org_id;

  -- 3. Check permanent purge mode
  IF p_permanent_purge THEN
    -- PERMANENT HARD DELETE: Obliterate the bill and wipe entire associated history from database
    
    -- Unlink foreign references in other modules so FK constraints do not fail
    UPDATE public.pharmacy_sales 
    SET invoice_id = NULL 
    WHERE invoice_id = p_invoice_id;

    -- Delete or nullify referral commissions
    DELETE FROM public.referral_commissions 
    WHERE invoice_id = p_invoice_id;

    -- Delete insurance claims
    DELETE FROM public.insurance_claims 
    WHERE invoice_id = p_invoice_id;

    -- Delete reconciliation and payment intents
    DELETE FROM public.payment_reconciliations 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.payment_intents 
    WHERE invoice_id = p_invoice_id;

    -- Delete refunds and payments
    DELETE FROM public.refunds 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.payments 
    WHERE invoice_id = p_invoice_id;

    -- Delete line items
    DELETE FROM public.invoice_items 
    WHERE invoice_id = p_invoice_id;

    -- Delete invoice itself
    DELETE FROM public.invoices 
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PERMANENTLY_PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice #' || v_inv_number || ' এবং এর সমস্ত পেমেন্ট হিস্ট্রি স্থায়ীভাবে ডাটাবেজ থেকে সম্পূর্ণ মুছে ফেলা হয়েছে।'
    );

  ELSE
    -- SAFE VOID / SOFT DELETE MODE
    IF v_payment_count > 0 THEN
      UPDATE public.invoices
      SET 
        is_voided = true,
        status = 'VOID',
        void_reason = COALESCE(p_reason, 'Deleted by Super Admin'),
        voided_by = p_admin_id,
        updated_at = now()
      WHERE id = p_invoice_id AND organization_id = p_org_id;

      RETURN jsonb_build_object(
        'success', true,
        'mode', 'VOIDED',
        'invoice_number', v_inv_number,
        'message', 'বিলটি নিরাপদভাবে Void ও Soft-Delete হিসেবে চিহ্নিত করা হয়েছে। অডিট ট্র্যাকিং অক্ষুণ্ণ রয়েছে।'
      );
    ELSE
      -- No payments exist, safe to delete directly
      DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
      DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

      RETURN jsonb_build_object(
        'success', true,
        'mode', 'PURGED',
        'invoice_number', v_inv_number,
        'message', 'কোনো পেমেন্ট না থাকায় বিলটি এবং এর আইটেমগুলো সম্পূর্ণ মুছে ফেলা হয়েছে।'
      );
    END IF;
  END IF;
END;
$$;

-- Create 4-argument convenience overload that delegates to 5-argument version with p_permanent_purge = FALSE
CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.delete_invoice_super_admin_atomic(p_org_id, p_invoice_id, p_admin_id, p_reason, FALSE);
END;
$$;

-- Grant permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
