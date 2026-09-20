# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## AUTHORITATIVE PRODUCTION CONTINUITY LEDGER

**Document Ref:** `docs/OHMS-CONTINUITY-LEDGER.md`  
**Last Verified Timestamp:** `2026-09-20T19:07:30+06:00`  
**Auditor:** Senior Full-Stack & Release Engineer (Antigravity)  
**Standard:** Strict Granular Truth & Zero Fabrication

---

### 1. Authoritative Identity & Lineage

| Attribute | Verified Value | Evidence Method |
|---|---|---|
| **Repository** | `Adnin1/onnesha-hospital` | `git remote -v` |
| **Active Branch** | `main` | `git branch --show-current` |
| **Local HEAD SHA** | `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse HEAD` |
| **Remote origin/main** | `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse origin/main` |
| **Remote ssh-origin/main**| `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse ssh-origin/main` |
| **Current Tag** | `v1.0.7` | `git tag --list` |
| **Tag Dereferenced SHA**| `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse 'v1.0.7^{commit}'` |
| **Historical v1.0.6 SHA**| `cab210cba268e85f5a7c5d759e38874b897cd827` | `git rev-parse 'v1.0.6^{commit}'` |
| **Historical v1.0.5 SHA**| `208c37b89ad3fa601f9a7114cf0d26016a14d300` | `git rev-parse 'v1.0.5^{commit}'` |
| **Working Tree State** | `CLEAN` (commit-dirty = false) | `git status --porcelain` |

---

### 2. CI/CD & Build Pipeline

| Pipeline Run | Run ID | Target SHA | Status | Conclusion | Job Breakdown |
|---|---|---|---|---|---|
| **Latest CI (HEAD)** | `35512027913` (Run 59) | `dfed116...` | `completed` | `success` | Validate: `success`<br>Tauri: `success`<br>Staging Live: `success` (skipped notice)<br>Deploy: `success` (skipped notice) |
| **Prior CI** | `35511853236` (Run 58) | `58dff8c...` | `completed` | `success` | Validate: `success`<br>Tauri: `success`<br>Staging Live: `success`<br>Deploy: `success` |

---

### 3. Edge Runtime & Deployment (Cloudflare Pages)

| Endpoint | Target URL | HTTP Status | Cloudflare Ray ID | Content Status |
|---|---|---|---|---|
| **Production Canonical** | `https://onnesha-hospital.pages.dev` | 200 OK | `a3e10da7fb3ddd0d-DAC` | All pricing purged; dynamic schedules live |
| **Direct SHA Deployment** | `https://1a03770f.onnesha-hospital.pages.dev` | 200 OK | `a3e105fe8b7eb6db-DAC` | Verified matching commit `dfed116` |
| **Desktop Updater Manifest** | `https://onnesha-hospital.pages.dev/downloads/desktop/latest.json` | 200 OK | `a3e10da80e6833a4-DAC` | Version: `1.0.7` |

---

### 4. Database & Remote State (Supabase)

| Attribute | State | Verification Method |
|---|---|---|
| **Project Reference** | `iuhtzahuszdkdarhxobx` | `.env.local` / linked configuration |
| **Database Engine** | PostgreSQL 17.6 (`ap-southeast-1`) | Live connection |
| **Active Migrations** | `46/46` Synchronized (0 drift) | `npx supabase migration list` |
| **Schema Linter** | `0 errors` across extensions/private/public | `npx supabase db lint --linked` |
| **Tenant Resolver** | `private.get_current_org_id()` SECURITY DEFINER | Migration 46 live in catalog |
| **Public Stub** | `public.get_current_org_id()` non-SECURITY DEFINER, restricted | Migration 46 live in catalog |

---

### 5. Test Suite Verification Metrics

| Metric | Measured Value | Command |
|---|---|---|
| **TypeScript Compilation** | 0 errors | `npm run typecheck` |
| **ESLint Gate** | 0 warnings, 0 errors | `npx eslint . --max-warnings 0` |
| **Dependency Security** | 0 vulnerabilities | `npm audit --audit-level=high` |
| **Total Test Suites** | 48 discovered, 48 passed | `npm test` |
| **Total Test Cases** | 424 | `npm test` |
| **Passed Tests** | 418 | `npm test` |
| **Failed Tests** | 0 | `npm test` |
| **Skipped Tests** | 6 (explicitly classified rationale) | `npm test` |

---

### 6. External Dependencies & Blockers

| ID | Description | Reason | Owner Action Required |
|---|---|---|---|
| **ED-001** | GitHub Branch Protection / Rulesets | Deploy key lacks admin repo scope (`403 Forbidden`) | Owner to configure via GitHub Web UI: Settings $\rightarrow$ Rulesets $\rightarrow$ Protect `main` |
| **ED-002** | Live SSLCommerz Merchant Key | Real gateway transactions require live merchant terminal credentials | Owner to provide live `SSLCOMMERZ_STORE_ID` & password in Supabase secrets |
| **ED-003** | Staging Dedicated Credentials | Automated cross-tenant mutating CI requires non-production Supabase instance | Optional: Owner to add `OHMS_TEST_SUPABASE_URL` in GitHub Secrets |
