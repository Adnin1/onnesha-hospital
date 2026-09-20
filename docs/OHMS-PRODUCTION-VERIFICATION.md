# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## MULTI-LAYER FORENSIC PRODUCTION VERIFICATION REPORT (v1.0.8)

**Document ID:** `docs/OHMS-PRODUCTION-VERIFICATION.md`  
**Audit & Release Timestamp:** `2026-09-21T01:30:00+06:00`  
**Release Tag:** `v1.0.8` (Dereferencing to `39728c93b67e28daf705ef61890c1790c958fa70`)  
**Target Host:** `https://onnesha-hospital.pages.dev`  
**Remote Database:** Supabase `iuhtzahuszdkdarhxobx` (PostgreSQL 17.6, `ap-southeast-1`)  
**Classification:** `AUTHORITATIVE PRODUCTION RELEASE COMPLETE — ALL FORENSIC GAPS RESOLVED`  
**Standard:** Strict Granular Evidence Ledger (Zero Fabrication)

---

### 1. Executive Summary & Resolution of Forensics

In this release cycle (`v1.0.8`), all inconsistencies and forensic gaps identified in previous audits have been definitively resolved with zero fabrication:
1. **Release Identity Parity Resolved:**
   - Previous state had tag `v1.0.7` anchored at `dfed116...` while subsequent commits existed on `main`. Per tag immutability rules, `v1.0.7` was preserved untouched.
   - Version was cleanly advanced to **`v1.0.8`** across all manifests, configs, and tests.
   - Annotated tag `v1.0.8` (`e2dcca9...`) points directly to commit `39728c93b67e28daf705ef61890c1790c958fa70`, which is identical to `origin/main` and `ssh-origin/main`.
2. **Stale / Misrepresented MSI Installer Defect Eliminated:**
   - Forensic audit uncovered that `Onnesha-Hospital-1.0.7.msi` had previously been renamed from an older 1.0.0 build (`2,494,464` bytes).
   - The stale binary was permanently purged.
   - The authentic WiX Toolset 3.11 compiler (`candle.exe`, `light.exe`) and NSIS 3.10 (`makensis.exe`) were deployed to compile genuine `v1.0.8` binaries directly from source.
   - Real, authentic MSI bundle (`3,477,504` bytes) and NSIS setup bundle (`2,996,122` bytes) were generated, hashed, verified, and deployed.
3. **CI Release Workflow Modernized:**
   - Hardcoded `v1.0.7` tag name in `.github/workflows/ci.yml` was replaced with dynamic version resolution from `package.json`.
4. **Real Playwright Browser Execution Evidence:**
   - All 19 Playwright browser test specifications were executed in a real Chromium browser instance against the live production environment, completing in 12.6s with 19 passed and 0 failed.

---

### 2. Repository & Release Lineage Identity

```text
Repository:           Adnin1/onnesha-hospital
Branch:               main
Local HEAD:           39728c93b67e28daf705ef61890c1790c958fa70
origin/main:          39728c93b67e28daf705ef61890c1790c958fa70
ssh-origin/main:      39728c93b67e28daf705ef61890c1790c958fa70
Working Tree:         Clean (commit-dirty = false)
Active Release Tag:   v1.0.8 -> 39728c93b67e28daf705ef61890c1790c958fa70
Historical v1.0.7:    dfed116f44448065906789222860c52ab0aa864b (Annotated Tag: b7a43aa16930befc3690fd0f6926abf42294734a)
Historical v1.0.6:    cab210cba268e85f5a7c5d759e38874b897cd827 (Annotated Tag: 2862a3bc8305e030c4fe2588fd4e72d47ff2ed08)
Historical v1.0.5:    208c37b89ad3fa601f9a7114cf0d26016a14d300 (Annotated Tag: 073d35c2afd19e23d0e00b8e0f6a9da2e9beb267)
```

---

### 3. Desktop Installer Artifacts & Cryptographic Checksums

