-- ==============================================================================
-- OHMS Migration 125: Repair Episode Service Charges Columns & Billing Preview
--
-- Objective:
--   1. Add 'description' and 'is_billed' columns to public.episode_service_charges
--      with synchronization to 'item_name' and 'status'.
--   2. Note: 'total_price' is a GENERATED ALWAYS AS (quantity * unit_price) STORED
--      column in PostgreSQL, so we never manually update total_price.
--   3. Upgrade public.get_episode_billing_preview to read COALESCE(description, item_name)
--      and total_price safely without column missing errors.
-- ==============================================================================

-- 1. Ensure columns exist on public.episode_service_charges
ALTER TABLE public.episode_service_charges
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_billed BOOLEAN DEFAULT FALSE;

-- 2. Backfill existing records
UPDATE public.episode_service_charges
SET description = COALESCE(description, item_name, 'Service Charge'),
    is_billed = COALESCE(is_billed, (status = 'BILLED'), FALSE);

UPDATE public.episode_service_charges
SET item_name = COALESCE(item_name, description, 'Service Charge'),
    status = CASE WHEN is_billed = TRUE THEN 'BILLED' ELSE COALESCE(status, 'PENDING') END;

-- 3. Bi-directional Synchronization Trigger
CREATE OR REPLACE FUNCTION public.trg_sync_episode_service_charges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.description := COALESCE(NEW.description, NEW.item_name, 'Service Charge');
    NEW.item_name := COALESCE(NEW.item_name, NEW.description, 'Service Charge');
    IF NEW.is_billed IS NOT NULL THEN
        NEW.status := CASE WHEN NEW.is_billed THEN 'BILLED' ELSE COALESCE(NEW.status, 'PENDING') END;
    ELSIF NEW.status IS NOT NULL THEN
        NEW.is_billed := (NEW.status = 'BILLED');
    ELSE
        NEW.is_billed := FALSE;
        NEW.status := 'PENDING';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_episode_service_charges_trigger ON public.episode_service_charges;
CREATE TRIGGER trg_sync_episode_service_charges_trigger
BEFORE INSERT OR UPDATE ON public.episode_service_charges
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_episode_service_charges();

-- 4. Authoritative Upgrade of get_episode_billing_preview
CREATE OR REPLACE FUNCTION public.get_episode_billing_preview(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID DEFAULT NULL,
    p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_lines JSONB := '[]'::JSONB;
    v_total NUMERIC := 0;
    v_ep_invoiced NUMERIC := 0;
    v_ep_paid NUMERIC := 0;
    v_ep_due NUMERIC := 0;
    v_life_invoiced NUMERIC := 0;
    v_life_paid NUMERIC := 0;
    v_life_due NUMERIC := 0;
    v_rec RECORD;
    v_daily_rate NUMERIC;
    v_days NUMERIC;
    v_stay_subtotal NUMERIC;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF p_episode_id IS NOT NULL THEN
        SELECT id, episode_number, started_at AS start_time, ended_at AS end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id;
    ELSE
        SELECT id, episode_number, started_at AS start_time, ended_at AS end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_care_episodes
        WHERE patient_id = p_patient_id AND organization_id = p_org_id
        ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, started_at DESC
        LIMIT 1;
    END IF;

    IF v_episode.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'episode_id', NULL,
            'episode_number', NULL,
            'lines', '[]'::JSONB,
            'total', 0,
            'admission_discount_amount', 0,
            'admission_discount_reason', NULL,
            'referral_agent_id', NULL,
            'current_episode_invoiced', 0,
            'current_episode_paid', 0,
            'current_episode_due', 0,
            'lifetime_invoiced', 0,
            'lifetime_paid', 0,
            'lifetime_due', 0,
            'previous_invoiced', 0,
            'previous_paid', 0,
            'previous_due', 0
        );
    END IF;

    -- Bed / Stay Charges
    FOR v_rec IN (
        SELECT ba.id, ba.assigned_at, ba.vacated_at, ba.daily_charge,
               COALESCE(b.bed_number, c.cabin_number, 'Stay') AS resource_label
        FROM public.bed_assignments ba
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        WHERE pv.episode_id = v_episode.id AND ba.organization_id = p_org_id
    ) LOOP
        v_daily_rate := COALESCE(v_rec.daily_charge, 0);
        v_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_rec.vacated_at, p_as_of) - v_rec.assigned_at)) / 86400.0));
        v_stay_subtotal := v_daily_rate * v_days;
        v_lines := v_lines || jsonb_build_object(
            'category', 'BED_CHARGES',
            'description', 'Stay: ' || v_rec.resource_label || ' (' || v_days::TEXT || ' days)',
            'quantity', v_days,
            'unit_price', v_daily_rate,
            'subtotal', v_stay_subtotal
        );
        v_total := v_total + v_stay_subtotal;
    END LOOP;

    -- Additional Episode Service Charges (supports both description/subtotal and item_name/total_price)
    FOR v_rec IN (
        SELECT service_category,
               COALESCE(description, item_name, 'Service Charge') AS description,
               COALESCE(quantity, 1) AS quantity,
               COALESCE(unit_price, 0) AS unit_price,
               COALESCE(total_price, (COALESCE(quantity, 1) * COALESCE(unit_price, 0)), 0) AS subtotal
        FROM public.episode_service_charges
        WHERE episode_id = v_episode.id
          AND organization_id = p_org_id
          AND (COALESCE(is_billed, FALSE) = FALSE AND COALESCE(status, 'PENDING') != 'BILLED')
    ) LOOP
        v_lines := v_lines || jsonb_build_object(
            'category', v_rec.service_category,
            'description', v_rec.description,
            'quantity', v_rec.quantity,
            'unit_price', v_rec.unit_price,
            'subtotal', v_rec.subtotal
        );
        v_total := v_total + v_rec.subtotal;
    END LOOP;

    -- Financial Invariant Calculation
    SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(due_amount), 0)
    INTO v_ep_invoiced, v_ep_paid, v_ep_due
    FROM public.invoices
    WHERE episode_id = v_episode.id AND organization_id = p_org_id AND is_voided = FALSE;

    SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(due_amount), 0)
    INTO v_life_invoiced, v_life_paid, v_life_due
    FROM public.invoices
    WHERE patient_id = p_patient_id AND organization_id = p_org_id AND is_voided = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', v_episode.id,
        'episode_number', v_episode.episode_number,
        'lines', v_lines,
        'total', v_total,
        'admission_discount_amount', COALESCE(v_episode.admission_discount_amount, 0),
        'admission_discount_reason', v_episode.admission_discount_reason,
        'referral_agent_id', v_episode.referral_agent_id,
        'current_episode_invoiced', v_ep_invoiced,
        'current_episode_paid', v_ep_paid,
        'current_episode_due', v_ep_due,
        'lifetime_invoiced', v_life_invoiced,
        'lifetime_paid', v_life_paid,
        'lifetime_due', v_life_due,
        'previous_invoiced', GREATEST(0, v_life_invoiced - v_ep_invoiced),
        'previous_paid', GREATEST(0, v_life_paid - v_ep_paid),
        'previous_due', GREATEST(0, v_life_due - v_ep_due)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
