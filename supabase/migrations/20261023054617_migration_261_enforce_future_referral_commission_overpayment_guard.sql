-- Migration 261: Enforce future referral commission overpayment guard.
-- Preserves historical anomalies for audit by adding the constraint NOT VALID,
-- while immediately enforcing it for all new and updated rows.
BEGIN;

ALTER TABLE public.referral_commissions
  ADD CONSTRAINT referral_commissions_amount_paid_not_over_commission_check
  CHECK (
    COALESCE(amount_paid, 0) <= COALESCE(commission_amount, 0) + 0.01
  ) NOT VALID;

COMMENT ON CONSTRAINT referral_commissions_amount_paid_not_over_commission_check
ON public.referral_commissions IS
'Migration 261: Enforces amount_paid <= commission_amount (+0.01 rounding tolerance) for all new/updated rows while preserving pre-existing historical anomalies until audited and reconciled. Constraint intentionally remains NOT VALID until legacy REF-10005 overpayment is resolved.';

COMMIT;
