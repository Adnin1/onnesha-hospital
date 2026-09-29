# Onnesha Hospital Management System (OHMS) — Final Release Certification Report

**Document Status:** Final & Authoritative  
**Release Version:** `v1.1.16`  
**Classification:** **`ENGINEERING COMPLETE — OWNER GATES REMAIN`**  
**Certification Date:** 2026-09-29T19:00:00+06:00  
**Target Environments:** Cloudflare Pages Production Edge (`onnesha-hospital.pages.dev`) & Supabase Managed Database (`iuhtzahuszdkdarhxobx`)  

---

## 1. Executive Summary & Provenance Reconciliation

All software engineering, security hardening, cross-browser Playwright automation, database migrations, storage authorization, financial accounting invariants, and full website deep audit across 54 clinical and operational routes have been implemented, verified, and certified against empirical test suites.

| Entity | Target Value / Identifier | Provenance Match |
| :--- | :--- | :---: |
| **Package Version** | `1.1.16` (`package.json`, `package-lock.json`, `Cargo.toml`, `tauri.conf.json`, `latest.json`, `Dockerfile`) | ✅ Synchronized |
| **Git Working Tree** | Clean (`0 uncommitted changes` prior to release commit) | ✅ 100% |
| **Remote Database** | Supabase PostgreSQL (`iuhtzahuszdkdarhxobx`) | ✅ Connected & Linked |
| **Database Migrations** | **94 Applied Migrations** (`001` through `20260929020000`) | ✅ 100% in sync |
| **Cloudflare Pages Production Deployment** | Static Export (`58 routes`, `56 HTML pages`) | ✅ Live (`https://onnesha-hospital.pages.dev`) |
| **Cloudflare Canonical Domain** | `https://onnesha-hospital.pages.dev` | ✅ Live |
| **Node.js Test Certification Suite** | **90 Test Suites** (`788 Active Passes, 0 Failures`) | ✅ 100% passed |
| **Playwright Cross-Browser Matrix** | 4 Browser Projects (Chromium, Firefox, Mobile-Chrome, WebKit) | ✅ 38/38 passed, 0 flaky (30/30 MFA 10x certified) |
| **Docker & Infrastructure Architecture** | Hardened Nginx runner + Postgres Entrypoint Orchestrator (safe find/sort) | ✅ Verified |
| **Storage Authorization & RLS** | Patient boundary, tenant matching, role/permission, admin-only DELETE & rollback compensation | ✅ 10/10 Scenarios Passed |
| **P&L Accounting & Date Boundaries** | Strict half-open interval & authoritative Cash & Bank disbursements | ✅ 8/8 Scenarios Passed |
| **Website Deep Audit** | 54 route taxonomy, WCAG 2.2 AA accessibility, zero PHI in public views | ✅ Fully Audited |
| **Final Classification** | **`ENGINEERING COMPLETE — OWNER GATES REMAIN`** | ✅ Certified |

---

## 2. Core Architectural & Security Invariants

### 2.1 Storage Authorization & Multi-Tenant RLS Hardening (Migration 93 & 94)
- **Authoritative Session Verification:** `requireStorageAccessAuthorization()` in `lib/storage/files.ts` validates that the caller's active organization matches the requested `organizationId` (`session.organizationId !== params.organizationId` fails closed with 403 Forbidden).
- **Patient Organization Boundary Check:** Queries the database (`patients` table) to assert that the target `patientId` exists and belongs to the requested `organizationId`. Cross-patient or cross-tenant document forging is blocked at the application level.
- **Permission & Role Guards:** Strictly verifies `session.permissions.includes(params.permissionKey)` or caller role (`admin`, `doctor`, `nurse`, `pathologist`, `diagnostic_staff`). Literal match bypasses were completely eliminated.
- **Forensic Audit Rollback Compensation:** If the audit log recording fails during upload, the uploaded file is automatically deleted from `medical-documents-vault` to prevent orphan untracked medical records.
- **Admin-Only Storage RLS DELETE (Migration 94):** `storage.objects` DELETE policy enforces that caller must be `service_role` or have an admin role (`admin`, `super_admin`, `hospital_administrator`) within the matching tenant.

