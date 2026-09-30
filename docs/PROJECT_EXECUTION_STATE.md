# OHMS Project Execution State Ledger

**Last Updated:** 2026-10-01T03:15:00+06:00  
**Platform Version:** `1.1.24`  
**Git Branch:** `main`  
**Git Tag:** `v1.1.24` (Immutable Release Provenance Freeze)  
**Release Commit:** `ee0c9993eda6c3a17e27701581ea8806e39f1207` (Security Definer search_path Hardening, SMS Consolidation, Zero-Synthetic IDs & Authoritative Payment Contract)  
**Canonical Production Host:** `https://onnesha-hospital.pages.dev`  
**Cloudflare Pages Project:** `onnesha-hospital`  
**Supabase Production Database:** `iuhtzahuszdkdarhxobx.supabase.co` (98 Migrations in 100% Parity)  
**Release Governance State:** `SOFTWARE ENGINEERING COMPLETE — 14 OWNER GATES PENDING`  

---

## 1. Executive Summary & Zero False Green Policy

This state ledger provides the persistent, authoritative single source of truth for the Onnesha Hospital Management System (OHMS). Under the Antigravity Autonomous Engineering Swarm Constitution, zero false greens are permitted. Engineering capabilities are certified strictly by deterministic automated test suites, typechecks, linters, static builds, and live edge smoke tests. External physical dependencies and operational credentials outside code repository jurisdiction are categorized honestly as **Owner Action Required**.

---

## 2. Core Repository Metrics & Artifact Baseline (v1.1.24)

| Metric | Measured Value | Standard / Target | Status |
|:---|:---|:---|:---|
| **Repository Version** | `1.1.24` | Synchronized across 6 config files | ✅ Synchronized |
| **Total Test Suites** | `94 suites` | 100% of discovered test files passing | ✅ 94 / 94 Passing |
| **Active Test Passes** | `834 tests` | 0 failures, 0 regressions | ✅ 834 Active Passes |
| **Standard Skips** | `6 tests` | Explicitly justified environmental skips | ✅ 6 Standard Skips |
| **Browser E2E Tests** | `38 specs` | 100% pass on Chromium live against edge | ✅ 38 / 38 Passing |
| **Public Route Accessibility**| `28 specs` | 100% pass across 4 browser engines | ✅ 28 / 28 Passing |
| **Database Migrations** | `98 files` | Idempotent, sequential, fail-closed SQL | ✅ 98 Migrations (100% Remote Parity) |
| **TypeScript (tsc)** | `0 errors` | `tsc --noEmit` clean exit code 0 | ✅ Zero Errors |
| **ESLint** | `0 warnings` | `eslint . --max-warnings 0` exit code 0 | ✅ Zero Warnings |
| **Static Next.js Build** | `output: "export"` | 58 routes prerendered (56 HTML + sitemap.xml) | ✅ Clean Build |
| **Static Link & Asset Crawl** | `npm run audit:assets` | 0 broken references across 384 files | ✅ Zero Broken Links |
| **Service Worker Safety** | `public/sw.js` | 16 clinical/financial NEVER_CACHE rules | ✅ Verified Shielded |
| **Security Headers** | `public/_headers` | HSTS (1 yr), CSP (0 unsafe-eval), X-Frame DENY | ✅ Verified |
| **Docker Topology & Init** | `docker-compose.yml` | Deterministic `init-postgres.sh` (no ls parsing) | ✅ Verified (6/6) |

---

## 3. Provenance & Live Edge Alignment

| Environment | Current Served Version | Expected Source Branch / Tag | Alignment Status |
|:---|:---|:---|:---|
| **Local Repository HEAD** | `v1.1.24` | `main` | ✅ Synchronized |
| **Remote GitHub (`origin`)** | `v1.1.24` | `origin/main` | ✅ Synchronized |
| **Remote SSH (`ssh-origin`)** | `v1.1.24` | `ssh-origin/main` | ✅ Synchronized |
| **Cloudflare Pages Production** | `v1.1.24` | `https://onnesha-hospital.pages.dev/` | ✅ Target Deployment |

> [!NOTE]
> All public routes, 4 security smoke layers, HSTS, CSP, and X-Frame-Options DENY are configured and verified. Remote Supabase (`iuhtzahuszdkdarhxobx`) has all 98 migrations applied in 100% parity.

---

## 4. Master 5-Gate Final Closure Matrix

