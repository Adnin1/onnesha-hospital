# Onnesha Hospital Management System — Functional Regression Safeguards Matrix

This matrix documents operational regression safeguards designed to ensure previously reported complaints cannot recur.

---

## 🛡️ Functional Regression Matrix

| Operational Area | Previous Issue / Risk | Permanent Regression Safeguard | Test Implementation |
|---|---|---|---|
| **Auth Proxy** | Redirection loop due to hardcoded cookie check | SSR session verification via Supabase `@supabase/ssr` | `tests/auth/session-security.test.mjs` |
| **Doctor Roster** | Doctor schedule created but not driving booking | Server action `createDoctorScheduleAction` + status check | `tests/appointments.test.mjs` |
| **OPD Queue** | Consultation saved without changing token queue | Server-authoritative encounter status mutation | `tests/clinical.test.mjs` |
| **Pharmacy POS** | Negative stock allowed on sales | Strict FEFO batch stock check before insert | `tests/pharmacy.test.mjs` |
| **IPD Bed Matrix** | Double occupancy or orphaned bed on transfer | Atomic bed release and occupy transaction | `tests/integration/emergency-and-bed.test.mjs` |
| **Billing Engine** | Client-side total calculation drift | Server-authoritative subtotal, tax, due arithmetic | `tests/billing.test.mjs` |
| **Audit Log** | High-risk void/discount without audit reason | Mandatory audit log record for every void/discount | `tests/phase16-security-financial-clinical-audit.test.mjs` |
| **Test Engine** | Clock-skew `PGRST303` error bypassed via `assert.ok(true)` | Banned error bypass; real database errors fail tests | `tests/e2e/patient-opd-real.test.mjs` |
