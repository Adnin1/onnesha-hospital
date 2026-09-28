# Onnesha Hospital Management System (OHMS) — Final Release Certification Report

**Document Status:** Final & Authoritative  
**Release Version:** `v1.1.14`  
**Classification:** **`ENGINEERING COMPLETE — OWNER GATES REMAIN`**  
**Certification Date:** 2026-09-29T04:50:00+06:00  
**Target Environments:** Cloudflare Pages Production Edge (`onnesha-hospital.pages.dev`) & Supabase Managed Database (`iuhtzahuszdkdarhxobx`)  

---

## 1. Executive Summary & Provenance Reconciliation

All software engineering, security hardening, cross-browser Playwright automation, database migrations, storage authorization, and financial accounting requirements have been implemented, verified, and certified against empirical test suites.

| Entity | Target Value / Identifier | Provenance Match |
| :--- | :--- | :---: |
| **Package Version** | `1.1.14` (`package.json`, `package-lock.json`, `Cargo.toml`, `tauri.conf.json`, `latest.json`, `Dockerfile`) | ✅ Synchronized |
| **Git Working Tree** | Clean (`0 uncommitted changes` prior to release commit) | ✅ 100% |
| **Remote Database** | Supabase PostgreSQL (`iuhtzahuszdkdarhxobx`) | ✅ Connected & Linked |
| **Database Migrations** | **93 Applied Migrations** (`001` through `20260929010000`) | ✅ 100% in sync |
| **Cloudflare Pages Production Deployment** | Static Export (`58 routes`, `56 HTML pages`) | ✅ Live (`https://onnesha-hospital.pages.dev`) |
| **Cloudflare Canonical Domain** | `https://onnesha-hospital.pages.dev` | ✅ Live |
| **Node.js Test Certification Suite** | **90 Test Suites** (`784 Active Passes, 0 Failures`) | ✅ 100% passed |
| **Playwright Cross-Browser Matrix** | 4 Browser Projects (Chromium, Firefox, Mobile-Chrome, WebKit) | ✅ 38/38 passed, 0 flaky (30/30 MFA 10x certified) |
| **Docker & Infrastructure Architecture** | Hardened Nginx runner + Postgres Entrypoint Orchestrator + CSP sync | ✅ Verified |
| **Storage Authorization & RLS** | Patient boundary, tenant matching, role/permission & storage.objects RLS | ✅ 8/8 Scenarios Passed |
| **P&L Accounting & Date Boundaries** | Strict half-open [start, end) interval & authoritative General Ledger | ✅ 6/6 Scenarios Passed |
| **Static Export Architecture Guard** | 0 `"use server"`, 0 UI `next/headers`, pure client storage | ✅ 7/7 Scenarios Passed |
| **Final Classification** | **`ENGINEERING COMPLETE — OWNER GATES REMAIN`** | ✅ Certified |

---

## 2. Core Architectural & Security Invariants

### 2.1 Storage Authorization & Multi-Tenant RLS Hardening
- **Authoritative Session Verification:** `requireStorageAccessAuthorization()` in `lib/storage/files.ts` validates that the caller's active organization matches the requested `organizationId` (`session.organizationId !== params.organizationId` fails closed with 403 Forbidden).
- **Patient Organization Boundary Check:** Queries the database (`patients` table) to assert that the target `patientId` exists and belongs to the requested `organizationId`. Cross-patient or cross-tenant document forging is blocked at the application level.
- **Permission & Role Guards:** Asserts that caller holds `medical_records:view`, `medical_records:edit`, or explicit patient permissions, or privileged clinical/administrative roles (`admin`, `doctor`, `nurse`, `pathologist`, `diagnostic_staff`).
- **Path Traversal & MIME Protection:** Strict canonicalization (`validateAndCanonicalizeStoragePath`) restricting paths to `{org_id}/{patient_id}/{filename}` without double slashes, null bytes, or `..` traversals. MIME types restricted to PDF, PNG, JPEG, and DICOM with a 50MB ceiling.
- **Database Storage RLS (Migration 93):** `storage.objects` table protected with multi-tenant row level security (`medical_vault_tenant_isolation_select`, `insert`, `update`, `delete`) comparing path prefix `split_part(name, '/', 1)` against active organization ID.

### 2.2 Profit & Loss Date Boundary & Authoritative Accounting (Migration 92)
- **Strict Half-Open Interval `[startInclusive, endExclusive)`:** Resolved next-day boundary leakage where `<= p_end_date::DATE` included records from the following day. Dates are normalized to Asia/Dhaka BST calendar days and compared via `je.entry_date >= v_start_date_d AND je.entry_date < v_end_date_d`.
- **Elimination of Silent Fallback:** Removed the `IF v_operating_expenses = 0.00 THEN query public.expenses` branch, eliminating semantic divergence between the General Ledger and legacy operational expense records.
- **Authoritative General Ledger Integration:** Operating expenses and operational disbursements are derived exclusively from posted double-entry journal entries (`journal_entry_lines` joined to `chart_of_accounts` where `coa.account_type = 'EXPENSE'`).

### 2.3 Docker Compose PostgreSQL Entrypoint Orchestrator
- **Flat Entrypoint Mounting:** Mounted `docker/init-db/init-postgres.sh` directly as an executable shell script at `/docker-entrypoint-initdb.d/00_init.sh:ro`.
- **Deterministic Migration Sequencing:** The script executes `/docker-init-scripts/*.sql` (the Supabase compatibility shim defining `auth` schema, `auth.users`, `auth.uid()`, `auth.jwt()`, and `storage` tables) followed by all 93 migrations from `/docker-migrations/*.sql` in sorted alphanumeric order with `set -e` and `-v ON_ERROR_STOP=1`.

