-- ==============================================================================
-- Migration 252: Dynamic Referral Agent Editing & Commission Sync on Invoice Modification
-- ==============================================================================
-- Description:
--   1. Upgrades `public.search_referral_agents_for_billing` to permit staff with
--      `billing.edit` permission to look up active referral agents.
--   2. Enhances `public.update_invoice_atomic` to accept `p_referral_agent_id UUID`
--      allowing cashiers and billing managers to dynamically assign, change, or
--      remove a referral agent on an existing bill.
--   3. Automatically synchronizes `public.referral_commissions` and
--      `public.referral_agents.total_commission_earned`:
--      - If a new agent is selected, dynamically inserts or updates the pending commission.
--      - If the agent is changed, adjusts old agent's earnings down and new agent's up.
--      - If bill totals change, recalculates commission base and amount dynamically.
--      - If agent is removed, cancels/deletes the pending commission cleanly.
--      - Protects settled/paid commissions from destructive re-attribution.
--   4. Preserves backward-compatible 7-parameter forwarder overload.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Upgrade search_referral_agents_for_billing RPC Permission Scope
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_referral_agents_for_billing(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30),
    commission_rate_percent NUMERIC(5,2),
    is_commission_eligible BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.edit', 'billing.manage', 'referral.view', 'referral.assign', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks billing cashier/edit authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.commission_rate_percent,
        ra.is_commission_eligible
    FROM public.referral_agents ra
    WHERE ra.organization_id = p_org_id
      AND ra.is_active = TRUE
      AND ra.archived_at IS NULL
      AND (
          p_query IS NULL
          OR BTRIM(p_query) = ''
          OR ra.full_name ILIKE ('%' || BTRIM(p_query) || '%')
          OR ra.agent_code ILIKE ('%' || BTRIM(p_query) || '%')
          OR ra.phone ILIKE ('%' || BTRIM(p_query) || '%')
      )
    ORDER BY ra.full_name ASC
    LIMIT 30;
END;
$$;

REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Canonical 8-Parameter update_invoice_atomic Implementation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_user_id UUID,
  p_items JSONB,
  p_discount_amount NUMERIC,
  p_discount_reason TEXT,
  p_tax_amount NUMERIC,
  p_referral_agent_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  -- Referral agent & dynamic commission variables
  v_existing_comm RECORD;
  v_comm_exists BOOLEAN := false;
  v_ref_agent RECORD;
  v_comm_rate NUMERIC(5, 2) := 10.00;
  v_comm_amount NUMERIC(14, 2) := 0.00;
  v_comm_diff NUMERIC(14, 2) := 0.00;
  v_target_ref_id UUID := NULL;
  v_ref_change_note TEXT := '';
