-- Migration 073: Hardening business number sequences
-- Forward-only migration to replace client-side Date.now() identifiers
-- with server-authoritative database sequences.

-- Settlement number sequence
CREATE SEQUENCE IF NOT EXISTS public.doctor_settlement_seq START WITH 10001 INCREMENT BY 1;

-- Complaint number sequence
CREATE SEQUENCE IF NOT EXISTS public.complaint_number_seq START WITH 10001 INCREMENT BY 1;

-- Asset code sequence
CREATE SEQUENCE IF NOT EXISTS public.asset_code_seq START WITH 10001 INCREMENT BY 1;

-- Purchase requisition sequence
CREATE SEQUENCE IF NOT EXISTS public.purchase_requisition_seq START WITH 10001 INCREMENT BY 1;

-- GRN (goods received note) sequence
CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq START WITH 10001 INCREMENT BY 1;

-- Referral agent code sequence
CREATE SEQUENCE IF NOT EXISTS public.referral_agent_code_seq START WITH 10001 INCREMENT BY 1;

-- Journal voucher sequence
CREATE SEQUENCE IF NOT EXISTS public.journal_voucher_seq START WITH 10001 INCREMENT BY 1;

-- =========================================================
-- Generate functions — SECURITY DEFINER, search_path hardened
-- =========================================================

-- Doctor settlement number generator
CREATE OR REPLACE FUNCTION public.generate_settlement_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.doctor_settlement_seq'::regclass);
  RETURN 'SETTLE-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_settlement_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_settlement_number() TO authenticated, service_role;

-- Complaint number generator
CREATE OR REPLACE FUNCTION public.generate_complaint_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.complaint_number_seq'::regclass);
  RETURN 'CMP-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_complaint_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_complaint_number() TO authenticated, service_role;

-- Asset code generator
CREATE OR REPLACE FUNCTION public.generate_asset_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.asset_code_seq'::regclass);
  RETURN 'AST-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_asset_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_asset_code() TO authenticated, service_role;

-- Purchase requisition number generator
CREATE OR REPLACE FUNCTION public.generate_pr_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.purchase_requisition_seq'::regclass);
  RETURN 'PR-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_pr_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_pr_number() TO authenticated, service_role;

-- GRN number generator
CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.grn_number_seq'::regclass);
  RETURN 'GRN-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_grn_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_grn_number() TO authenticated, service_role;

-- Referral agent code generator
CREATE OR REPLACE FUNCTION public.generate_referral_agent_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.referral_agent_code_seq'::regclass);
  RETURN 'REF-' || LPAD(v_seq_num::TEXT, 4, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_referral_agent_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_referral_agent_code() TO authenticated, service_role;

-- Journal voucher number generator
CREATE OR REPLACE FUNCTION public.generate_journal_voucher_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := nextval('public.journal_voucher_seq'::regclass);
  RETURN 'JV-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_journal_voucher_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_journal_voucher_number() TO authenticated, service_role;

-- Set default column values where tables exist and columns allow it
DO $$
BEGIN
  -- doctor_fee_settlements.settlement_number
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='doctor_fee_settlements' AND column_name='settlement_number') THEN
    ALTER TABLE public.doctor_fee_settlements ALTER COLUMN settlement_number SET DEFAULT public.generate_settlement_number();
  END IF;

  -- patient_complaints.complaint_number
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_complaints' AND column_name='complaint_number') THEN
    ALTER TABLE public.patient_complaints ALTER COLUMN complaint_number SET DEFAULT public.generate_complaint_number();
  END IF;
END $$;
