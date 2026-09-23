-- =====================================================================================
-- Migration 65: Integration Contract Reconciliation & Database Lint Zero-Gap Fixes
-- Timestamp: 2026-09-23 22:00:00 UTC
-- Purpose:
--   1. Fix public.book_online_appointment:
--      - Replace nonexistent relation public.doctor_leave_dates with public.doctor_leaves
--        using start_date and end_date interval check.
--      - Fix get_next_token signature to 3 arguments (p_org_id, p_doctor_id, p_appointment_date).
--   2. Fix public.get_public_doctors_directory:
--      - Eliminate non-existent columns (bmdc_reg_number, followup_fee, bio, experience_years)
--        from public_doctors_view projection following migration 64 minimal projection.
--   3. Fix public.post_supplier_invoice_to_gl_atomic:
--      - Eliminate references to non-existent column "status", "journal_entry_id", and "updated_at" on public.supplier_invoices.
--      - Use journal_entries idempotency check and match_status = 'MATCHED' for past invoice consumption.
--   4. Fix public.post_payment_receipt_to_gl_atomic:
--      - Eliminate references to non-existent column "status" on public.payments.
--      - Check duplicate posting via journal_entries table.
--   5. Fix public.void_invoice_and_reverse_gl_atomic:
--      - Eliminate reference to non-existent column "status" on public.payments.
--   6. Retain and reconcile both get_public_live_queue overloads:
--      - 1-arg: public.get_public_live_queue(p_org_id UUID) using valid column a.token_number
--      - 3-arg: public.get_public_live_queue(p_org_id UUID, p_doctor_id UUID, p_date DATE DEFAULT NULL)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Fix book_online_appointment (doctor_leaves interval check & get_next_token 3-args)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id            UUID,
    p_doctor_id         UUID,
    p_schedule_id       UUID,
    p_appointment_date  DATE,
    p_patient_name      TEXT,
    p_patient_phone     TEXT,
    p_patient_age       INT DEFAULT NULL,
    p_patient_gender    TEXT DEFAULT 'OTHER',
    p_patient_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id        UUID;
    v_patient_code      VARCHAR;
    v_token             INT;
    v_department_id     UUID;
    v_appointment_id    UUID;
    v_clean_phone       VARCHAR;
    v_raw_phone         VARCHAR;
    v_trimmed_name      VARCHAR;
    v_gender_upper      VARCHAR;
    v_doctor_active     BOOLEAN;
    v_doctor_public     BOOLEAN;
    v_room_number       VARCHAR;
    v_doctor_name       VARCHAR;
    v_opd_fee           NUMERIC(10, 2);
    v_is_leave          BOOLEAN;
    v_capacity          INT;
    v_booked_count      INT;
    v_day_name          VARCHAR;
    v_schedule_day      VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id   UUID;
    v_schedule_active   BOOLEAN;
    v_org_active        BOOLEAN;
    v_org_canonical     BOOLEAN;
    v_today_dhaka       DATE;