BEGIN
  -- 1. Verify invoice exists and belongs to active organization
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
  END IF;

  IF v_inv.is_voided THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot edit a voided invoice.');
  END IF;

  -- 2. Resolve editor profile details
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

  -- 3. Capture old invoice items for forensic audit history
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

  -- 4. Delete existing invoice items and insert updated ones
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

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

  -- 5. Compute grand total & due
  v_grand_total := GREATEST(0.00, v_subtotal - COALESCE(p_discount_amount, 0.00) + COALESCE(p_tax_amount, 0.00));
  v_due_amount := GREATEST(0.00, v_grand_total - v_inv.paid_amount);

  IF v_due_amount <= 0.00 THEN
    v_new_status := 'PAID';
  ELSIF v_inv.paid_amount > 0.00 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'UNPAID';
  END IF;

  -- 6. Synchronize Referral Agent & Commissions
  SELECT * INTO v_existing_comm
  FROM public.referral_commissions
  WHERE organization_id = p_org_id AND invoice_id = p_invoice_id;
  v_comm_exists := FOUND;

  IF p_referral_agent_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    -- Explicit removal of referral agent
    v_target_ref_id := NULL;
    IF v_comm_exists THEN
      IF v_existing_comm.settlement_status = 'PAID' THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot remove referral agent: Commission for this invoice has already been settled and paid out.'
        );
      ELSE
        UPDATE public.referral_agents
        SET total_commission_earned = GREATEST(0.00, total_commission_earned - v_existing_comm.commission_amount),
            updated_at = now()
        WHERE id = v_existing_comm.referral_agent_id;

        DELETE FROM public.referral_commissions WHERE id = v_existing_comm.id;
        v_ref_change_note := ' | Referral Agent Removed (was ' || v_existing_comm.referral_name_snapshot || ')';
      END IF;
    ELSE
      v_ref_change_note := ' | Referral Agent set to None';
    END IF;

  ELSIF p_referral_agent_id IS NOT NULL THEN
    -- A specific referral agent was selected / modified
    SELECT * INTO v_ref_agent
    FROM public.referral_agents
    WHERE id = p_referral_agent_id AND organization_id = p_org_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Selected referral agent is invalid or inactive.');
    END IF;

    v_target_ref_id := p_referral_agent_id;
    v_comm_rate := COALESCE(v_ref_agent.commission_rate_percent, 10.00);
    v_comm_amount := ROUND((v_grand_total * v_comm_rate / 100.0), 2);

    IF v_comm_exists THEN
      IF v_existing_comm.settlement_status = 'PAID' THEN
        IF v_existing_comm.referral_agent_id != p_referral_agent_id THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot reassign referral agent: Commission has already been settled and paid out to ' || v_existing_comm.referral_name_snapshot || '.'
          );
        END IF;
      ELSE
        -- Settlement is PENDING (unpaid)
        IF v_existing_comm.referral_agent_id != p_referral_agent_id THEN
          -- Agent changed: deduct from old agent, reassign commission record, add to new agent
          UPDATE public.referral_agents
          SET total_commission_earned = GREATEST(0.00, total_commission_earned - v_existing_comm.commission_amount),
              updated_at = now()
          WHERE id = v_existing_comm.referral_agent_id;

          UPDATE public.referral_commissions
          SET referral_agent_id = v_ref_agent.id,
              referral_code_snapshot = v_ref_agent.agent_code,
              referral_name_snapshot = v_ref_agent.full_name,
              billing_subtotal = v_subtotal,
              discount_amount = COALESCE(p_discount_amount, 0.00),
              commission_base_amount = v_grand_total,
              commission_rate_percent = v_comm_rate,
              commission_amount = v_comm_amount,
              amount_pending = v_comm_amount,
              approval_status = CASE WHEN v_ref_agent.agent_type = 'DOCTOR' AND v_ref_agent.compliance_approved IS NOT TRUE THEN 'PENDING' ELSE 'APPROVED' END,
              updated_at = now()
          WHERE id = v_existing_comm.id;

          UPDATE public.referral_agents
          SET total_commission_earned = total_commission_earned + v_comm_amount,
              updated_at = now()
          WHERE id = v_ref_agent.id;

          v_ref_change_note := ' | Referral Agent Reassigned: ' || v_existing_comm.referral_name_snapshot || ' -> ' || v_ref_agent.full_name || ' (' || v_comm_rate || '% = ৳' || v_comm_amount || ')';
        ELSE
          -- Same agent: recalculate commission for updated grand total
          v_comm_diff := v_comm_amount - v_existing_comm.commission_amount;

          UPDATE public.referral_commissions
          SET billing_subtotal = v_subtotal,
              discount_amount = COALESCE(p_discount_amount, 0.00),
              commission_base_amount = v_grand_total,
              commission_rate_percent = v_comm_rate,
              commission_amount = v_comm_amount,
              amount_pending = v_comm_amount - amount_paid,
              updated_at = now()
          WHERE id = v_existing_comm.id;

          UPDATE public.referral_agents
          SET total_commission_earned = GREATEST(0.00, total_commission_earned + v_comm_diff),
              updated_at = now()
          WHERE id = v_ref_agent.id;

          v_ref_change_note := ' | Referral Commission Recalculated: ' || v_ref_agent.full_name || ' (' || v_comm_rate || '% = ৳' || v_comm_amount || ')';
        END IF;
      END IF;
    ELSE
      -- No commission existed yet: dynamically insert new commission record
      IF v_comm_amount > 0 AND v_ref_agent.is_commission_eligible IS TRUE THEN
        INSERT INTO public.referral_commissions (
            organization_id, referral_agent_id, referral_attribution_id,
            patient_id, visit_id, invoice_id,
            referral_code_snapshot, referral_name_snapshot,
            billing_subtotal, discount_amount, commission_base_amount,
            commission_rate_percent, commission_amount,
            amount_paid, amount_pending,
            approval_status, settlement_status,
            created_at, updated_at
        ) VALUES (
            p_org_id, v_ref_agent.id, NULL,
            v_inv.patient_id, v_inv.visit_id, p_invoice_id,
            v_ref_agent.agent_code, v_ref_agent.full_name,
            v_subtotal, COALESCE(p_discount_amount, 0.00), v_grand_total,
            v_comm_rate, v_comm_amount,
            0.00, v_comm_amount,
            CASE WHEN v_ref_agent.agent_type = 'DOCTOR' AND v_ref_agent.compliance_approved IS NOT TRUE THEN 'PENDING' ELSE 'APPROVED' END,
            'PENDING',
            now(), now()
        );

        UPDATE public.referral_agents
        SET total_commission_earned = total_commission_earned + v_comm_amount,
            updated_at = now()
        WHERE id = v_ref_agent.id;

        v_ref_change_note := ' | Referral Agent Assigned Dynamically: ' || v_ref_agent.full_name || ' (' || v_comm_rate || '% = ৳' || v_comm_amount || ')';
      END IF;
    END IF;

  ELSE
    -- p_referral_agent_id IS NULL: preserve existing referral_agent_id on invoice
    v_target_ref_id := v_inv.referral_agent_id;

    -- If existing commission exists and is PENDING, synchronize amount with new grand_total
    IF v_comm_exists AND v_existing_comm.settlement_status != 'PAID' THEN
      v_comm_rate := v_existing_comm.commission_rate_percent;
      v_comm_amount := ROUND((v_grand_total * v_comm_rate / 100.0), 2);
      v_comm_diff := v_comm_amount - v_existing_comm.commission_amount;

      UPDATE public.referral_commissions
      SET billing_subtotal = v_subtotal,
          discount_amount = COALESCE(p_discount_amount, 0.00),
          commission_base_amount = v_grand_total,
          commission_amount = v_comm_amount,
          amount_pending = v_comm_amount - amount_paid,
          updated_at = now()
      WHERE id = v_existing_comm.id;

      UPDATE public.referral_agents
      SET total_commission_earned = GREATEST(0.00, total_commission_earned + v_comm_diff),
          updated_at = now()
      WHERE id = v_existing_comm.referral_agent_id;

      v_ref_change_note := ' | Referral Commission Auto-Synced: ' || v_existing_comm.referral_name_snapshot || ' (' || v_comm_rate || '% = ৳' || v_comm_amount || ')';
    END IF;
  END IF;

  -- 7. Update Invoice record
  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    discount_amount = COALESCE(p_discount_amount, 0.00),
    discount_reason = p_discount_reason,
    tax_amount = COALESCE(p_tax_amount, 0.00),
    grand_total = v_grand_total,
    due_amount = v_due_amount,
    status = v_new_status,
    referral_agent_id = v_target_ref_id,
    updated_at = now()
  WHERE id = p_invoice_id AND organization_id = p_org_id;

  -- 8. Build changes summary
  v_changes_summary := format(
    'Subtotal: %s -> %s | Discount: %s -> %s | Grand Total: %s -> %s%s',
    v_inv.subtotal, v_subtotal,
    v_inv.discount_amount, COALESCE(p_discount_amount, 0.00),
    v_inv.grand_total, v_grand_total,
    v_ref_change_note
  );

  -- 9. Insert immutable audit history record
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
    'status', v_new_status,
    'referral_agent_id', v_target_ref_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Backward-Compatible 7-Parameter Forwarder
-- ------------------------------------------------------------------------------
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
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_invoice_atomic(
    p_org_id,
    p_invoice_id,
    p_user_id,
    p_items,
    p_discount_amount,
    p_discount_reason,
    p_tax_amount,
    NULL::UUID
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;

COMMIT;