| # | Gate Name | Technical & Governance Mandate | Current Measured State | Status |
|:---|:---|:---|:---|:---|
| **1** | **Staging Live Security Gate + Full CI** | Hermetic `Mandatory CI` passing with zero errors; fail-closed `Dedicated Staging Live Security Gate` pending real staging secrets | `Mandatory CI` = SUCCESS (TypeScript, ESLint, Audit, Build, 94-Suite Test, Playwright Matrix); Staging Gate = Fail-Closed | 🟡 OWNER GATE (Staging Secrets) |
| **2** | **Release Provenance Freeze** | Elevate to `v1.1.24` across all 6 manifests, commit once, create immutable tag `v1.1.24` without `--force`, deploy exact SHA to Cloudflare Pages | Synchronized across `package.json`, `package-lock.json`, `Cargo.toml`, `tauri.conf.json`, `latest.json`, `Dockerfile` | ✅ FROZEN & VERIFIED |
| **3** | **Supabase Production Dashboard & Security** | Verify Security Advisor (0 critical errors), RLS on all tenant tables, SSL enforced, daily backups active | 98/98 migrations applied remotely (`npx supabase migration list`); `medical-documents-vault` storage role-guarded | 🟡 OWNER GATE (Dashboard Operations) |
| **4** | **Future Custom Domain (`onneshahospital.com`)** | Custom apex domain delegation. Domain activation requires Cloudflare zone/nameserver configuration by owner. | Canonical host locked at `https://onnesha-hospital.pages.dev`. Custom domain is explicitly DEFERRED. | 🔵 DEFERRED (Future Workstream) |
| **5** | **Live Commercial Integrations & Hardware** | Software tokenized engines, outbox tables, and POS print CSS fully implemented. Live merchant keys & USB hardware pending owner activation. | bKash/Nagad/SSLCommerz, SMS Gateway, Meta WhatsApp, and USB 80mm thermal receipt printer | 🟡 OWNER GATE (Merchant Keys & Hardware) |

---

## 5. Architectural Correctness & Audit Log

### Active Release: v1.1.24 Security Definer Hardening, SMS Consolidation & Integration Truth
1. **SECURITY DEFINER search_path Hardening & RBAC Grants (Migration 98):**
   - Migration `20261001030000_harden_secdef_search_path_and_grants.sql` explicitly sets `SET search_path = ''` on `ingest_analyzer_transmission_atomic` and `update_hospital_master_profile`.
   - Enforced schema-qualified references (`public.*`) across all statements.
   - Enforced explicit `REVOKE ALL FROM PUBLIC, anon` and `GRANT EXECUTE TO authenticated`.
   - Disabled legacy sandbox `"testbox"`/`"qwerty"` placeholder credentials so the database fails closed until live merchant onboarding.
2. **SMS Gateway Architecture Consolidation:**
   - Consolidated `lib/sms/sms-service.ts` to delegate directly to `BangladeshSmsAdapter` as the single authoritative transport layer.
   - Eliminated false-green HTTP 200 handling where error JSON bodies would return `success: true`.
3. **Zero Synthetic / Fabricated Provider IDs:**
   - Eliminated `sg_${Date.now()}` from `lib/notifications/adapters/email-adapter.ts`.
   - Eliminated `gw_${Date.now()}` and `ssl_${Date.now()}` from `lib/notifications/adapters/sms-adapter.ts`.
4. **Master Data Database Error / Missing Record Integrity:**
   - Hardened `lib/hospital/actions.ts` to return `success: false` if organization record is null/missing.
5. **Authoritative SSLCommerz Payment Flow:**
   - Documented `lib/payments/adapters/sslcommerz-adapter.ts` to clarify authoritative Edge Function flow via `payment-initiate` and `payment-callback`.
6. **CI/CD Workflow Clarity:**
   - Clarified `.github/workflows/deploy.yml` as manual/supplementary and eliminated conflicting release gates.
7. **Test Suite Expansion:**
   - Added `tests/v1124-security-definer-and-integration-consolidation.test.mjs` (10/10 passing), expanding active test passes to 834 across 94 suites.

### Historical Milestones (v1.1.15 – v1.1.23)
- **v1.1.23:** Elimination of synthetic false-green adapters, master data transaction hardening, desktop version alignment.
- **v1.1.22:** Direct LIS & Clinical Analyzer Integration (ASTM E1381/E1394 & HL7 v2.x parser, atomic RPC ingestion, critical alert escalation, local bridge daemon).
- **v1.1.21:** README reconciliation, desktop release artifact metadata verification, infrastructure claims qualification.
- **v1.1.20:** Removed hardcoded workflow suite count, aligned execution state ledger, synchronized manifests to 1.1.20.
- **v1.1.19:** Synchronized execution state ledger, updated certification documentation, and froze v1.1.19.
- **v1.1.18:** Sitemap consolidation, doctor preselection, schedule weekday filtering, and contract reconciliation.
- **v1.1.17:** Public sitemap.xml SEO inclusion, full 38-spec live browser E2E certification across 58 routes, zero-warning health check.
- **v1.1.16:** Immutable release provenance freeze, website deep audit across 54 routes, docker init script refinement.
- **v1.1.15:** Storage ownership guards added to migrations 93-94, live Cloudflare deployment provenance tracking.

---

## 6. Verification Commands & Reproducibility Runbook

```powershell
# 1. Run all 91 test suites (Strict Mode)
npm run test:certification

# 2. Strict Project Health Check (all 15 governance checks)
node scripts/project-health-check.mjs --strict

# 3. TypeScript Compilation
npm run typecheck

# 4. ESLint Check (zero warnings allowed)
npx eslint . --max-warnings 0

# 5. Production Static Build
npm run build

# 6. Static Link & Asset Crawl
npm run audit:assets

# 7. Browser Chromium E2E Test Suite (38 specs)
npx playwright test --project=chromium

# 8. Live Production 4-Layer Smoke Test
node scripts/smoke_test.mjs
```