BEGIN
    -- ── Validation 1: Patient Name ──────────────────────────────
    v_trimmed_name := TRIM(COALESCE(p_patient_name, ''));
    IF length(v_trimmed_name) < 2 OR length(v_trimmed_name) > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient name must be between 2 and 120 characters.'
        );
    END IF;

    -- ── Validation 2: Phone — STRICT FORMAT BEFORE STRIP ───────
    v_raw_phone := TRIM(COALESCE(p_patient_phone, ''));
    IF v_raw_phone !~ '^(01[3-9][0-9]{8}|8801[3-9][0-9]{8}|\+8801[3-9][0-9]{8})$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid phone format. Accepted formats: 01XXXXXXXXX, 8801XXXXXXXXX, or +8801XXXXXXXXX (Bangladeshi mobile only).'
        );
    END IF;
    -- Normalize to 11-digit local format
    v_clean_phone := CASE
        WHEN v_raw_phone LIKE '+880%' THEN substring(v_raw_phone FROM 4)
        WHEN v_raw_phone LIKE '880%'  THEN substring(v_raw_phone FROM 4)
        ELSE v_raw_phone
    END;
    -- Final regex guard
    IF v_clean_phone !~ '^01[3-9][0-9]{8}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid Bangladeshi mobile number after normalization. Must be 01XXXXXXXXX (operator 013-019).'
        );
    END IF;

    -- ── Validation 3: Patient Age ───────────────────────────────
    IF p_patient_age IS NOT NULL AND (p_patient_age < 0 OR p_patient_age > 125) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient age must be between 0 and 125 years.'
        );
    END IF;

    -- ── Validation 4: Gender ────────────────────────────────────
    v_gender_upper := UPPER(TRIM(COALESCE(p_patient_gender, 'OTHER')));
    IF v_gender_upper NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid gender specified. Must be MALE, FEMALE, or OTHER.'
        );
    END IF;

    -- ── Validation 5: Notes length ──────────────────────────────
    IF p_patient_notes IS NOT NULL AND length(p_patient_notes) > 500 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient notes must not exceed 500 characters.'
        );
    END IF;

    -- ── Gate 0: Canonical organization boundary ─────────────────
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or inactive hospital organization.'
        );
    END IF;
    IF v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Organization is not authorized for public online booking.'
        );
    END IF;

    -- ── Gate 1: Schedule must be provided ──────────────────────
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Mandatory slot selection: p_schedule_id must be provided.'
        );
    END IF;

    -- ── Gate 2: Past-date check in Asia/Dhaka ──────────────────
    v_today_dhaka := (timezone('Asia/Dhaka', NOW()))::DATE;
    IF p_appointment_date < v_today_dhaka THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot book appointments for past dates.'
        );
    END IF;

    -- ── Concurrency Lock: doctor + date scope ──────────────────
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_appointment_date::text)
    );

    -- ── Gate 3: Doctor active, public, and profile ─────────────
    SELECT is_active, is_public, room_number, full_name, opd_fee
    INTO v_doctor_active, v_doctor_public, v_room_number, v_doctor_name, v_opd_fee
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor is not currently available for public online booking.'
        );
    END IF;

    -- ── Gate 4: Schedule ownership and status ──────────────────
    SELECT doctor_id, organization_id, max_tokens, is_active,
           UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity,
         v_schedule_active, v_schedule_day
    FROM public.doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot not found.'
        );
    END IF;
    IF v_schedule_doctor_id <> p_doctor_id OR v_schedule_org_id <> p_org_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot does not belong to the specified doctor or organization.'
        );
    END IF;
    IF v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot is not currently active.'
        );
    END IF;

    -- ── Gate 5: Day-of-week match ───────────────────────────────
    v_day_name := UPPER(TO_CHAR(p_appointment_date, 'FMDay'));
    IF v_day_name <> v_schedule_day THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Appointment date does not match schedule day of week.'
        );
    END IF;

    -- ── Gate 6: Leave check (Accurate table: public.doctor_leaves) ───
    SELECT EXISTS (
        SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor has a leave scheduled for the requested date.'
        );
    END IF;

    -- ── Gate 7: Capacity check ──────────────────────────────────
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id
      AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Selected doctor schedule capacity has been reached for this date.'
        );
    END IF;

    -- ── Gate 8: Department resolution with TENANT BOUNDARY ─────
    SELECT dd.department_id INTO v_department_id
    FROM public.doctor_departments dd
    JOIN public.departments d
        ON dd.department_id = d.id
        AND d.is_active = TRUE
        AND d.organization_id = p_org_id
    WHERE dd.doctor_id = p_doctor_id
    ORDER BY dd.is_primary DESC NULLS LAST
    LIMIT 1;

    IF v_department_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor department mapping is unavailable or inactive within this organization.'
        );
    END IF;

    -- ── Gate 9: Race-safe patient upsert ───────────────────────
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients
    WHERE organization_id = p_org_id
      AND normalized_phone = v_clean_phone
      AND is_deleted = FALSE
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        INSERT INTO public.patients (
            organization_id,
            full_name,
            gender,
            age,
            phone,
            normalized_phone,
            is_temporary
        ) VALUES (
            p_org_id,
            v_trimmed_name,
            v_gender_upper,
            p_patient_age,
            v_clean_phone,
            v_clean_phone,
            TRUE
        )
        ON CONFLICT (organization_id, normalized_phone)
        WHERE normalized_phone IS NOT NULL AND is_deleted = FALSE
        DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id, patient_code INTO v_patient_id, v_patient_code;
    END IF;

    -- ── Token counter (advisory-locked, race-safe 3-argument call) ──
    SELECT public.get_next_token(p_org_id, p_doctor_id, p_appointment_date)
    INTO v_token;

    -- ── Insert appointment ──────────────────────────────────────
    INSERT INTO public.appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        schedule_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        patient_notes
    ) VALUES (
        p_org_id,
        v_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        'ONLINE',
        'WAITING',
        'PENDING',
        NULLIF(TRIM(COALESCE(p_patient_notes, '')), '')
    )
    RETURNING id INTO v_appointment_id;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'token_number',   v_token,
        'patient_code',   v_patient_code,
        'doctor_name',    v_doctor_name,
        'room_number',    v_room_number,
        'opd_fee',        v_opd_fee
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   'Booking failed due to an internal error. Please try again.'
    );
