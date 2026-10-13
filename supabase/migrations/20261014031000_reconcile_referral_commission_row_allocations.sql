-- =====================================================================================
-- MIGRATION 183: RECONCILE REFERRAL COMMISSION ROW-LEVEL PAID ALLOCATIONS
-- =====================================================================================
-- Corrects row-level allocation of the two ৳1,000 payouts (Total ৳2,000) for Seuliy Begum
-- so that each commission line item has amount_paid = 1000.00 (within ৳1,734 limit),
-- perfectly balancing with the two settlement disbursements (SETTLE-261012-5804 and SETTLE-20261013-4BCAF9).
-- =====================================================================================

DO $$
DECLARE
    v_patient_id UUID := '2b6cc01b-19b3-4dea-bb2a-3a1a208962cf'::UUID;
    v_agent_id UUID := '99165265-bbb0-41de-a604-df8d0af82450'::UUID;
    v_rec RECORD;
    v_remaining_payout NUMERIC(14,2) := 2000.00;
    v_alloc NUMERIC(14,2);
BEGIN
    FOR v_rec IN 
        SELECT id, commission_amount
        FROM public.referral_commissions
        WHERE patient_id = v_patient_id
          AND referral_agent_id = v_agent_id
        ORDER BY created_at ASC
    LOOP
        v_alloc := LEAST(v_remaining_payout, v_rec.commission_amount);
        
        UPDATE public.referral_commissions
        SET amount_paid = v_alloc,
            amount_pending = GREATEST(0.00, commission_amount - v_alloc),
            settlement_status = CASE 
                WHEN v_alloc >= commission_amount THEN 'PAID'
                WHEN v_alloc > 0 THEN 'PARTIAL'
                ELSE 'PENDING'
            END,
            paid_at = CASE WHEN v_alloc > 0 THEN '2026-10-13 18:32:48+00'::TIMESTAMPTZ ELSE NULL END,
            updated_at = NOW()
        WHERE id = v_rec.id;
        
        v_remaining_payout := GREATEST(0.00, v_remaining_payout - v_alloc);
    END LOOP;
END $$;
