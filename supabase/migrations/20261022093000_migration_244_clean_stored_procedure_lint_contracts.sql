-- =====================================================================================
-- MIGRATION 244: Clean Stored Procedure Schema & Call Signatures
-- Authority: Synthetic Engineering Swarm (APEX Godmode v5.0)
-- Purpose:
--   1. Add emergency_contact and guardian_name to public.patients for IPD updates.
--   2. Create public.referral_commission_claims compatibility table for admission purge.
--   3. Provide 7-argument post_journal_entry_atomic wrapper for expense GL posting.
-- =====================================================================================

-- 1. PATIENTS GUARDIAN & EMERGENCY CONTACT
ALTER TABLE IF EXISTS public.patients
    ADD COLUMN IF NOT EXISTS guardian_name TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- 2. REFERRAL COMMISSION CLAIMS COMPATIBILITY TABLE
CREATE TABLE IF NOT EXISTS public.referral_commission_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
    claim_number VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_commission_claims_visit 
    ON public.referral_commission_claims(visit_id);

-- 3. POST JOURNAL ENTRY 7-ARGUMENT CALL COMPATIBILITY
CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
    p_org_id UUID,
    p_entry_number VARCHAR,
    p_entry_date DATE,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_description TEXT,
    p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.post_journal_entry_atomic(
        p_org_id,
        p_entry_number,
        p_entry_date,
        p_reference_type,
        p_reference_id,
        p_description,
        p_lines,
        NULL::UUID
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon;