END;
$$;

COMMENT ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT) IS
  'Hardened public booking RPC. Accurately verifies leaves against public.doctor_leaves, enforces Asia/Dhaka local date, checks department tenant-boundary, and allocates tokens via 3-parameter get_next_token.';

REVOKE ALL ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 2. Fix get_public_doctors_directory (Reconciled with Migration 64 minimal view)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_doctors_directory(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
    v_is_valid_org BOOLEAN;
BEGIN
    -- Validate that requested organization is an active canonical public organization
    SELECT EXISTS (
        SELECT 1 FROM public.organizations 
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_is_valid_org;

    IF NOT v_is_valid_org THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', v.id,
                'full_name', v.full_name,
                'degrees', v.degrees,
                'designation', v.designation,
                'specialization', v.specialization,
                'room_number', v.room_number,
                'opd_fee', v.opd_fee,
                'avatar_url', v.avatar_url,
                'public_bio', v.public_bio,
                'department_id', v.department_id,
                'department_name', COALESCE(v.department_name, 'General OPD'),
                'department_slug', COALESCE(v.department_slug, 'general-opd'),
                'schedules', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', s.id,
                                'day_of_week', s.day_of_week,
                                'start_time', s.start_time::text,
                                'end_time', s.end_time::text,
                                'is_active', s.is_active
                            )
                        )
                        FROM public.doctor_schedules s
                        WHERE s.doctor_id = v.id AND s.is_active = true
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY v.full_name ASC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM public.public_doctors_view v;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_doctors_directory(UUID) IS
  'Authoritative public doctor directory RPC returning sanitized consultant data projecting only minimal public view fields.';

