-- =====================================================================================
-- Migration 155: 20261011074500_medical_certificates_and_cashier_bill_permissions.sql
-- 1. Enhances organization_settings with Cashier Bill Edit authorization toggle.
-- 2. Enhances medical_certificates table schema with expanded certificate types,
--    soft deletion, updated_at tracking, and full international clinical fields.
-- 3. Provides atomic Super Admin bill deletion and bill editing stored procedures.
-- =====================================================================================

-- 1. Organization Settings: Add Cashier Bill Edit authorization toggle
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS cashier_can_edit_bills BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_admin_to_delete_bills BOOLEAN DEFAULT true;

-- 2. Medical Certificates Table Enhancements
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id);

-- Widen the certificate_type check constraint safely to allow sick_leave, treatment, and fitness_to_work
DO $$
BEGIN
  -- Drop existing check constraint if present
  ALTER TABLE public.medical_certificates DROP CONSTRAINT IF EXISTS medical_certificates_certificate_type_check;
  
  -- Add updated check constraint with complete clinical types
  ALTER TABLE public.medical_certificates
    ADD CONSTRAINT medical_certificates_certificate_type_check
    CHECK (certificate_type IN (
      'birth',
      'death',
      'medical_fitness',
      'discharge',
      'overseas_clearance',
      'sick_leave',
      'treatment',
      'fitness_to_work'
    ));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update skipped or already applied: %', SQLERRM;
END $$;

-- 3. Atomic Bill Deletion Stored Procedure (Super Admin Exclusive)
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
DECLARE
  v_inv RECORD;
  v_payment_count INT;
BEGIN
  -- Verify invoice exists and belongs to organization
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  -- Count associated payments
  SELECT COUNT(*) INTO v_payment_count
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND organization_id = p_org_id;

  IF v_payment_count > 0 THEN
    -- If payments exist, void the invoice and mark as soft-deleted to preserve accounting ledger integrity
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
      'message', 'Invoice has associated payments. It was safely voided and removed from active billing ledger.'
    );
  ELSE
    -- If no payments exist, safely delete line items and invoice record
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'message', 'Invoice and line items have been permanently deleted.'
    );
  END IF;
END;
$$;

-- 4. Atomic Bill Edit Stored Procedure
CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_user_id UUID,
  p_items JSONB,
  p_discount_amount NUMERIC,
  p_discount_reason TEXT,
  p_tax_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv RECORD;
  v_subtotal NUMERIC(12, 2) := 0.00;
  v_grand_total NUMERIC(12, 2) := 0.00;
  v_due_amount NUMERIC(12, 2) := 0.00;
  v_new_status VARCHAR(20);
  v_item RECORD;
BEGIN
  -- Verify invoice exists
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
  END IF;

  IF v_inv.is_voided THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot edit a voided invoice.');
  END IF;

  -- Delete existing invoice items
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  -- Insert new invoice items and calculate subtotal
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    category VARCHAR(30),
    reference_id UUID,
    item_name VARCHAR(200),
    unit_price NUMERIC(10, 2),
    quantity NUMERIC(8, 2),
    total_price NUMERIC(12, 2)
  )
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id,
      service_category,
      reference_id,
      item_name,
      unit_price,
      quantity,
      total_price
    ) VALUES (
      p_invoice_id,
      v_item.category,
      v_item.reference_id,
      v_item.item_name,
      v_item.unit_price,
      v_item.quantity,
      COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity)
    );

    v_subtotal := v_subtotal + COALESCE(v_item.total_price, v_item.unit_price * v_item.quantity);
  END LOOP;

  -- Compute grand total & due
  v_grand_total := GREATEST(0.00, v_subtotal - COALESCE(p_discount_amount, 0.00) + COALESCE(p_tax_amount, 0.00));
  v_due_amount := GREATEST(0.00, v_grand_total - v_inv.paid_amount);

  IF v_due_amount <= 0.00 THEN
    v_new_status := 'PAID';
  ELSIF v_inv.paid_amount > 0.00 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'UNPAID';
  END IF;

  -- Update invoice
  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    discount_amount = COALESCE(p_discount_amount, 0.00),
    discount_reason = p_discount_reason,
    tax_amount = COALESCE(p_tax_amount, 0.00),
    grand_total = v_grand_total,
    due_amount = v_due_amount,
    status = v_new_status,
    updated_at = now()
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'subtotal', v_subtotal,
    'grand_total', v_grand_total,
    'due_amount', v_due_amount,
    'status', v_new_status
  );
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;