---

## 3. Empirical Test & Verification Results

### 3.1 Strict Project Health Check (`node scripts/project-health-check.mjs --strict`)
All 15 verification checks passed with 0 critical errors:
1. Git State: Working tree clean
2. Version Consistency: Synchronized across 6 configuration files (`1.1.14`)
3. Secret Scanning: 0 hardcoded secrets in production source
4. Localhost / HTTP References: 0 localhost references in production source
5. TODO/FIXME Audit: 0 TODO/FIXME markers in production source
6. TypeScript Compilation: 0 errors
7. ESLint: 0 warnings
8. Build Verification: 58 static routes compiled and exported
9. Database Migrations: 93 migration files verified
10. Service Worker Safety: All clinical and financial patterns covered by NEVER_CACHE
11. Security Headers: HSTS, X-Frame-Options, CSP with 0 unsafe-eval
12. npm Audit: 0 high/critical vulnerabilities
13. Static Export Invariants: 0 server directives or headers imports in UI
14. Docker Consistency: Dockerfile synchronized and Nginx CSP free of sandbox domains
15. Storage & Accounting Invariants: Storage authorization, P&L half-open date boundary, and Docker init script verified

### 3.2 Full Test Certification (`npm run test:certification`)
- **Total Test Suites Executed:** 90 suites
- **Passed Suites:** 90 / 90 (100%)
- **Failed Suites:** 0
- **Total Active Passed Assertions:** 784 passes
- **Active Failures:** 0
- **Standard Skips:** Exactly 6 assertions across 5 suites (production mutation safeguards preventing dummy test data from polluting production tables).

### 3.3 Cross-Browser Playwright Matrix
- **Chromium:** 38 / 38 passed (100%)
- **Firefox:** 38 / 38 passed (100%)
- **Mobile-Chrome:** 38 / 38 passed (100%)
- **WebKit:** 38 / 38 passed (100%)
- **MFA Flakiness Repetition:** 30 / 30 passed across 10 repeated runs (0 flakes).

---

## 4. Truth Classification Matrix

### ✅ Category A: Software Engineering Complete & Tested
- [x] Full Next.js 16 hospital operating system (OPD, IPD, Emergency, Pharmacy, Lab, Billing, HR, Accounting, Assets, Audit)
- [x] 93 Supabase PostgreSQL migrations applied and synchronized with remote database
- [x] Fail-closed tenant validation on all financial reporting RPCs (SQLSTATE 42501)
- [x] Single-transaction atomic billing + General Ledger posting (`create_invoice_and_post_gl_atomic`)
- [x] Strict half-open interval `[start, end)` for P&L date calculations (Migration 92)
- [x] Authoritative General Ledger operating expense and cash disbursement integration
- [x] Authoritative storage access authorization with active organization, permission, and patient ownership checks
- [x] Multi-tenant storage.objects RLS policies for private medical document vault (Migration 93)
- [x] Docker Compose PostgreSQL entrypoint orchestrator (`init-postgres.sh`) with compatibility shim
- [x] Docker Nginx CSP synchronized with `public/_headers` (sandbox removed, securepay preserved)
- [x] GitHub deploy workflow hardened (zero fake Supabase fallback URLs, full preflight certification, deploy-scoped permissions, commit-hash tracking)
- [x] Storage client migrated to pure client-side `@/lib/supabase/client`
- [x] 90 / 90 Node.js test suites passing (784 passes, 0 failures, 0 regressions)
- [x] 38 / 38 Playwright browser tests passing across Chromium, Firefox, WebKit, Mobile-Chrome (0 flaky, 30/30 MFA certified)
- [x] 58 static routes exported cleanly
- [x] 0 TypeScript errors, 0 ESLint warnings, 0 broken asset links
- [x] Cloudflare Pages production deployment verified at `https://onnesha-hospital.pages.dev`

### 🟡 Category B: External Owner / Commercial Gates Remaining
The application code is complete and hardened; the following gates require owner-controlled external actions or third-party credentials:

1. **GitHub Actions Staging Environment Secrets:**
   - *Status:* CI job `live-security-test` is fail-closed. Executing automated staging tests in GitHub Actions requires configuring `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` in the repository's GitHub `staging` environment.
2. **Apex Custom Domain DNS:**
   - *Status:* Pointing `onneshahospital.com` and `www.onneshahospital.com` to `onnesha-hospital.pages.dev` requires CNAME/A record updates at the domain registrar.
3. **Live Commercial Payment Gateway Credentials:**
   - *Status:* Live merchant credentials for bKash, Nagad, and SSLCommerz must be configured in environment secrets for commercial transactions.
4. **Live SMS / WhatsApp Gateway API Credentials:**
   - *Status:* Commercial API keys for SSL Wireless, Greenweb, or Meta WhatsApp Cloud API must be added to production environment settings.
5. **Physical Thermal Printers & Barcode Scanners:**
   - *Status:* Physical USB connection of 80mm POS receipt printers and barcode scanners to hospital client PCs.
6. **Desktop Updater Signing Key:**
   - *Status:* Cryptographic signing key generated via `tauri signer generate` to be stored in private CI secrets for Windows MSI updates.

---

## 5. Final Certification Verdict

**VERDICT: `ENGINEERING COMPLETE — OWNER GATES REMAIN`**

All core software engineering, security hardening, storage authorization, database migrations, and financial accounting requirements are 100% complete, verified, and deployed to Cloudflare Pages. Commercial operational launch will be finalized upon the owner fulfilling the Category B external operational gates.