REVOKE ALL ON FUNCTION public.get_public_doctors_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctors_directory(UUID) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 3. Fix post_supplier_invoice_to_gl_atomic (Eliminate invalid status and updated_at column references)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_supplier_invoice_to_gl_atomic(
    p_org_id UUID,
    p_supplier_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_sinv RECORD;
    v_grn RECORD;
    v_po RECORD;
    v_inv_acc_id UUID;
    v_ap_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(60);
    v_res JSONB;
    v_item RECORD;
    v_poi RECORD;
    v_gri RECORD;
    v_items_count INT := 0;
    v_calculated_subtotal NUMERIC(14, 2) := 0.00;
    v_already_invoiced_qty INT := 0;
    v_already_invoiced_grn_qty INT := 0;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Concurrency Lock: Lock supplier invoice row to eliminate race conditions
    SELECT * INTO v_sinv FROM public.supplier_invoices
    WHERE id = p_supplier_invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_sinv.id IS NULL THEN
        RAISE EXCEPTION 'Supplier invoice % not found in organization %', p_supplier_invoice_id, p_org_id
            USING ERRCODE = '22023';
    END IF;

    -- Idempotency Guard: Prevent duplicate GL postings via authoritative journal_entries table
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'SUPPLIER_INVOICE' AND reference_id = p_supplier_invoice_id
    ) THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number
            USING ERRCODE = '22023';
    END IF;

    -- Header Mathematical Reconciliation Invariant: subtotal + tax_amount == total_amount
    IF ABS((v_sinv.subtotal + v_sinv.tax_amount) - v_sinv.total_amount) > 0.05 THEN
        UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY' WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION 'Supplier invoice % header calculation discrepancy: subtotal (%) + tax (%) != total (%)',
            v_sinv.supplier_invoice_number, v_sinv.subtotal, v_sinv.tax_amount, v_sinv.total_amount USING ERRCODE = '22023';
    END IF;

    -- Mandatory Component 1: Verified Goods Receipt Note (GRN)
    IF v_sinv.grn_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without a verified Goods Receipt Note (GRN)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_grn FROM public.goods_receipt_notes
    WHERE id = v_sinv.grn_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_grn.id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % does not exist in organization', v_sinv.grn_id
            USING ERRCODE = '22023';
    END IF;

    IF v_grn.status NOT IN ('RECEIVED', 'VERIFIED') THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % is in status %, must be RECEIVED or VERIFIED',
            v_grn.grn_number, v_grn.status USING ERRCODE = '22023';
    END IF;

    -- Mandatory Component 2: Verified Purchase Order (PO)
    IF v_sinv.purchase_order_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without an authoritative Purchase Order (PO)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_po FROM public.purchase_orders
    WHERE id = v_sinv.purchase_order_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_po.id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Linked Purchase Order % does not exist in organization', v_sinv.purchase_order_id
            USING ERRCODE = '22023';
    END IF;

    IF v_po.supplier_id != v_sinv.supplier_id THEN
        RAISE EXCEPTION '3-Way Match Error: Purchase Order supplier does not match Supplier Invoice supplier'
            USING ERRCODE = '22023';
    END IF;

    IF v_grn.purchase_order_id IS NULL OR v_grn.purchase_order_id != v_sinv.purchase_order_id THEN
        RAISE EXCEPTION '3-Way Match Error: GRN PO (%) does not match Supplier Invoice PO (%)',
            v_grn.purchase_order_id, v_sinv.purchase_order_id
            USING ERRCODE = '22023';
    END IF;

    -- Lock all PO lines and GRN lines to prevent concurrent consumption races
    PERFORM 1 FROM public.purchase_order_items
    WHERE purchase_order_id = v_sinv.purchase_order_id
    FOR UPDATE;

    PERFORM 1 FROM public.goods_receipt_items
    WHERE grn_id = v_sinv.grn_id
    FOR UPDATE;

    -- Mandatory Component 3: STRICT Line-Level Invariant
    SELECT COUNT(*) INTO v_items_count
    FROM public.supplier_invoice_items
    WHERE supplier_invoice_id = p_supplier_invoice_id;

    IF v_items_count = 0 THEN
        UPDATE public.supplier_invoices SET match_status = 'UNMATCHED' WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION '3-Way Match Strict Invariant Error: Supplier invoice % has 0 line items. True 3-way match strictly forbids header-only aggregate posting.',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    -- Iterate through each invoice line item and perform strict multi-document verification
    FOR v_item IN
        SELECT * FROM public.supplier_invoice_items
        WHERE supplier_invoice_id = p_supplier_invoice_id
        ORDER BY id ASC
    LOOP
        -- Line Extension Math Verification: quantity * unit_price == line_total
        IF ABS((v_item.quantity_invoiced * v_item.unit_price) - v_item.line_total) > 0.05 THEN
            UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Invoice line % calculation discrepancy (qty % * price % != line_total %)',
                v_item.id, v_item.quantity_invoiced, v_item.unit_price, v_item.line_total USING ERRCODE = '22023';
        END IF;

        v_calculated_subtotal := v_calculated_subtotal + v_item.line_total;

        -- 1. PO Line Item Verification
        SELECT * INTO v_poi FROM public.purchase_order_items
        WHERE id = v_item.po_item_id AND purchase_order_id = v_sinv.purchase_order_id;

        IF v_poi.id IS NULL THEN
            UPDATE public.supplier_invoices SET match_status = 'UNMATCHED' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: PO line item % does not exist in linked PO %',
                v_item.po_item_id, v_sinv.purchase_order_id USING ERRCODE = '22023';
        END IF;

        -- Medicine / Item match
        IF v_item.medicine_id IS NOT NULL AND v_poi.medicine_id IS NOT NULL AND v_item.medicine_id != v_poi.medicine_id THEN
            UPDATE public.supplier_invoices SET match_status = 'UNMATCHED' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Invoice line medicine % does not match PO line medicine %',
                v_item.medicine_id, v_poi.medicine_id USING ERRCODE = '22023';
        END IF;

        -- Unit Price Match Tolerance (0.05 BDT)
        IF ABS(v_item.unit_price - v_poi.unit_cost) > 0.05 THEN
            UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Invoiced unit price (%) does not match PO agreed unit cost (%) on PO line %',
                v_item.unit_price, v_poi.unit_cost, v_poi.id USING ERRCODE = '22023';
        END IF;

        -- Cumulative PO Quantity Consumption Check across all previously matched/posted invoices
        SELECT COALESCE(SUM(sii_past.quantity_invoiced), 0)
        INTO v_already_invoiced_qty
        FROM public.supplier_invoice_items sii_past
        JOIN public.supplier_invoices si_past ON sii_past.supplier_invoice_id = si_past.id
        WHERE sii_past.po_item_id = v_item.po_item_id
          AND si_past.organization_id = p_org_id
          AND si_past.id != p_supplier_invoice_id
          AND si_past.match_status = 'MATCHED';

        IF (v_already_invoiced_qty + v_item.quantity_invoiced) > v_poi.quantity_ordered THEN
            UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds PO ordered quantity (%) for PO line %',
                v_already_invoiced_qty, v_item.quantity_invoiced, (v_already_invoiced_qty + v_item.quantity_invoiced),
                v_poi.quantity_ordered, v_poi.id USING ERRCODE = '22023';
        END IF;

        IF (v_already_invoiced_qty + v_item.quantity_invoiced) > v_poi.quantity_received THEN
            UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY' WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds PO received quantity (%) for PO line %',
                v_already_invoiced_qty, v_item.quantity_invoiced, (v_already_invoiced_qty + v_item.quantity_invoiced),
                v_poi.quantity_received, v_poi.id USING ERRCODE = '22023';
        END IF;

        -- 2. GRN Line Verification (if explicitly linked to GRN item)
        IF v_item.grn_item_id IS NOT NULL THEN
            SELECT * INTO v_gri FROM public.goods_receipt_items
            WHERE id = v_item.grn_item_id AND grn_id = v_sinv.grn_id;

            IF v_gri.id IS NULL THEN
                UPDATE public.supplier_invoices SET match_status = 'UNMATCHED' WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: GRN item % does not exist on linked GRN %',
                    v_item.grn_item_id, v_sinv.grn_id USING ERRCODE = '22023';
            END IF;

            -- Cumulative GRN Quantity Consumption Check
            SELECT COALESCE(SUM(sii_past.quantity_invoiced), 0)
            INTO v_already_invoiced_grn_qty
            FROM public.supplier_invoice_items sii_past
            JOIN public.supplier_invoices si_past ON sii_past.supplier_invoice_id = si_past.id
            WHERE sii_past.grn_item_id = v_item.grn_item_id
              AND si_past.organization_id = p_org_id
              AND si_past.id != p_supplier_invoice_id
              AND si_past.match_status = 'MATCHED';

            IF (v_already_invoiced_grn_qty + v_item.quantity_invoiced) > v_gri.quantity_received THEN
                UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY' WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds GRN received quantity (%) on GRN line %',
                    v_already_invoiced_grn_qty, v_item.quantity_invoiced, (v_already_invoiced_grn_qty + v_item.quantity_invoiced),
                    v_gri.quantity_received, v_gri.id USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    -- Check total line subtotal against header subtotal
    IF ABS(v_calculated_subtotal - v_sinv.subtotal) > 0.05 THEN
        UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY' WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION '3-Way Match Error: Sum of invoice lines (%) does not match invoice subtotal (%)',
            v_calculated_subtotal, v_sinv.subtotal USING ERRCODE = '22023';
    END IF;

    -- Seed COA if needed
    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    IF v_inv_acc_id IS NULL OR v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'Required Accounts (1200 Inventory, 2010 Accounts Payable) not configured for organization %', p_org_id;
    END IF;

    v_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_inv_acc_id,
            'debit', v_sinv.total_amount,
            'credit', 0.00,
            'description', 'Inventory received via strict 3-way match under invoice ' || v_sinv.supplier_invoice_number || ' (GRN: ' || v_grn.grn_number || ')'
        ),
        jsonb_build_object(
            'account_id', v_ap_acc_id,
            'debit', 0.00,
            'credit', v_sinv.total_amount,
            'description', 'Accounts Payable to supplier under invoice ' || v_sinv.supplier_invoice_number
        )
    );

    v_je_number := 'JE-SINV-' || v_sinv.supplier_invoice_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        v_sinv.invoice_date,
        'SUPPLIER_INVOICE',
        p_supplier_invoice_id,
        'Strict 3-Way Matched Supplier Invoice ' || v_sinv.supplier_invoice_number || ' (PO: ' || COALESCE(v_po.po_number, 'N/A') || ', GRN: ' || v_grn.grn_number || ')',
        v_lines,
        auth.uid()
    );

    UPDATE public.supplier_invoices
    SET match_status = 'MATCHED'
    WHERE id = p_supplier_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'supplier_invoice_id', p_supplier_invoice_id,
        'match_status', 'MATCHED',
        'journal_entry', v_res
    );
