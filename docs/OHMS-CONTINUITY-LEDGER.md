# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## AUTHORITATIVE PRODUCTION CONTINUITY LEDGER

**Document Ref:** `docs/OHMS-CONTINUITY-LEDGER.md`  
**Last Verified Timestamp:** `2026-09-20T20:14:00+06:00`  
**Auditor:** Senior Full-Stack & Release Engineer (Antigravity)  
**Standard:** Strict Granular Truth & Zero Fabrication

---

### 1. Authoritative Identity & Lineage

| Attribute | Verified Value | Evidence Method |
|---|---|---|
| **Repository** | `Adnin1/onnesha-hospital` | `git remote -v` |
| **Active Branch** | `main` | `git branch --show-current` |
| **Local HEAD SHA** | `60a6dae2fab50b24c957579ca2d0d7cbbf21f0fc` | `git rev-parse HEAD` |
| **Remote origin/main** | `60a6dae2fab50b24c957579ca2d0d7cbbf21f0fc` | `git rev-parse origin/main` |
| **Remote ssh-origin/main**| `60a6dae2fab50b24c957579ca2d0d7cbbf21f0fc` | `git rev-parse ssh-origin/main` |
| **Tag v1.0.7 Target** | `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse 'v1.0.7^{commit}'` |
| **Historical v1.0.6 SHA**| `cab210cba268e85f5a7c5d759e38874b897cd827` | `git rev-parse 'v1.0.6^{commit}'` |
| **Historical v1.0.5 SHA**| `208c37b89ad3fa601f9a7114cf0d26016a14d300` | `git rev-parse 'v1.0.5^{commit}'` |
| **Working Tree State** | `CLEAN` (commit-dirty = false) | `git status --porcelain` |

---

### 2. CI/CD & Build Pipeline Status

| Pipeline Run | Run ID | Target SHA | Status | Conclusion | Job Breakdown |
|---|---|---|---|---|---|
| **Active CI Run** | `35515766920` (Run 61) | `60a6dae...` | `in_progress` | Pending terminal conclusion | Typecheck, Lint, Audit, Test & Build: in progress |
| **Authoritative Completed CI** | `35512729572` (Run 60) | `83b8b17...` | `completed` | `success` | Validate: `success`<br>Tauri Windows Desktop: `success`<br>Staging Live: `success` (notice skipped)<br>Deploy: `success` (notice skipped) |
| **Prior CI Baseline** | `35512027913` (Run 59) | `dfed116...` | `completed` | `success` | Validate: `success`<br>Tauri: `success`<br>Staging: `success`<br>Deploy: `success` |

---

### 3. Edge Runtime & Deployment (Cloudflare Pages)

| Endpoint | Target URL | HTTP Status | Cloudflare Ray ID | Content & Artifact Status |
|---|---|---|---|---|
| **Production Canonical** | `https://onnesha-hospital.pages.dev` | 200 OK | `a3e16e399ee1dd0d-DAC` | All pricing purged; dynamic doctor visiting hours live |
| **Direct SHA Deployment** | `https://cf9f0772.onnesha-hospital.pages.dev` | 200 OK | `a3e16e37795dd4ed-DAC` | Verified matching commit `60a6dae` |
| **Desktop Updater Manifest** | `https://onnesha-hospital.pages.dev/downloads/desktop/latest.json` | 200 OK | `a3e16e399ee1dd0d-DAC` | Version: `1.0.7`, JSON valid |
| **Windows Setup Installer (.exe)** | `https://onnesha-hospital.pages.dev/downloads/desktop/Onnesha-Hospital-Setup-1.0.7.exe` | 200 OK | `a3e16e37795dd4ed-DAC` | 2,990,080 bytes (`application/octet-stream`) |
| **Windows MSI Package (.msi)** | `https://onnesha-hospital.pages.dev/downloads/desktop/Onnesha-Hospital-1.0.7.msi` | 200 OK | `a3e16e38afcf33a4-DAC` | 2,494,464 bytes (`application/octet-stream`) |

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
| **ED-004** | Cloudflare CI API Token | Direct automated deployment from GitHub Actions requires repository secret | Optional: Owner to add `CLOUDFLARE_API_TOKEN` & `CLOUDFLARE_ACCOUNT_ID` to GitHub Secrets |
