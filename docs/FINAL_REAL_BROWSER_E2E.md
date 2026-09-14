# Onnesha Hospital Management System — Real Browser E2E Specification & Results

This document defines the strict taxonomy and execution report for Playwright-driven Real Browser End-to-End (E2E) automated tests.

---

## 🛑 Zero False-Pass Testing Taxonomy

| Test Category | Executor / Engine | Description & Scope |
|---|---|---|
| **REAL BROWSER E2E** | Playwright (`@playwright/test`) | Launches actual Chromium browser, navigates to application URLs, executes interactive click/form events, and asserts real DOM and persistence response. |
| **API & INTEGRATION** | Node.js Test Runner (`node --test`) | Invokes Supabase API endpoints, server actions, and multi-step state machine workflows. |
| **UNIT & HELPERS** | Node.js Test Runner (`node --test`) | Validates isolated business logic (e.g. phone normalization, vitals bounds, notification rendering). |
| **DATABASE & RLS** | SQL / Supabase Client | Asserts PostgreSQL schema constraints, sequence generation, and Row Level Security tenant policies. |
| **SECURITY & AUDIT** | Node.js Test Runner / Security Scanners | Validates TOTP MFA elevation, AAL assurance levels, cookie flags, and audit log immutability. |

---

## 🧪 Playwright Browser Suite Manifest

The real browser E2E suite is located in `tests/browser/` and executed via `npm run test:e2e`:

1. `tests/browser/auth.spec.ts` — Blank form initialization & AuthGuard route protection.
2. `tests/browser/patient-opd.spec.ts` — Patient directory search and OPD consultation queue rendering.
3. `tests/browser/appointment.spec.ts` — Public booking portal and staff appointment console.
4. `tests/browser/doctor-roster.spec.ts` — Specialist doctor creation and schedule publishing UI.
5. `tests/browser/emergency.spec.ts` — 24/7 emergency casualty triage priority board.
6. `tests/browser/ipd-bed.spec.ts` — IPD admissions list and bed occupancy matrix.
7. `tests/browser/ot.spec.ts` — Operation Theatre schedule and room allocation console.
8. `tests/browser/lab.spec.ts` — Diagnostic test orders and result entry interface.
9. `tests/browser/pharmacy.spec.ts` — Pharmacy stock inventory and POS sales interface.
10. `tests/browser/billing.spec.ts` — Invoicing directory and cashier payment desk.
11. `tests/browser/hr.spec.ts` — Staff directory and software attendance console.
12. `tests/browser/reports-audit.spec.ts` — Financial reporting summaries and audit diff viewer.
13. `tests/browser/rbac.spec.ts` — Role-based permission enforcement and navigation guards.

---

## 🔒 Test Credential Hygiene
- **Zero Hardcoded Passwords:** Production and staging test credentials MUST be supplied via environment variables (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_BASE_URL`).
- **No Production Secret Exposure:** All TOTP MFA secrets and service role keys are excluded from git version control.