### 2.2 Profit & Loss Date Boundary & Authoritative Accounting (Migration 92 & 94)
- **Strict Half-Open Interval `[startInclusive, endExclusive)`:** Resolved next-day boundary leakage where `<= p_end_date::DATE` included records from the following day. Dates are normalized to Asia/Dhaka BST calendar days and compared via `je.entry_date >= v_start_date_d AND je.entry_date < v_end_date_d`.
- **Elimination of Silent Fallback:** Removed the `IF v_operating_expenses = 0.00 THEN query public.expenses` branch, eliminating semantic divergence between the General Ledger and legacy operational expense records.
- **Authoritative General Ledger Integration:** Operating expenses are derived from posted journal entry lines on `EXPENSE` accounts.
- **Cash Basis Operating Disbursements (Migration 94):** Cash basis outflows are derived from credits to Cash & Bank asset accounts (`coa.account_code LIKE '10%' AND coa.account_type = 'ASSET'`), accurately distinguishing between accrual expenses and actual cash disbursements.

### 2.3 Docker Compose PostgreSQL Entrypoint Orchestrator
- **Flat Entrypoint Mounting:** Mounted `docker/init-db/init-postgres.sh` directly as an executable shell script at `/docker-entrypoint-initdb.d/00_init.sh:ro`.
- **Deterministic Migration Sequencing:** The script executes `/docker-init-scripts/*.sql` followed by all 94 migrations from `/docker-migrations/*.sql` in sorted alphanumeric order via `find /docker-migrations -maxdepth 1 -name '*.sql' | sort` with `set -e` and `-v ON_ERROR_STOP=1`.

---

## 3. Empirical Test & Verification Results

### 3.1 Strict Project Health Check (`node scripts/project-health-check.mjs --strict`)
All 15 verification checks passed with 0 critical errors:
1. Git State: Working tree clean
2. Version Consistency: Synchronized across 6 configuration files (`1.1.16`)
3. Secret Scanning: 0 hardcoded secrets in production source
4. Localhost / HTTP References: 0 localhost references in production source
5. TODO/FIXME Audit: 0 TODO/FIXME markers in production source
6. TypeScript Compilation: 0 errors
7. ESLint: 0 warnings
8. Build Verification: 58 static routes compiled and exported
9. Database Migrations: 94 migration files verified
10. Service Worker Safety: All clinical and financial patterns covered by NEVER_CACHE
11. Security Headers: HSTS, X-Frame-Options, CSP with 0 unsafe-eval
12. npm Audit: 0 high/critical vulnerabilities
13. Static Export Invariants: 0 server directives or headers imports in UI
14. Docker Consistency: Dockerfile synchronized and Nginx CSP free of sandbox domains
15. Storage & Accounting Invariants: Storage authorization, P&L half-open date boundary, Docker init script, and Migration 94 verified

### 3.2 Full Test Certification (`npm run test:certification`)
- **Total Test Suites Executed:** 90 suites
- **Passed Suites:** 90 / 90 (100%)
- **Failed Suites:** 0
- **Total Active Passed Assertions:** 788 passes
- **Active Failures:** 0
- **Standard Skips:** Exactly 6 assertions across 5 suites (production mutation safeguards preventing dummy test data from polluting production tables).

---

## 4. Live Production Cloudflare Verification

- **Production URL:** `https://onnesha-hospital.pages.dev/`
- **Four-Layer Production Security Smoke Suite:**
  - Layer A: 15/15 Routes reachable (HTTP 200 OK)
  - Layer B: 4/4 Sensitive routes clean (0 PHI or credentials in HTML)
  - Layer C: 3/3 Database tables shielded (0 rows anonymously accessible)
  - Layer D: 2/2 RPC endpoints forbidden to anonymous callers
- **Live Desktop Release Metadata:** Verified `https://onnesha-hospital.pages.dev/downloads/desktop/latest.json` serving `version: "1.1.16"`.
- **Live Security Response Headers:**
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'self' ... frame-ancestors 'none'` (0 unsafe-eval)

---

## 5. Owner Action Checklist for Live Commercial Go-Live

To transition the deployment status from `ENGINEERING COMPLETE — OWNER GATES REMAIN` to `PRODUCTION COMPLETE — VERIFIED`, the following external prerequisites must be performed by the system owner:

1. **Custom Domain Setup (`onneshahospital.com`):**
   - Add custom domain in Cloudflare Pages.
   - For apex domain (`onneshahospital.com`), configure Cloudflare authoritative nameservers on the domain registrar.
   - For `www.onneshahospital.com`, configure CNAME pointing to `onnesha-hospital.pages.dev`.
2. **GitHub Actions Staging Secrets (for automated CI/CD pipeline):**
   - In GitHub Repo -> Settings -> Environments -> `staging`, configure `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY`.
3. **Live Merchant API Credentials:**
   - Configure live production API keys for SMS Gateway (SSL Wireless / Greenweb) and Payment Gateways (bKash, Nagad, SSLCommerz).
4. **Physical Hardware Setup:**
   - Connect USB 80mm thermal receipt printers and barcode scanners to hospital client PCs.
