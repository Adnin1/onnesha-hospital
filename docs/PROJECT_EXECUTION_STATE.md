# OHMS Project Execution State Ledger

**Last Updated:** 2026-09-29  
**Platform Version:** `1.1.15`  
**Git Branch:** `main`  
**Git Tag:** `v1.1.15`  
**Target Release Tag:** `v1.1.15`  
**Release Governance State:** `ENGINEERING COMPLETE — OWNER GATES REMAIN`  

---

## 1. Executive Summary & Zero False Green Policy

This state ledger provides the single source of truth for the Onnesha Hospital Management System (OHMS). Under the Antigravity Autonomous Engineering Constitution, zero false greens are permitted. Engineering capabilities are certified by deterministic automated test suites, typechecks, linters, and static builds. External operational dependencies outside code repository jurisdiction are categorized honestly as **Owner Action Required**.

---

## 2. Core Repository Metrics & Artifact Baseline

| Metric | Measured Value | Standard / Target | Status |
|:---|:---|:---|:---|
| **Repository Version** | `1.1.15` | Synchronized across 6 config files | ✅ Synchronized |
| **Total Test Suites** | `90 suites` | 100% of test files discovered | ✅ 90 / 90 Passing |
| **Active Test Passes** | `788 tests` | 0 failures, 0 regressions | ✅ 788 Active Passes |
| **Standard Skips** | `6 tests` | Explicitly justified environmental skips | ✅ 6 Standard Skips |
| **Database Migrations** | `94 files` | Idempotent, sequential, fail-closed SQL | ✅ 94 Migrations |
| **TypeScript (tsc)** | `0 errors` | `tsc --noEmit` clean exit code 0 | ✅ Zero Errors |
| **ESLint** | `0 warnings` | `eslint . --max-warnings 0` exit code 0 | ✅ Zero Warnings |
| **Static Next.js Build** | `output: "export"` | 33 static HTML routes compiled | ✅ Clean Build |
| **Service Worker** | `public/sw.js` | 15 clinical/financial NEVER_CACHE rules | ✅ Verified |
| **Security Headers** | `public/_headers` | HSTS (1 yr), CSP, X-Frame-Options DENY | ✅ Verified |
| **Docker Topology** | `docker-compose.yml` | Hardened entrypoint mount, init scripts | ✅ Clean Architecture |

---

## 3. Provenance & Live Edge Alignment

| Environment | Current Served Version | Expected Source Branch / Tag | Alignment Status |
|:---|:---|:---|:---|
| **Local Repository HEAD** | `v1.1.15` | `main` | ✅ Synchronized |
| **Remote GitHub (`origin`)** | `v1.1.15` | `origin/main` | ✅ Synchronized |
| **Remote SSH (`ssh-origin`)** | `v1.1.15` | `ssh-origin/main` | ✅ Synchronized |
| **Cloudflare Pages Production** | `v1.1.12` | `https://onnesha-hospital.pages.dev/` | 🟡 Edge Deployment Pending Sync |

> [!NOTE]
> The public Cloudflare Pages edge currently serves version `1.1.12` from an earlier deployment. The local and remote GitHub branches are at `v1.1.15`. Production deployment occurs automatically via Cloudflare Pages GitHub integration once remote CI triggers or via owner manual trigger.

---

## 4. Master 10-Gate Production Readiness Matrix

### Technical Engineering Gates (1 – 7): 100% Complete & Certified