END;
$$;

COMMENT ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) IS
  'Posts verified 3-way matched supplier invoice to General Ledger. Reconciled with table schema (uses journal_entries for idempotency check).';

REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 4. Fix post_payment_receipt_to_gl_atomic (Eliminate invalid status column reference)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_payment_receipt_to_gl_atomic(
    p_org_id UUID,
    p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_pmt RECORD;
    v_inv RECORD;
    v_cash_acc_id UUID;
    v_ar_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(60);
    v_res JSONB;
    v_cumulative_paid NUMERIC(14, 2) := 0.00;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Concurrency Lock: Lock payment row
    SELECT * INTO v_pmt FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_pmt.id IS NULL THEN
        RAISE EXCEPTION 'Payment % not found in organization %', p_payment_id, p_org_id
            USING ERRCODE = '22023';
    END IF;

    -- Positive amount invariant
    IF v_pmt.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be strictly positive (> 0), got %', v_pmt.amount
            USING ERRCODE = '22023';
    END IF;

    -- Idempotency Guard: Prevent duplicate GL posting
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'PAYMENT' AND reference_id = p_payment_id
    ) THEN
        RAISE EXCEPTION 'Payment receipt % is already posted to General Ledger', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory Linked Invoice Verification with Row-Level Lock
    IF v_pmt.invoice_id IS NULL THEN
        RAISE EXCEPTION 'Payment receipt % cannot be posted without a linked Invoice', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = v_pmt.invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Linked invoice % not found in organization % for payment %',
            v_pmt.invoice_id, p_org_id, v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    -- Invoice Void/Cancellation Guard
    IF UPPER(v_inv.status) = 'VOID' OR v_inv.is_voided = TRUE THEN
        RAISE EXCEPTION 'Cannot post payment against voided invoice %', v_inv.invoice_number
            USING ERRCODE = '22023';
    END IF;

    -- Cumulative Overpayment Guard: Check all prior payments against invoice total
    SELECT COALESCE(SUM(amount), 0.00) INTO v_cumulative_paid
    FROM public.payments
    WHERE invoice_id = v_pmt.invoice_id
      AND organization_id = p_org_id
      AND id != p_payment_id;

    IF (v_cumulative_paid + v_pmt.amount) > (v_inv.grand_total + 0.05) THEN
        RAISE EXCEPTION 'Cumulative payments (%) exceed invoice total amount (%) for invoice %',
            (v_cumulative_paid + v_pmt.amount), v_inv.grand_total, v_inv.invoice_number
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    -- Account mapping: Bank (1020) for digital/bank, Cash in Hand (1010) otherwise
    IF UPPER(v_pmt.payment_method) IN ('BKASH', 'NAGAD', 'CARD', 'BANK', 'ONLINE') THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    END IF;

    SELECT id INTO v_ar_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1100';

    IF v_cash_acc_id IS NULL OR v_ar_acc_id IS NULL THEN
        RAISE EXCEPTION 'Required GL Accounts (1010/1020 and 1100) not configured for organization %', p_org_id;
    END IF;

    -- Lines: DR Cash/Bank (1010/1020), CR Accounts Receivable (1100)
    v_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', v_pmt.amount,
            'credit', 0.00,
            'description', 'Payment collected on receipt ' || v_pmt.receipt_number || ' (' || v_pmt.payment_method || ')'
        ),
        jsonb_build_object(
            'account_id', v_ar_acc_id,
            'debit', 0.00,
            'credit', v_pmt.amount,
            'description', 'AR liquidation for invoice ' || v_inv.invoice_number
        )
    );

    v_je_number := 'JE-RCPT-' || v_pmt.receipt_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PAYMENT',
        p_payment_id,
        'Cashier settlement receipt ' || v_pmt.receipt_number || ' against invoice ' || v_inv.invoice_number,
        v_lines,
        auth.uid()
    );

    -- Update invoice paid and due amount atomically
    UPDATE public.invoices
    SET paid_amount = (v_cumulative_paid + v_pmt.amount),
        due_amount = GREATEST(0.00, grand_total - (v_cumulative_paid + v_pmt.amount)),
        status = CASE
            WHEN (v_cumulative_paid + v_pmt.amount) >= (grand_total - 0.05) THEN 'PAID'
            ELSE 'PARTIAL'
        END,
        updated_at = NOW()
    WHERE id = v_pmt.invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'receipt_number', v_pmt.receipt_number,
        'cumulative_paid', (v_cumulative_paid + v_pmt.amount),
        'journal_entry', v_res
    );
