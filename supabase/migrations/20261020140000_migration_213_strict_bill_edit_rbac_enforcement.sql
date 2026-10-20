-- =====================================================================================
-- Migration 213: Strict RBAC Enforcement on Invoice Bill Editing
-- Timestamp: 20261020140000
-- =====================================================================================

BEGIN;

-- 1. Ensure 'billing.edit' permission exists in the permission catalog
INSERT INTO public.permissions (key, module, description)
VALUES ('billing.edit', 'BILLING', 'Edit invoice line items and financial details')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

-- 2. Explicitly revoke 'billing.edit' from receptionist role across all organizations
DELETE FROM public.role_permissions rp
USING public.roles r
WHERE rp.role_id = r.id
  AND LOWER(r.name) = 'receptionist'
  AND rp.permission_key = 'billing.edit';

-- 3. Replace update_invoice_atomic with authoritative RBAC gate
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
  v_profile RECORD;
  v_role_name TEXT := 'receptionist';
  v_user_name TEXT := 'Hospital Staff';
  v_subtotal NUMERIC(12, 2) := 0.00;
  v_grand_total NUMERIC(12, 2) := 0.00;
  v_due_amount NUMERIC(12, 2) := 0.00;
  v_new_status VARCHAR(20);
  v_item RECORD;
  v_old_items JSONB := '[]'::jsonb;
  v_changes_summary TEXT := '';
  v_is_super_admin BOOLEAN := false;
  v_has_edit_perm BOOLEAN := false;
BEGIN
  -- Verify invoice exists and belongs to active organization
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
  END IF;

  IF v_inv.is_voided THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot edit a voided invoice.');
  END IF;

  -- Resolve editor profile details
  SELECT full_name, email INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF FOUND THEN
    v_user_name := COALESCE(v_profile.full_name, v_profile.email, 'Hospital Staff');
  END IF;

  -- Check if caller is super_admin in this organization
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) = 'super_admin'
  ) INTO v_is_super_admin;

  -- Resolve primary role for audit logging
  SELECT r.name INTO v_role_name
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = p_user_id AND ur.organization_id = p_org_id
  ORDER BY CASE WHEN LOWER(r.name) = 'super_admin' THEN 1 WHEN LOWER(r.name) = 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_role_name IS NULL THEN
    v_role_name := 'receptionist';
  END IF;

  -- If not super_admin, verify caller possesses dynamic 'billing.edit' permission
  IF NOT v_is_super_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = p_user_id
        AND ur.organization_id = p_org_id
        AND rp.permission_key = 'billing.edit'
    ) INTO v_has_edit_perm;

    IF NOT v_has_edit_perm THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '403 Forbidden: ইনভয়েস বিল এডিট করার অনুমতি নেই (Missing billing.edit permission for role ' || v_role_name || ').'
      );
    END IF;
  END IF;

  -- Capture old invoice items for forensic audit history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'service_category', service_category,
    'item_name', item_name,
    'unit_price', unit_price,
    'quantity', quantity,
    'total_price', total_price
  )), '[]'::jsonb)
  INTO v_old_items
  FROM public.invoice_items
  WHERE invoice_id = p_invoice_id;

  -- Delete existing invoice items
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  -- Insert new invoice items and compute subtotal
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

  -- Build changes summary
  v_changes_summary := format(
    'Subtotal: %s -> %s | Discount: %s -> %s | Grand Total: %s -> %s',
    v_inv.subtotal, v_subtotal,
    v_inv.discount_amount, COALESCE(p_discount_amount, 0.00),
    v_inv.grand_total, v_grand_total
  );

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

  -- Insert immutable audit history record
  INSERT INTO public.invoice_edit_history (
    organization_id,
    invoice_id,
    invoice_number,
    edited_by_user_id,
    edited_by_name,
    edited_by_role,
    edit_reason,
    previous_subtotal,
    new_subtotal,
    previous_discount,
    new_discount,
    previous_grand_total,
    new_grand_total,
    previous_items,
    new_items,
    changes_summary,
    created_at
  ) VALUES (
    p_org_id,
    p_invoice_id,
    v_inv.invoice_number,
    p_user_id,
    v_user_name,
    v_role_name,
    COALESCE(p_discount_reason, 'Bill items edited'),
    v_inv.subtotal,
    v_subtotal,
    v_inv.discount_amount,
    COALESCE(p_discount_amount, 0.00),
    v_inv.grand_total,
    v_grand_total,
    v_old_items,
    p_items,
    v_changes_summary,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'subtotal', v_subtotal,
    'grand_total', v_grand_total,
    'due_amount', v_due_amount,
    'status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;

COMMIT;