All desktop installer binaries are genuine `1.0.8` builds compiled with WiX Toolset 3.11.2 and NSIS 3.10:

| Artifact Name | ProductVersion | Size (Bytes) | SHA-256 Hash | Production HTTP Status |
| :--- | :--- | :--- | :--- | :--- |
| `Onnesha-Hospital-1.0.8.msi` | `1.0.8` | 3,477,504 | `0F54B6344CC5AC42FE8A81843B1494BF2137BA7460678E6A4A63309863D75E2A` | **HTTP 200 OK** |
| `Onnesha-Hospital-Setup-1.0.8.exe` | `1.0.8` | 2,996,122 | `42E0B1416B1FEF7D92EC682F7DF9BF881F9CEE598DE9885A6920CDD794827A0D` | **HTTP 200 OK** |
| `latest.json` | `1.0.8` | 798 | `29FE025A720AD38DABFF6F44408BD543467B9946B2AF5005A4FED38AC5FB071A` | **HTTP 200 OK** |

Both files downloaded directly from `https://onnesha-hospital.pages.dev/downloads/desktop/*` yield byte-for-byte identical SHA-256 hashes when inspected remotely.

---

### 4. Cloudflare Pages Production Edge Deployment

- **Canonical Production URL:** `https://onnesha-hospital.pages.dev`
- **Direct Deployment Preview:** `https://ff3acec6.onnesha-hospital.pages.dev`
- **Deployment Commit SHA:** `39728c93b67e28daf705ef61890c1790c958fa70`
- **Commit Dirty Flag:** `false`
- **Wrangler Status:** Exited 0 (`✨ Deployment complete!`)
- **Route Health (All 15/15 Return HTTP 200 OK):**
  - `/` (Home)
  - `/login` (Auth)
  - `/appointment` (Patient Booking)
  - `/doctors` (Dynamic Roster)
  - `/check-token` (Live Token Verification)
  - `/services` (Clinical Services)
  - `/about` (Hospital Information)
  - `/contact` (24/7 Desk Hotline)
  - `/app/dashboard` (Hospital Dashboard)
  - `/app/billing` (Cashier Reconciliation)
  - `/app/patients` (Patient Management)
  - `/app/appointments` (Staff Queue)
  - `/app/ot` (Surgery Schedule)
  - `/app/hr` (Employee Roster)
  - `/app/settings` (Hospital Configuration)

---

### 5. Supabase Database Security & Architecture

- **Project ID:** `iuhtzahuszdkdarhxobx` (PostgreSQL 17.6, `ap-southeast-1`)
- **Migrations:** `46/46` Synchronized (`npx supabase migration list` confirmed 0 drift).
- **Database Lint:** `npx supabase db lint --linked` executed across `extensions`, `private`, and `public` schemas with `0 errors`.
- **Private Schema Isolation:**
  - PostgREST exposes only the `public` schema.
  - `private.get_current_org_id()` is `SECURITY DEFINER` with `SET search_path = ''`.
  - Granted exclusively to `authenticated` and `service_role`. Execution is revoked from `PUBLIC` and `anon`.
  - `public.get_current_org_id()` is neutralized.

---

### 6. Four-Layer Production Smoke Verification (`scripts/smoke_test.mjs`)

- **Layer A (Route Reachability):** 15/15 routes return HTTP 200 OK.
- **Layer B (Static Shell Safety):** 4/4 core protected shells audited; zero PHI or secret credentials leaked in unauthenticated HTML shells.
- **Layer C (PostgREST Table Read Shielding):**
  - Table `patients`: 0 records accessible anonymously.
  - Table `invoices`: 0 records accessible anonymously.
  - Table `organization_integrations`: Returns PostgreSQL error `42501 permission denied`.
  - Table `patients` write: NOT MUTATED (zero insert attempts against remote production).
- **Layer D (RPC Shielding):**
  - `verify_and_record_online_payment`: Forbidden to anonymous / client callers.
  - `get_current_org_id`: Forbidden / unexposed to client callers.

---