END;
$$;

COMMENT ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) IS
  'Posts payment receipt to General Ledger and reconciles invoice balances atomically.';

REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 5. Fix void_invoice_and_reverse_gl_atomic (Eliminate invalid status column reference)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_inv RECORD;
    v_je RECORD;
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_rev_result JSONB := NULL;
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Authorization check (Super Admin, Admin, Accountant, Finance Manager)
    IF v_calling_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RAISE EXCEPTION 'Access denied: Caller lacks authorized supervisory role to void invoices' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Void reason is required for clinical and financial audit compliance' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found in organization %', p_invoice_id, p_org_id USING ERRCODE = '22023';
    END IF;

    IF v_inv.status = 'VOID' OR v_inv.is_voided = TRUE THEN
        RAISE EXCEPTION 'Invoice % is already voided', v_inv.invoice_number USING ERRCODE = '22023';
    END IF;

    -- Active Payments Guard: Cannot void an invoice that has active settled payment receipts
    IF EXISTS (
        SELECT 1 FROM public.payments
        WHERE invoice_id = p_invoice_id
          AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'Cannot void invoice % with active payment receipts. Payments must be voided or refunded first to preserve General Ledger equilibrium',
            v_inv.invoice_number USING ERRCODE = '22023';
    END IF;

    -- Mark invoice as void
    UPDATE public.invoices
    SET is_voided = TRUE,
        status = 'VOID',
        void_reason = p_reason,
        voided_by = v_calling_user_id,
        due_amount = 0.00,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- If a posted journal entry exists for this invoice, reverse it atomically
    SELECT * INTO v_je FROM public.journal_entries
    WHERE organization_id = p_org_id AND reference_type = 'INVOICE' AND reference_id = p_invoice_id AND status = 'POSTED';

    IF v_je.id IS NOT NULL THEN
        v_rev_result := public.reverse_journal_entry_atomic(
            p_org_id,
            v_je.id,
            'Automated reversal due to invoice void: ' || p_reason,
            CURRENT_DATE
        );
    END IF;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'VOID', 'BILLING', 'invoices', p_invoice_id::text,
        jsonb_build_object(
            'invoice_number', v_inv.invoice_number,
            'void_reason', p_reason,
            'gl_reversal', v_rev_result
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'invoice_number', v_inv.invoice_number,
        'is_voided', true,
        'gl_reversal', v_rev_result
    );
END;
$$;

COMMENT ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) IS
  'Voids an invoice and automatically reverses its associated General Ledger journal entry.';

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 6. Ensure Both get_public_live_queue Overloads Exist Cleanly
-- -------------------------------------------------------------------------------------
-- Overload 1: Hospital-wide live queue (1 argument)
CREATE OR REPLACE FUNCTION public.get_public_live_queue(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_org_exists BOOLEAN;
    v_result JSONB;
BEGIN
    -- Verify organization validity and active status
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive hospital organization.', 'queue', '[]'::jsonb);
    END IF;

    -- Compute current Dhaka date
    v_today := (timezone('Asia/Dhaka', NOW()))::DATE;

    -- Build public-safe queue projection: Zero patient names, phone numbers, or patient IDs returned
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'doctor_name', q.doctor_name,
                'room_number', q.room_number,
                'token_number', '#' || q.token_num::text,
                'status', q.status_label,
                'called_at', q.formatted_time
            ) ORDER BY q.token_num ASC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM (
        SELECT 
            a.id,
            d.full_name AS doctor_name,
            COALESCE(d.room_number, '') AS room_number,
            a.token_number AS token_num,
            CASE 
                WHEN a.status IN ('IN_CONSULTATION', 'IN_CHAMBER') THEN 'serving'
                WHEN a.status = 'CONFIRMED' THEN 'calling'
                WHEN a.status = 'COMPLETED' THEN 'done'
                ELSE 'waiting'
            END AS status_label,
            TO_CHAR(timezone('Asia/Dhaka', a.created_at), 'HH12:MI AM') AS formatted_time
        FROM public.appointments a
        JOIN public.doctors d ON d.id = a.doctor_id
        WHERE a.organization_id = p_org_id
          AND a.appointment_date = v_today
          AND a.status IN ('WAITING', 'SCHEDULED', 'CONFIRMED', 'IN_CONSULTATION', 'IN_CHAMBER', 'COMPLETED')
          AND a.token_number IS NOT NULL
        ORDER BY a.token_number ASC
        LIMIT 50
    ) q;

    RETURN jsonb_build_object('success', true, 'queue', v_result);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to retrieve public queue projection.', 'queue', '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_public_live_queue(UUID) IS
  'Hospital-wide public waiting queue projection (1 argument) with zero PII exposure.';

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;


