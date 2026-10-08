-- ==============================================================================
-- OHMS Migration 120: Billing History Scoping & Financial Integrity
-- Date: 2026-10-08
-- Purpose:
--   * Strictly separate CURRENT EPISODE financial totals from LIFETIME patient totals
--     in get_episode_billing_preview.
--   * Prevents previous historical episodes' invoices from polluting current episode
--     settlement calculations.
--   * Grants explicit execute permissions to authenticated and service_role.
-- ==============================================================================

BEGIN;

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
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF p_episode_id IS NOT NULL THEN
        SELECT * INTO v_episode
        FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id;
    ELSE
        SELECT * INTO v_episode
        FROM public.patient_care_episodes
        WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'ACTIVE'
        ORDER BY started_at DESC
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

    -- Current Episode Invoiced vs Paid
    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0), COALESCE(SUM(i.due_amount), 0)
    INTO v_ep_invoiced, v_ep_paid, v_ep_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.episode_id = v_episode.id
      AND i.is_voided = FALSE;

    -- Lifetime Patient Invoiced vs Paid (across all historical episodes)
    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0), COALESCE(SUM(i.due_amount), 0)
    INTO v_life_invoiced, v_life_paid, v_life_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.is_voided = FALSE;

    WITH candidates AS (
        -- 1. Unbilled OPD Consultation
        SELECT
            pv.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'CONSULTATION'::TEXT AS category,
            'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
            COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0)::NUMERIC AS unit_price,
            1::NUMERIC AS quantity
        FROM public.patient_visits pv
        LEFT JOIN public.doctors d ON d.id = pv.doctor_id
        WHERE pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = v_episode.id
          AND pv.visit_type = 'OPD'
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = pv.id
          )

        UNION ALL

        -- 2. Unbilled IPD Bed or Cabin Stays
        SELECT
            ba.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END::TEXT AS category,
            CASE
                WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
                ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed')
            END AS item_name,
            COALESCE(ba.daily_charge, 0)::NUMERIC AS unit_price,
            public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity
        FROM public.bed_assignments ba
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.organization_id = p_org_id
          AND pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = v_episode.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = ba.id
          )

        UNION ALL

        -- 3. Unbilled Critical Care Stays (ICU / CCU / HDU)
        SELECT
            cca.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'MISC'::TEXT AS category,
            'Critical Care - ' || COALESCE(ccu.unit_name, ccu.unit_type, 'Unit') || ' (' || cca.bed_number || ')' AS item_name,
            COALESCE(ccu.daily_charge, 0)::NUMERIC AS unit_price,
            public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity
        FROM public.critical_care_admissions cca
        JOIN public.critical_care_units ccu ON ccu.id = cca.unit_id
        WHERE cca.organization_id = p_org_id
          AND cca.patient_id = p_patient_id
          AND cca.episode_id = v_episode.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = cca.id
          )

        UNION ALL

        -- 4. Additional Episode Service Charges (Medicines, Nursing, Tests, Procedures, etc.)
        SELECT
            esc.id AS source_id,
            esc.id AS charge_id,
            TRUE AS is_custom_charge,
            esc.service_category::TEXT AS category,
            esc.item_name AS item_name,
            esc.unit_price::NUMERIC AS unit_price,
            esc.quantity::NUMERIC AS quantity
        FROM public.episode_service_charges esc
        WHERE esc.organization_id = p_org_id
          AND esc.patient_id = p_patient_id
          AND esc.episode_id = v_episode.id
          AND esc.status = 'UNBILLED'
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = esc.id
          )
    ),
    priced AS (
        SELECT
            source_id,
            charge_id,
            is_custom_charge,
            category,
            item_name,
            unit_price,
            quantity,
            ROUND((unit_price * quantity)::NUMERIC, 2) AS total_price
        FROM candidates
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'reference_id', source_id,
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', total_price
        ) ORDER BY item_name), '[]'::JSONB),
        COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

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
        'current_episode_due', GREATEST(0, v_ep_due),
        'lifetime_invoiced', v_life_invoiced,
        'lifetime_paid', v_life_paid,
        'lifetime_due', GREATEST(0, v_life_due),
        'previous_invoiced', v_ep_invoiced,
        'previous_paid', v_ep_paid,
        'previous_due', GREATEST(0, v_ep_due)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMIT;
