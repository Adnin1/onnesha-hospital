-- =====================================================================================
-- MIGRATION 211: BLOOD BANK EXTENSIONS, IMMUTABLE INVOICE EDIT AUDIT & RBAC DYNAMIC PERSISTENCE
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. BLOOD BANK: EXPAND DONOR & INVENTORY SCHEMA FOR CLINICAL & WHO STANDARDS
-- -------------------------------------------------------------------------------------

-- Alter public.blood_donors with additional fields
ALTER TABLE public.blood_donors 
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS donor_type TEXT DEFAULT 'voluntary',
  ADD COLUMN IF NOT EXISTS sourcing_blood_bank TEXT DEFAULT 'Annesha Central Blood Bank (In-House)',
  ADD COLUMN IF NOT EXISTS nid_or_passport TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS details TEXT;

-- Alter public.blood_inventory with donor details snapshot & TTI screening
ALTER TABLE public.blood_inventory
  ADD COLUMN IF NOT EXISTS donor_name TEXT,
  ADD COLUMN IF NOT EXISTS donor_age INTEGER,
  ADD COLUMN IF NOT EXISTS donor_phone TEXT,
  ADD COLUMN IF NOT EXISTS sourcing_blood_bank TEXT DEFAULT 'Annesha Central Blood Bank (In-House)',
  ADD COLUMN IF NOT EXISTS donor_type TEXT DEFAULT 'voluntary',
  ADD COLUMN IF NOT EXISTS donor_details TEXT,
  ADD COLUMN IF NOT EXISTS tti_screening JSONB DEFAULT '{"hiv": "negative", "hbv": "negative", "hcv": "negative", "syphilis": "negative", "malaria": "negative"}'::jsonb;

-- Alter public.blood_transfusion_records with complete cross-match dossier & audit
ALTER TABLE public.blood_transfusion_records
  ADD COLUMN IF NOT EXISTS donor_name TEXT,
  ADD COLUMN IF NOT EXISTS donor_age INTEGER,
  ADD COLUMN IF NOT EXISTS donor_phone TEXT,
  ADD COLUMN IF NOT EXISTS donor_blood_group TEXT,
  ADD COLUMN IF NOT EXISTS sourcing_blood_bank TEXT,
  ADD COLUMN IF NOT EXISTS donor_type TEXT,
  ADD COLUMN IF NOT EXISTS major_crossmatch TEXT DEFAULT 'compatible',
  ADD COLUMN IF NOT EXISTS minor_crossmatch TEXT DEFAULT 'compatible',
  ADD COLUMN IF NOT EXISTS technologist_name TEXT;

-- -------------------------------------------------------------------------------------
-- 2. RECEPTION INVOICE & SERVICE EDIT HISTORY: IMMUTABLE ANTI-FRAUD AUDIT TRAIL
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoice_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  edited_by_user_id UUID NOT NULL,
  edited_by_name TEXT NOT NULL,
  edited_by_role TEXT NOT NULL,
  edit_reason TEXT NOT NULL,
  previous_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  new_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  previous_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  new_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  previous_grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  new_grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  previous_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  changes_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant lookup by invoice or organization
CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_inv ON public.invoice_edit_history (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_org ON public.invoice_edit_history (organization_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.invoice_edit_history ENABLE ROW LEVEL SECURITY;

-- SELECT: Permitted for authenticated staff of same organization
DROP POLICY IF EXISTS invoice_edit_history_select ON public.invoice_edit_history;
CREATE POLICY invoice_edit_history_select ON public.invoice_edit_history
  FOR SELECT
  TO authenticated, service_role
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- INSERT: Permitted for authenticated staff and system definers
DROP POLICY IF EXISTS invoice_edit_history_insert ON public.invoice_edit_history;
CREATE POLICY invoice_edit_history_insert ON public.invoice_edit_history
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- UPDATE: ABSOLUTE PROHIBITION (Audit records are immutable)
DROP POLICY IF EXISTS invoice_edit_history_no_update ON public.invoice_edit_history;
CREATE POLICY invoice_edit_history_no_update ON public.invoice_edit_history
  FOR UPDATE
  TO authenticated, service_role
  USING (false);

-- DELETE: ABSOLUTE PROHIBITION (Reception/cashier or any user cannot delete history)
DROP POLICY IF EXISTS invoice_edit_history_no_delete ON public.invoice_edit_history;
CREATE POLICY invoice_edit_history_no_delete ON public.invoice_edit_history
  FOR DELETE
  TO authenticated, service_role
  USING (false);

-- Grant privileges
GRANT SELECT, INSERT ON public.invoice_edit_history TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. HARDENED ATOMIC INVOICE UPDATE WITH AUTOMATIC IMMUTABLE EDIT HISTORY RECORDING
-- -------------------------------------------------------------------------------------

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

  -- Resolve editor profile & role
  SELECT full_name, email INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF FOUND THEN
    v_user_name := COALESCE(v_profile.full_name, v_profile.email, 'Hospital Staff');
  END IF;

  SELECT r.name INTO v_role_name
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = p_user_id AND ur.organization_id = p_org_id
  ORDER BY CASE WHEN r.name = 'super_admin' THEN 1 WHEN r.name = 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_role_name IS NULL THEN
    v_role_name := 'receptionist';
  END IF;

  -- Capture old invoice items for audit history
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
    COALESCE(v_inv.invoice_number, 'INV-' || p_invoice_id::text),
    p_user_id,
    v_user_name,
    v_role_name,
    COALESCE(p_discount_reason, 'Bill edited by authorized staff'),
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
    'invoice_number', v_inv.invoice_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. DYNAMIC RBAC: PERSIST & LOAD ROLE PERMISSIONS IN POSTGRESQL ATOMICALLY
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_role_permissions_atomic(
  p_org_id UUID,
  p_role_name TEXT,
  p_permission_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
  v_perm_key TEXT;
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
BEGIN
  -- Verify caller has super_admin or admin authorization
  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND ur.organization_id = p_org_id
        AND r.name IN ('super_admin', 'admin', 'hospital_administrator')
    ) INTO v_is_authorized;
  ELSE
    -- Service role or elevated caller
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only Administrator can save RBAC permissions.');
  END IF;

  -- Find or create role for this organization
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE organization_id = p_org_id AND name = p_role_name;

  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (organization_id, name, description, is_system, created_at)
    VALUES (p_org_id, p_role_name, 'Configured role: ' || p_role_name, false, now())
    RETURNING id INTO v_role_id;
  END IF;

  -- Ensure all permission keys exist in public.permissions catalog if catalog exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    FOREACH v_perm_key IN ARRAY p_permission_keys
    LOOP
      INSERT INTO public.permissions (key, module, description)
      VALUES (v_perm_key, split_part(v_perm_key, '.', 1), 'System permission ' || v_perm_key)
      ON CONFLICT (key) DO NOTHING;
    END LOOP;
  END IF;

  -- Atomically sync role_permissions
  DELETE FROM public.role_permissions WHERE role_id = v_role_id;

  IF array_length(p_permission_keys, 1) > 0 THEN
    FOREACH v_perm_key IN ARRAY p_permission_keys
    LOOP
      INSERT INTO public.role_permissions (role_id, permission_key)
      VALUES (v_role_id, v_perm_key)
      ON CONFLICT (role_id, permission_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'role_id', v_role_id,
    'role_name', p_role_name,
    'permissions_count', array_length(p_permission_keys, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) TO authenticated, service_role;

-- Function to retrieve entire role permission matrix for an organization
CREATE OR REPLACE FUNCTION public.get_organization_role_permissions_matrix(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_role RECORD;
  v_perms JSONB;
BEGIN
  FOR v_role IN 
    SELECT r.id, r.name 
    FROM public.roles r 
    WHERE r.organization_id = p_org_id
  LOOP
    SELECT COALESCE(jsonb_agg(rp.permission_key), '[]'::jsonb)
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id = v_role.id;

    v_result := jsonb_set(v_result, ARRAY[v_role.name], v_perms, true);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'matrix', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_role_permissions_matrix(UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. ATOMIC DIRECT REGISTRATION & CROSS-MATCH ISSUE OF BLOOD BAG
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_and_issue_blood_bag_atomic(
  p_org_id UUID,
  p_user_id UUID,
  p_bag_number TEXT,
  p_donor_name TEXT,
  p_donor_age INTEGER,
  p_donor_phone TEXT,
  p_donor_blood_group TEXT,
  p_donor_type TEXT,
  p_sourcing_blood_bank TEXT,
  p_donor_details TEXT,
  p_component_type TEXT,
  p_patient_id UUID,
  p_major_crossmatch TEXT,
  p_minor_crossmatch TEXT,
  p_technologist_verified BOOLEAN,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bag_id UUID;
  v_donor_id UUID;
  v_patient RECORD;
  v_expiry DATE;
  v_technologist_name TEXT := 'Technologist';
BEGIN
  IF p_major_crossmatch <> 'compatible' OR p_minor_crossmatch <> 'compatible' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-match is incompatible. Blood transfusion strictly prohibited.');
  END IF;

  IF NOT p_technologist_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technologist verification & clinical release signature is mandatory.');
  END IF;

  -- Verify patient
  SELECT id, full_name, patient_code INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Patient not found in this organization.');
  END IF;

  -- Resolve technologist name
  SELECT full_name INTO v_technologist_name
  FROM public.profiles
  WHERE id = p_user_id;

  -- Create donor record
  INSERT INTO public.blood_donors (
    organization_id,
    donor_code,
    full_name,
    age,
    blood_group,
    phone,
    donor_type,
    sourcing_blood_bank,
    details,
    last_donation_date,
    screening_status,
    created_at
  ) VALUES (
    p_org_id,
    'DNR-' || to_char(now(), 'YYMMDD') || '-' || substr(md5(random()::text), 1, 4),
    p_donor_name,
    p_donor_age,
    p_donor_blood_group,
    COALESCE(p_donor_phone, 'N/A'),
    COALESCE(p_donor_type, 'voluntary'),
    COALESCE(p_sourcing_blood_bank, 'Annesha Central Blood Bank (In-House)'),
    p_donor_details,
    CURRENT_DATE,
    'passed',
    now()
  )
  RETURNING id INTO v_donor_id;

  -- Expiry calculation
  IF p_component_type = 'platelets' THEN
    v_expiry := CURRENT_DATE + INTERVAL '5 days';
  ELSE
    v_expiry := CURRENT_DATE + INTERVAL '42 days';
  END IF;

  -- Insert blood inventory as 'issued'
  INSERT INTO public.blood_inventory (
    organization_id,
    bag_number,
    donor_id,
    donor_name,
    donor_age,
    donor_phone,
    sourcing_blood_bank,
    donor_type,
    donor_details,
    blood_group,
    component_type,
    collection_date,
    expiry_date,
    storage_location,
    status,
    created_at
  ) VALUES (
    p_org_id,
    p_bag_number,
    v_donor_id,
    p_donor_name,
    p_donor_age,
    p_donor_phone,
    COALESCE(p_sourcing_blood_bank, 'Annesha Central Blood Bank (In-House)'),
    COALESCE(p_donor_type, 'voluntary'),
    p_donor_details,
    p_donor_blood_group,
    p_component_type,
    CURRENT_DATE,
    v_expiry,
    'Cross-Match Issue Station',
    'issued',
    now()
  )
  RETURNING id INTO v_bag_id;

  -- Record transfusion
  INSERT INTO public.blood_transfusion_records (
    organization_id,
    bag_id,
    patient_id,
    donor_name,
    donor_age,
    donor_phone,
    donor_blood_group,
    sourcing_blood_bank,
    donor_type,
    crossmatch_result,
    major_crossmatch,
    minor_crossmatch,
    technologist_name,
    verified_by,
    transfusion_start_time,
    adverse_reaction_notes,
    created_at
  ) VALUES (
    p_org_id,
    v_bag_id,
    p_patient_id,
    p_donor_name,
    p_donor_age,
    p_donor_phone,
    p_donor_blood_group,
    COALESCE(p_sourcing_blood_bank, 'Annesha Central Blood Bank (In-House)'),
    COALESCE(p_donor_type, 'voluntary'),
    'compatible',
    p_major_crossmatch,
    p_minor_crossmatch,
    v_technologist_name,
    p_user_id,
    now(),
    p_notes,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', v_bag_id,
    'bag_number', p_bag_number,
    'donor_id', v_donor_id,
    'patient_id', p_patient_id,
    'status', 'issued'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_and_issue_blood_bag_atomic(
  UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TEXT
) TO authenticated, service_role;

COMMIT;