-- Overload 2: Doctor-specific live queue (3 arguments)
CREATE OR REPLACE FUNCTION public.get_public_live_queue(
    p_org_id UUID,
    p_doctor_id UUID,
    p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_org_active BOOLEAN;
    v_org_canonical BOOLEAN;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_result JSONB;
BEGIN
    -- Dhaka-local today
    v_today := COALESCE(p_date, (timezone('Asia/Dhaka', NOW()))::DATE);

    -- Canonical org gate
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE OR v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or unauthorized hospital organization.'
        );
    END IF;

    -- Doctor gate
    SELECT is_active, is_public
    INTO v_doctor_active, v_doctor_public
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Doctor is not available for public queue view.'
        );
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'date', v_today,
        'queue', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'token',      q.token_number,
                    'status',     q.status,
                    'booked_at',  TO_CHAR(timezone('Asia/Dhaka', q.created_at), 'HH12:MI AM')
                )
                ORDER BY q.token_number
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM public.appointments q
    WHERE q.organization_id = p_org_id
      AND q.doctor_id       = p_doctor_id
      AND q.appointment_date = v_today
      AND q.status NOT IN ('CANCELLED', 'NO_SHOW');

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) IS
  'Returns today''s active appointment queue for a specific public doctor with booked_at in Asia/Dhaka.';

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) TO anon, authenticated, service_role;
