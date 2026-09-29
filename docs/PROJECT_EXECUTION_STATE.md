# OHMS Project Execution State Ledger

**Last Updated:** 2026-09-30T05:00:00+06:00  
**Platform Version:** `1.1.20`  
**Git Branch:** `main`  
**Git Tag:** `v1.1.20` (Immutable Release Provenance Freeze)  
**Release Commit:** 57a9021f84400801048f4de14ea362bbe81b6f7b (Base)  
**Canonical Production Host:** `https://onnesha-hospital.pages.dev`  
**Cloudflare Pages Project:** `onnesha-hospital`  
**Supabase Production Database:** `iuhtzahuszdkdarhxobx.supabase.co` (94 Migrations in 100% Parity)  
**Release Governance State:** `SOFTWARE ENGINEERING COMPLETE — 14 OWNER GATES PENDING`  

---

## 1. Executive Summary & Zero False Green Policy

This state ledger provides the persistent, authoritative single source of truth for the Onnesha Hospital Management System (OHMS). Under the Antigravity Autonomous Engineering Swarm Constitution, zero false greens are permitted. Engineering capabilities are certified strictly by deterministic automated test suites, typechecks, linters, static builds, and live edge smoke tests. External physical dependencies and operational credentials outside code repository jurisdiction are categorized honestly as **Owner Action Required**.

---

## 2. Core Repository Metrics & Artifact Baseline (v1.1.20)

| Metric | Measured Value | Standard / Target | Status |
|:---|:---|:---|:---|
| **Repository Version** | `1.1.20` | Synchronized across 6 config files | ✅ Synchronized |
| **Total Test Suites** | `91 suites` | 100% of discovered test files passing | ✅ 91 / 91 Passing |
| **Active Test Passes** | `794 tests` | 0 failures, 0 regressions | ✅ 794 Active Passes |
| **Standard Skips** | `6 tests` | Explicitly justified environmental skips | ✅ 6 Standard Skips |
| **Browser E2E Tests** | `38 specs` | 100% pass on Chromium live against edge | ✅ 38 / 38 Passing |
| **Public Route Accessibility**| `28 specs` | 100% pass across 4 browser engines | ✅ 28 / 28 Passing |
| **Database Migrations** | `94 files` | Idempotent, sequential, fail-closed SQL | ✅ 94 Migrations (100% Remote Parity) |
| **TypeScript (tsc)** | `0 errors` | `tsc --noEmit` clean exit code 0 | ✅ Zero Errors |
| **ESLint** | `0 warnings` | `eslint . --max-warnings 0` exit code 0 | ✅ Zero Warnings |
| **Static Next.js Build** | `output: "export"` | 58 routes prerendered (56 HTML + sitemap.xml) | ✅ Clean Build |
| **Static Link & Asset Crawl** | `npm run audit:assets` | 0 broken references across 382 files | ✅ Zero Broken Links |
| **Service Worker Safety** | `public/sw.js` | 16 clinical/financial NEVER_CACHE rules | ✅ Verified Shielded |
| **Security Headers** | `public/_headers` | HSTS (1 yr), CSP (0 unsafe-eval), X-Frame DENY | ✅ Verified |
| **Docker Topology & Init** | `docker-compose.yml` | Deterministic `init-postgres.sh` (no ls parsing) | ✅ Verified (6/6) |

---

## 3. Provenance & Live Edge Alignment

| Environment | Current Served Version | Expected Source Branch / Tag | Alignment Status |
|:---|:---|:---|:---|
| **Local Repository HEAD** | `v1.1.20` | `main` | ✅ Synchronized |
| **Remote GitHub (`origin`)** | `v1.1.20` | `origin/main` | ✅ Synchronized |
| **Remote SSH (`ssh-origin`)** | `v1.1.20` | `ssh-origin/main` | ✅ Synchronized |
| **Cloudflare Pages Production** | `v1.1.20` | `https://onnesha-hospital.pages.dev/` | ✅ Deployed & Verified |

> [!NOTE]
> The public Cloudflare Pages edge is verified serving version `1.1.20`. All public routes, 4 security smoke layers, HSTS, CSP, and X-Frame-Options DENY are live and verified. Remote Supabase (`iuhtzahuszdkdarhxobx`) has all 94 migrations applied in 100% parity.

---

## 4. Master 5-Gate Final Closure Matrix

| # | Gate Name | Technical & Governance Mandate | Current Measured State | Status |
|:---|:---|:---|:---|:---|
| **1** | **Staging Live Security Gate + Full CI** | Hermetic `Mandatory CI` passing with zero errors; fail-closed `Dedicated Staging Live Security Gate` pending real staging secrets | `Mandatory CI` = SUCCESS (TypeScript, ESLint, Audit, Build, 91-Suite Test, Playwright Matrix); Staging Gate = Fail-Closed | 🟡 OWNER GATE (Staging Secrets) |
| **2** | **Release Provenance Freeze** | Elevate to `v1.1.20` across all 6 manifests, commit once, create immutable tag `v1.1.20` without `--force`, deploy exact SHA to Cloudflare Pages | Synchronized across `package.json`, `package-lock.json`, `Cargo.toml`, `tauri.conf.json`, `latest.json`, `Dockerfile` | ✅ FROZEN & VERIFIED |
| **3** | **Supabase Production Dashboard & Security** | Verify Security Advisor (0 critical errors), RLS on all tenant tables, SSL enforced, daily backups active | 94/94 migrations applied remotely (`npx supabase migration list`); `medical-documents-vault` storage role-guarded | 🟡 OWNER GATE (Dashboard Operations) |
| **4** | **Future Custom Domain (`onneshahospital.com`)** | Custom apex domain delegation. Domain activation requires Cloudflare zone/nameserver configuration by owner. | Canonical host locked at `https://onnesha-hospital.pages.dev`. Custom domain is explicitly DEFERRED. | 🔵 DEFERRED (Future Workstream) |
| **5** | **Live Commercial Integrations & Hardware** | Software tokenized engines, outbox tables, and POS print CSS fully implemented. Live merchant keys & USB hardware pending owner activation. | bKash/Nagad/SSLCommerz, SMS Gateway, Meta WhatsApp, and USB 80mm thermal receipt printer | 🟡 OWNER GATE (Merchant Keys & Hardware) |

---

## 5. Architectural Correctness & Audit Log

### Active Release: v1.1.20 Hardening & Reconciled Provenance
1. **Workflow Dynamic Step Descriptions (CICD-002):**
   - Replaced hardcoded `(86 Suites)` with dynamic description in `.github/workflows/deploy.yml`.
2. **Machine-Readable Ledger Alignment:**
   - Synchronized all 68 metrics fields in accordance with Section 68 of the Final Permanent Master Execution Constitution.
3. **Manifest Version Synchronization:**
   - Synchronized `package.json`, `package-lock.json`, `Cargo.toml`, `tauri.conf.json`, `latest.json`, `Dockerfile` to `1.1.20`.

### Historical Milestones (v1.1.15 – v1.1.19)
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
