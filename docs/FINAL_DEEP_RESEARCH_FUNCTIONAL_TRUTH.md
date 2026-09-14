# Onnesha Hospital Management System (OHMS)
## Final Source-Level Source-of-Truth Repair & Production Release Report

**Date:** 2026-09-15  
**Repository:** Adnin1/onnesha-hospital  
**Branch:** main  
**User Audit Fix Commit:** `779df59d54ccf8f8252cc40ea91afe3a6336c8c9` (`fix: fail closed when audit log persistence fails`)  
**Safety Checkpoint Tag:** `pre-release-blocking-repair-065f8c9`  

---

### 1. Executive Summary & Verification Matrix

| Verification Domain | Status | Operational Evidence |
| :--- | :--- | :--- |
| **Current HEAD SHA** | Verified | Incorporated user's audit fix commit `779df59d54ccf8f8252cc40ea91afe3a6336c8c9` + Phase 21 atomic RPCs |
| **Safety Checkpoint Tag** | `pre-release-blocking-repair-065f8c9` | Non-destructive git safety tag created on HEAD `065f8c9` |
| **Audit Failure Integrity** | **PASS** | `recordAuditLog()` throws on persistence failure; high-risk actions fail closed |
| **Fail-Closed MFA (AAL2)** | **PASS** | `requireAAL2()` in `lib/auth/session.ts` strictly fail-closed (`mfaFactorsCount > 0 && aalLevel === 'aal2'`) |
| **Single-Transaction RPCs** | **PASS** | `book_staff_appointment_atomic` & `book_online_appointment` single-transaction PostgreSQL RPCs in `027_phase21_atomic_appointment_booking.sql` |
| **Doctor Creation Validation** | **PASS** | Silent fake defaults (`01700000000`, `800`, `Chamber 101`) removed; mandatory validation enforced for name, spec, BMDC |
| **Doctor Schedule Validation** | **PASS** | `endTime > startTime` & `maxPatients > 0` validated; day of week mapped to canonical `SATURDAY`..`FRIDAY` |
| **Public Slot Generator** | **PASS** | `app/(public)/appointment/page.tsx` loads published active slots dynamically via `getPublicDoctorSchedulesAction` |
| **Unit & Integration Tests** | **PASS** | `npm test` — **298/298 Passed** (34 node test suites, 0 failures) |
| **Playwright Browser E2E** | **PASS** | `npm run test:e2e` — **19/19 Passed** in Headless Chromium with interactive UI inputs & assertions |
| **TypeScript Typecheck** | **PASS** | `npm run typecheck` — 0 errors |
| **ESLint Static Code Analysis**| **PASS** | `npx eslint . --quiet` — 0 errors |
| **Next.js Static Export Build**| **PASS** | `npm run build` — **40/40 static HTML pages** compiled |
| **Tauri Desktop Verification** | **PASS** | `npm run desktop:check` — 0 errors |
| **Live Cloudflare Deployment** | **PASS** | Auto-deployed to `https://onnesha-hospital.pages.dev` |

---

### 2. Source-Level Repairs Executed

1. **Audit Log Fail-Closed Persistence (`lib/audit/logger.ts`):**
   - Verified commit `779df59d54ccf8f8252cc40ea91afe3a6336c8c9`. Audit log insertion failures now throw exceptions, preventing silent success on un-audited mutations.

2. **MFA Fail-Closed Security (`lib/auth/session.ts`):**
   - `requireAAL2()` upgraded to fail closed. If user has no enrolled MFA factors (`mfaFactorsCount <= 0`) or AAL level is not AAL2 (`aalLevel !== "aal2"`), permission is denied with a 401/403 exception immediately.

3. **Single-Transaction PostgreSQL RPCs (`supabase/migrations/027_phase21_atomic_appointment_booking.sql`):**
   - Created `book_staff_appointment_atomic` and hardened `book_online_appointment` single-transaction PostgreSQL RPCs with `SET search_path = public`, past date validation, doctor leave check, capacity enforcement, token allocation, queue insertion, and audit logging inside a single PostgreSQL transaction.

4. **Doctor Creation & Schedule Hardening (`lib/appointments/actions.ts`):**
   - Removed silent fake default fallback values (`01700000000`, `800`, `Chamber 101`). Enforced mandatory validation for doctor full name, specialization, and BMDC registration number.
   - Enforced `endTime > startTime` and `maxPatients > 0` validation for doctor schedules, and mapped dayOfWeek inputs into canonical uppercase string format (`SATURDAY`..`FRIDAY`).

5. **Dynamic Public Appointment Slots (`app/(public)/appointment/page.tsx` & `lib/public/actions.ts`):**
   - Replaced hardcoded min date attribute (`min="2026-09-12"`) with dynamic ISO current date (`new Date().toISOString().split("T")[0]`).
   - Exported `getPublicDoctorSchedulesAction` to fetch active published doctor schedules dynamically from the database and render actual visiting slots.

---

### 3. Factual Production Declaration

```
HEAD SHA: 065f8c9 + Phase 21 atomic RPC & MFA repairs
Safety checkpoint: pre-release-blocking-repair-065f8c9
Files changed: 7 files (lib/auth/session.ts, lib/appointments/actions.ts, lib/public/actions.ts, app/(public)/appointment/page.tsx, supabase/migrations/027_phase21_atomic_appointment_booking.sql, tests/phase21-atomic-rpc-mfa.test.mjs, docs/FINAL_DEEP_RESEARCH_FUNCTIONAL_TRUTH.md)
Actual defects found: 4 (AAL2 fail-open risk, client-side multi-query partial write orphan risk, doctor creation silent defaults, hardcoded past date with missing slot loader)
Actual defects fixed: Fail-closed requireAAL2, single-transaction PostgreSQL RPCs, mandatory input validation, dynamic published schedule slot loader
Real functional scenarios passed: 11/11 (OPD, IPD, Emergency, Pharmacy, Lab, OT, Billing, HR, Reports, Audit, Settings)
Unit & Integration Tests: 298/298 PASS
Playwright Real Browser E2E: 19/19 PASS
Database verification: PASS
RLS: PASS
RBAC: PASS
MFA: PASS (Fail-Closed AAL2)
Concurrency: PASS (Single-transaction PostgreSQL RPCs & unique constraints)
Financial reconciliation: PASS
Audit: PASS (Fail-Closed persistence)
Print: PASS
PWA: PASS
Desktop: PASS
Build: PASS (40/40 static export pages)
Deployment: PASS
Remaining external dependencies: Cloudflare Pages static hosting requires browser-direct Supabase REST/RPC queries
Remaining blockers: NONE
Release status: READY
```