| # | Gate Name | Technical Mandate | Evidence & Test Suite | Status |
|:---|:---|:---|:---|:---|
| **1** | **Static Export Architecture** | Zero `"use server"` or dynamic `next/headers` in UI; pure client-safe SSR/SSG export | Verified in `tests/phase18-infrastructure-desktop.test.mjs`, Check 13 in health check | ✅ PASS |
| **2** | **Multi-Tenant RLS & Storage Authorization** | Authoritative session, organization matching, patient boundary check, MIME whitelist (50MB), admin-only DELETE policy, and upload audit rollback compensation | Verified in `tests/storage-authorization-and-rls.test.mjs` (10/10) & Migration 93/94 | ✅ PASS |
| **3** | **Authoritative P&L & Date Boundaries** | Strict half-open `[start, end)` Asia/Dhaka boundaries, authoritative General Ledger expense queries, and cash basis disbursements from Cash & Bank accounts (`1010-1099`) | Verified in `tests/pnl-accounting-and-date-boundaries.test.mjs` (8/8) & Migration 92/94 | ✅ PASS |
| **4** | **Financial Atomicity & Void Audit** | Double-entry journal posting RPCs, server-authoritative balance calculation, immutable journal line locks, mandatory clinical void justification | Verified in `tests/financial-accounting-invariants.test.mjs` & `tests/phase59-financial-atomicity-and-concurrency.test.mjs` | ✅ PASS |
| **5** | **Forensic Audit & Telemetry Safety** | PostgreSQL immutable triggers, PHI redaction regex in `lib/health.ts`, zero clinical data in telemetry or client logs | Verified in `tests/phase19-backup-monitoring-dr.test.mjs` | ✅ PASS |
| **6** | **PWA & Edge Network Resilience** | Clinical cache isolation in `public/sw.js`, offline banner in `NetworkStatus.tsx`, responsive mobile viewport | Verified in `tests/phase17-pwa-performance-a11y.test.mjs` | ✅ PASS |
| **7** | **Docker Topology & Clean DB Initialization** | Mounts `docker/init-db/init-postgres.sh` directly as executable `/docker-entrypoint-initdb.d/00_init.sh:ro` with `ON_ERROR_STOP=1` | Verified in `tests/docker-postgres-init-architecture.test.mjs` (6/6) | ✅ PASS |

### Owner Action Gates (8 – 10): External Dependencies Pending Owner Execution

| # | Gate Name | Required External Action | Dependency Details | Classification |
|:---|:---|:---|:---|:---|
| **8** | **Staging Live Security Gate** | Provide live staging secrets in GitHub Actions environment | `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_ANON_KEY` needed for remote live test execution (fails closed safely) | 🟡 OWNER GATE |
| **9** | **Custom Domain DNS Setup** | Point DNS records to Cloudflare Pages | Point CNAME / A records for `onneshahospital.com` and `www.onneshahospital.com` to `onnesha-hospital.pages.dev` | 🟡 OWNER GATE |
| **10** | **Live Merchant Credentials & Physical Hardware** | Input production API keys & connect USB printers | bKash, Nagad, SSLCommerz, SSL Wireless SMS, Meta WhatsApp Cloud API credentials; connect 80mm POS thermal USB printers | 🟡 OWNER GATE |

---

## 5. Architectural Correctness Log (v1.1.15)

1. **Storage Access Authorization Hardening (`lib/storage/files.ts`):**
   - Removed literal `params.permissionKey === "medical_records:view"` bypass.
   - Now checks `session.permissions.includes(params.permissionKey)` or verifies that the caller has `patients.view` / `patients.edit` permissions or privileged roles (`admin`, `doctor`, `nurse`, `pathologist`, `diagnostic_staff`).
   - Added compensation rollback: If the forensic audit log registration fails during a file upload, the uploaded file is automatically deleted from `medical-documents-vault` storage to prevent orphan untracked medical records.
2. **Storage Objects RLS Admin Enforcement (Migration 94):**
   - Updated `medical_vault_tenant_isolation_delete` policy on `storage.objects`.
   - Explicitly verifies that the caller is `service_role` OR possesses an active `admin`, `super_admin`, or `hospital_administrator` role within the matching organization.
3. **P&L Cash Basis Operating Disbursements (Migration 94):**
   - Corrected `get_profit_and_loss_summary` cash basis calculation.
   - Operating disbursements are now authoritatively derived from General Ledger credits to Cash & Bank asset accounts (`coa.account_code LIKE '10%' AND coa.account_type = 'ASSET'`).
   - Excludes patient collections and refunds to avoid duplicate counting.
   - Accrued expenses without cash outflow accurately report $0 cash disbursement while reporting full operating expense in the accrual statement.

---

## 6. Verification Commands & Reproducibility Runbook

```powershell
# 1. Run all test suites
npm test

# 2. Strict Project Health Check (all 15 governance checks)
node scripts/project-health-check.mjs --strict

# 3. TypeScript Compilation
npm run typecheck

# 4. ESLint Check (zero warnings allowed)
npx eslint . --max-warnings 0

# 5. Production Static Build
npm run build
```
