# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## AUTHORITATIVE PRODUCTION CONTINUITY LEDGER (v1.0.8)

**Document Ref:** `docs/OHMS-CONTINUITY-LEDGER.md`  
**Last Verified Timestamp:** `2026-09-21T01:30:00+06:00`  
**Auditor:** Senior Full-Stack & Release Engineer (Antigravity)  
**Standard:** Strict Granular Truth & Zero Fabrication

---

### 1. Authoritative Identity & Lineage

| Attribute | Verified Value | Evidence Method |
|---|---|---|
| **Repository** | `Adnin1/onnesha-hospital` | `git remote -v` |
| **Active Branch** | `main` | `git branch --show-current` |
| **Local HEAD SHA** | `39728c93b67e28daf705ef61890c1790c958fa70` | `git rev-parse HEAD` |
| **Remote origin/main** | `39728c93b67e28daf705ef61890c1790c958fa70` | `node scripts/git-sync.mjs ls-remote` |
| **Remote ssh-origin/main**| `39728c93b67e28daf705ef61890c1790c958fa70` | `node scripts/git-sync.mjs ls-remote` |
| **Active Release Tag** | `v1.0.8` $\rightarrow$ `39728c93b67e28daf705ef61890c1790c958fa70` | `git rev-parse 'v1.0.8^{commit}'` |
| **Historical Tag v1.0.7 Target** | `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse 'v1.0.7^{commit}'` |
| **Historical Tag v1.0.6 Target** | `cab210cba268e85f5a7c5d759e38874b897cd827` | `git rev-parse 'v1.0.6^{commit}'` |
| **Historical Tag v1.0.5 Target** | `208c37b89ad3fa601f9a7114cf0d26016a14d300` | `git rev-parse 'v1.0.5^{commit}'` |
| **Working Tree State** | `CLEAN` (commit-dirty = false) | `git status --porcelain` |

---

### 2. Edge Runtime & Deployment (Cloudflare Pages)

| Endpoint | Target URL | HTTP Status | Cloudflare Ray ID | Content & Artifact Status |
|---|---|---|---|---|
| **Production Canonical** | `https://onnesha-hospital.pages.dev` | 200 OK | `a3e33e200ca6dd0d-DAC` | All pricing purged; dynamic doctor visiting hours live |
| **Direct Deployment Preview** | `https://ff3acec6.onnesha-hospital.pages.dev` | 200 OK | Wrangler deploy output | Verified matching commit `39728c9` |
| **Desktop Manifest (latest.json)** | `https://onnesha-hospital.pages.dev/downloads/desktop/latest.json` | 200 OK | `a3e33e200ca6dd0d-DAC` | Version: `1.0.8`, JSON valid, matching checksums |
| **Windows Setup Installer (.exe)** | `https://onnesha-hospital.pages.dev/downloads/desktop/Onnesha-Hospital-Setup-1.0.8.exe` | 200 OK | `a3e33e2a0887d4ed-DAC` | 2,996,122 bytes (`application/octet-stream`), authentic NSIS 3.10 bundle |
| **Windows MSI Package (.msi)** | `https://onnesha-hospital.pages.dev/downloads/desktop/Onnesha-Hospital-1.0.8.msi` | 200 OK | `a3e33e21ea65dd0d-DAC` | 3,477,504 bytes (`application/octet-stream`), authentic WiX 3.11 bundle |

---

### 3. Cryptographic Artifact Checksums (SHA-256)

| Binary File | Size (Bytes) | SHA-256 Checksum | Origin Compiler |
|---|---|---|---|
| `Onnesha-Hospital-Setup-1.0.8.exe` | 2,996,122 | `42E0B1416B1FEF7D92EC682F7DF9BF881F9CEE598DE9885A6920CDD794827A0D` | NSIS 3.10 (`makensis.exe`) |
| `Onnesha-Hospital-1.0.8.msi` | 3,477,504 | `0F54B6344CC5AC42FE8A81843B1494BF2137BA7460678E6A4A63309863D75E2A` | WiX Toolset 3.11 (`candle` + `light`) |
| `latest.json` | 798 | `29FE025A720AD38DABFF6F44408BD543467B9946B2AF5005A4FED38AC5FB071A` | UTF-8 JSON Manifest |

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
| **Total Test Cases** | 424 (418 passed, 6 standard skipped) | `npm test` |
| **Playwright Browser E2E** | 19 specs executed, 19 passed | `npx playwright test --project=chromium` |
| **Production Smoke Test** | 15/15 routes, 4/4 shells, 3/3 table shields, 2/2 RPC shields | `node scripts/smoke_test.mjs` |

---

### 6. External Dependencies & Blockers

| ID | Description | Reason | Owner Action Required |
|---|---|---|---|
| **ED-001** | GitHub Branch Protection / Rulesets | Deploy key lacks admin repo scope (`403 Forbidden`) | Owner to configure via GitHub Web UI: Settings $\rightarrow$ Rulesets $\rightarrow$ Protect `main` |
| **ED-002** | Live SSLCommerz Merchant Key | Real gateway transactions require live merchant terminal credentials | Owner to provide live `SSLCOMMERZ_STORE_ID` & password in Supabase secrets |
| **ED-003** | Staging Dedicated Credentials | Automated cross-tenant mutating CI requires non-production Supabase instance | Optional: Owner to add `OHMS_TEST_SUPABASE_URL` in GitHub Secrets |
| **ED-004** | Cloudflare CI API Token | Direct automated deployment from GitHub Actions requires repository secret | Optional: Owner to add `CLOUDFLARE_API_TOKEN` & `CLOUDFLARE_ACCOUNT_ID` to GitHub Secrets |