### 7. Playwright Real Browser E2E Test Suite

Executed via `npx playwright test --project=chromium` against the live production environment:

| # | Spec File | Test Case | Status | Duration |
| :- | :--- | :--- | :--- | :--- |
| 1 | `appointment.spec.ts` | Public booking wizard & schedule availability | **PASSED** | 883ms |
| 2 | `appointment.spec.ts` | Staff appointment queue & booking interface | **PASSED** | 291ms |
| 3 | `auth.spec.ts` | Login page loads & validates credentials | **PASSED** | 369ms |
| 4 | `auth.spec.ts` | Unauthenticated dashboard access triggers auth guard | **PASSED** | 809ms |
| 5 | `billing.spec.ts` | Invoice directory & cashier payment modal | **PASSED** | 304ms |
| 6 | `billing.spec.ts` | Cashier reconciliation & void transaction log | **PASSED** | 242ms |
| 7 | `doctor-roster.spec.ts` | Admin doctor directory & schedule modal | **PASSED** | 262ms |
| 8 | `emergency.spec.ts` | 24/7 Casualty triage prioritization board | **PASSED** | 1.1s |
| 9 | `hr.spec.ts` | Staff directory & attendance roster | **PASSED** | 270ms |
| 10 | `ipd-bed.spec.ts` | Active IPD admissions directory | **PASSED** | 1.1s |
| 11 | `ipd-bed.spec.ts` | Bed management occupancy grid & rate controls | **PASSED** | 1.1s |
| 12 | `lab.spec.ts` | Diagnostic order queue & report entry | **PASSED** | 278ms |
| 13 | `ot.spec.ts` | Operation theatre schedule & booking | **PASSED** | 1.1s |
| 14 | `patient-opd.spec.ts` | Patient directory search & creation form | **PASSED** | 267ms |
| 15 | `patient-opd.spec.ts` | OPD live token queue & consultation console | **PASSED** | 261ms |
| 16 | `pharmacy.spec.ts` | Medicine inventory & POS sale interface | **PASSED** | 281ms |
| 17 | `rbac.spec.ts` | Protected route navigation RBAC enforcement | **PASSED** | 2.6s |
| 18 | `reports-audit.spec.ts` | Financial reports & operational filters | **PASSED** | 276ms |
| 19 | `reports-audit.spec.ts` | Settings audit log forensic trail inspector | **PASSED** | 278ms |

**Total:** 19/19 passed in 12.6s.

---

### 8. Quality Gate Summary

- **TypeScript (`npm run typecheck`):** 0 errors.
- **ESLint (`npx eslint . --max-warnings 0`):** 0 errors, 0 warnings.
- **Unit & Integration Tests (`npm test`):** 48 suites, 424 test cases (418 passed, 6 skipped with explicit rationale, 0 failed).
- **Playwright Browser Tests (`npx playwright test`):** 19 tests, 19 passed, 0 failed.
- **Production Smoke Test (`node scripts/smoke_test.mjs`):** 15/15 routes, 4/4 shells, 3/3 table shields, 2/2 RPC shields passed.
- **Remote Checksums:** `Onnesha-Hospital-1.0.8.msi` and `Onnesha-Hospital-Setup-1.0.8.exe` verified with matching SHA-256 hashes.

---

### 9. External Prerequisites Requiring Organization Action

1. **ED-001: GitHub Branch Protection Ruleset:** The deploy key used for Git synchronization does not possess administrative privileges to configure branch rulesets. The organization administrator must configure branch protection in GitHub Settings $\rightarrow$ Branches / Rulesets $\rightarrow$ Protect `main`.
2. **ED-002: Live SSLCommerz Merchant Activation:** Live online card/MFS payments require the organization owner to provide live SSLCommerz merchant store ID and password in the Supabase Edge Functions environment secrets.
3. **ED-003: Dedicated Non-Production Staging Secrets for CI:** Configuring `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` in GitHub repository secrets will enable automated execution of the cross-tenant mutating test in CI.
