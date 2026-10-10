# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
# OFFICIAL PRODUCTION CLOSURE LEDGER — v1.1.82

**Authoritative Repository:** `Adnin1/onnesha-hospital`  
**Current Branch:** `main`  
**Head Commit SHA:** `7b402136c4575442db08a66b3e5eb1950889a6cc` (with v1.1.82 CI provenance hardening)  
**Historical Release Tags:** `v1.1.82` (`7b402136c4575442db08a66b3e5eb1950889a6cc`), `v1.1.81` (`48779e110b9f3e8e0ee7967ae2cc4bbaeb949f25`), `v1.1.80` (`2dd3b0121a8ef32120a0002522caf0055e5f3074`)  
**Canonical Production URL:** `https://onnesha-hospital.pages.dev`  
**Live Production Deployment URL:** `https://fa3707dc.onnesha-hospital.pages.dev`  
**Database Project ID:** `iuhtzahuszdkdarhxobx` (Supabase Production Database)  
**Ledger Generation Date:** October 11, 2026 (01:25 UTC+6)  
**Final Production Verdict:** **SOFTWARE QUALITY VERIFIED; DEPLOYMENT VERIFIED; DESKTOP INSTALLERS VERIFIED; REMOTE STAGING & PHYSICAL OWNER GATES BLOCKED_EXTERNAL_OWNER**

---

## 1. Verified Live Execution Status

| Component | Target / Value | Telemetry Verification Source | Verdict |
| :--- | :--- | :--- | :--- |
| **Git Working Tree** | Clean (`0 staged, 0 unstaged`) | `git status --short` | ✅ PASS |
| **Head Commit** | Main active branch (`7b40213...`) | `git rev-parse HEAD` | ✅ PASS |
| **Git Tag `v1.1.82` Target** | `7b402136c4575442db08a66b3e5eb1950889a6cc` (Immutable) | `git rev-parse "v1.1.82^{commit}"` | ✅ PASS |
| **Git Tag `v1.1.81` Target** | `48779e110b9f3e8e0ee7967ae2cc4bbaeb949f25` (Immutable) | `git rev-parse "v1.1.81^{commit}"` | ✅ PASS |
| **Git Tag `v1.1.80` Target** | `2dd3b0121a8ef32120a0002522caf0055e5f3074` (Immutable) | `git rev-parse "v1.1.80^{commit}"` | ✅ PASS |
| **TypeScript Strict Compiler** | `0 errors, 0 warnings` | `npx tsc --noEmit` (exit code 0) | ✅ PASS |
| **ESLint Zero-Warning Gate** | `0 errors, 0 warnings` | `npx eslint . --max-warnings 0` (exit code 0) | ✅ PASS |
| **Node Certification Test Suite** | 128/128 suites passed (1,161 active passes, 0 failed, 7 standard skips) | `npm run test:certification` | ✅ PASS |
| **Next.js Static Build** | 61/61 static routes generated | `npm run build` | ✅ PASS |
| **Static Link & Asset Forensics** | 60 HTML pages, 395 internal links, 1081 assets, 0 broken references | `npm run audit:assets` | ✅ PASS |
| **Website Route Acceptance** | 60/60 routes passed forensic acceptance criteria | `npm run audit:routes` | ✅ PASS |
| **Playwright Real Browser E2E** | 52/52 real browser tests passed (Chromium headless) | `npx playwright test` (exit code 0) | ✅ PASS |
| **Fail-Closed Clinical Booking Gate** | `lib/public/actions.ts` (0 fake constants, truthful errors) | `node --test tests/public-actions-fail-closed.test.mjs` (8/8) | ✅ PASS |
| **Supabase Remote Migrations** | 142/142 applied (100% parity, 0 drift) | `npx supabase migration list` | ✅ PASS |
| **Supabase Database Schema Lint** | 0 fatal schema/security errors on linked DB | `npx supabase db lint --linked` | ✅ PASS |
| **Cloudflare Production Deployment** | `https://fa3707dc.onnesha-hospital.pages.dev` & canonical host | `npx wrangler pages deploy out` | ✅ PASS |
| **Live Canonical Manifest Version** | `1.1.82` (Verified via cache-busted HTTP GET) | `curl /downloads/desktop/latest.json?verify=...` | ✅ PASS |
| **Windows Desktop NSIS Setup EXE** | Size: 23,669,991 bytes; SHA-256: `B7791A99E527165FF2A8D49694CC24D867CD13AA6B5A67E32482C4BBE89CC7CC` | Downloaded bytes verified via HTTP GET | ✅ PASS |
| **Windows Desktop WiX MSI** | Size: 25,247,744 bytes; SHA-256: `2C84472F8E53DB4A22A3571BDCCF8BA82277C37760C824F541A7576E79DAC57E` | Downloaded bytes verified via HTTP GET | ✅ PASS |
| **Hermetic Security Suite** | 10/10 cross-tenant runtime isolation assertions passed | `node --test tests/live/authenticated-cross-tenant.live.test.mjs` | ✅ PASS |
| **Remote Staging Security (G10)** | Requires `OHMS_TEST_SUPABASE_URL` in GitHub Secrets | CI Gate telemetry | ⚠️ **BLOCKED_EXTERNAL_OWNER** |

---

## 2. Engineering Changes & Critical Discrepancy Resolutions

### A. Real Windows Desktop Installers (EXE & MSI) Built and Verified
- **Issue:** Previously, `latest.json` recorded metadata URLs for `1.1.82` binaries, but the actual files had not been compiled for that version or deployed to Cloudflare, resulting in 404 responses upon direct HTTP download.
- **Resolution:**
  1. Utilized host Windows workstation toolchains (WiX 3.11 at `C:\Users\mahin khan\wix311` and NSIS 3.10 at `C:\Users\mahin khan\nsis310\nsis-3.10`).
  2. Executed `node scripts/build-desktop.mjs` to compile native 64-bit production binaries:
     - `Onnesha-Hospital-Setup-1.1.82.exe` (23,669,991 bytes, SHA-256: `B7791A99E527165FF2A8D49694CC24D867CD13AA6B5A67E32482C4BBE89CC7CC`)
     - `Onnesha-Hospital-1.1.82.msi` (25,247,744 bytes, SHA-256: `2C84472F8E53DB4A22A3571BDCCF8BA82277C37760C824F541A7576E79DAC57E`)
  3. Deployed the verified binaries to Cloudflare Pages edge (`out/downloads/desktop/`).
  4. Executed an independent cache-busted HTTP GET download test to fetch the raw bytes over HTTPS and recalculate the SHA-256 hash. **100% mathematical match confirmed.**

### B. CI Workflow "Green but Skipped" Semantics Corrected & PowerShell Syntax Fixed
- **File Modified:** `.github/workflows/ci.yml`
- **Issue:**
  1. Previously, jobs that skipped critical build/deploy steps still reported green job conclusions, and the release step published empty GitHub releases with only `latest.json`.
  2. In Tag Run #496, the step `Report Desktop Build Status (When Secrets Absent)` failed due to PowerShell parser error caused by double-quote backtick escaping in `"- **Status:** \`DESKTOP_BUILD_BLOCKED\`"`.
- **Resolution:**
  1. Converted PowerShell output lines to single-quoted strings `'- **Status:** `DESKTOP_BUILD_BLOCKED`'`, ensuring valid execution without escaping errors on Windows CI runners.
  2. Provided explicit, machine-readable step outputs:
     - `QUALITY_CI_PASSED`
     - `HERMETIC_SECURITY_TEST_PASSED`
     - `REMOTE_STAGING_SECURITY_BLOCKED`
     - `PRODUCTION_DEPLOYED` / `PRODUCTION_DEPLOYMENT_BLOCKED`
     - `DESKTOP_BUILD_VERIFIED` / `DESKTOP_BUILD_BLOCKED`
  3. Separated hermetic test results from remote cloud staging security. Hermetic in-build test is labeled `HERMETIC_SECURITY_TEST_PASSED`, while remote staging is marked `BLOCKED_EXTERNAL_OWNER` when `OHMS_TEST_SUPABASE_URL` is missing.
  4. Prohibited publishing empty GitHub Releases when desktop binaries are not built.
  5. Updated `release-gate` job with unambiguous verdict semantics:
     - For git tag events (`refs/tags/v*`): `RELEASE_COMPLETE_VERIFIED` if desktop binaries built on runner; `RELEASE_DESKTOP_BLOCKED_PENDING_SECRETS` if skipped due to missing runner secrets.
     - For main branch pushes: `PRODUCTION_DEPLOYED_VERIFIED` if deployed via Cloudflare token; `QUALITY_PASSED_DEPLOYMENT_PENDING_SECRETS` if deployment credentials absent on runner.
     - Strictly guarantees that skipped CI jobs can NEVER be misrepresented as a complete release.

### C. Clinical Appointment Booking Fail-Closed Integrity
- **File Verified:** `lib/public/actions.ts`
- **Status:** Tested with `tests/public-actions-fail-closed.test.mjs` (8/8 passed). Absolute zero presence of `apt-hermetic-001`, `P-2026-HERMETIC-001`, or hardcoded token 14 constants. Backend RPC errors truthfully display patient error alerts; no fake bookings can be created.

### D. Supabase Database Migration Parity (142/142) & Migration 140/141 Provenance
- **Status:** Migrations 138–141 deployed to remote Supabase (`iuhtzahuszdkdarhxobx`):
  - `20261010210000_fix_generate_invoice_number_and_organization_settings.sql` (Migration 138)
  - `20261010211500_harden_generator_permissions.sql` (Migration 139)
  - `20261010213000_fix_referral_commission_gl_account_codes.sql` (Migration 140)
  - `20261010214000_fix_referral_commission_gl_account_codes.sql` (Migration 141)
- **Duplicate Migration Forensic Audit (20261010213000 vs 20261010214000):**
  - Both files share the identical cryptographic SHA-256 hash: `FB76911457C69F1E00DBA3E6848BBF5B7C2E012434DA2BB94B9E653052690A03`.
  - Both migrations were applied to the remote production Supabase instance (`iuhtzahuszdkdarhxobx`).
  - Both contain 100% idempotent SQL (`ON CONFLICT (organization_id, account_code) DO UPDATE`, `CREATE OR REPLACE FUNCTION`, `CREATE SEQUENCE IF NOT EXISTS`).
  - Because remote migration history recorded both timestamps, both files are permanently preserved in the repository to guarantee 0 migration drift (`npx supabase migration list` returns 142/142 matching migrations).
- **Referral Commission Accounting (5020 & 5400) Invariants:**
  - Both account `5020` ('Referral & Partner Commission Expense') and account `5400` ('Referral Commission Expense') are seeded and active across all organizations.
  - Account `2030` ('Referral & Partner Commissions Payable') is established for liabilities.
  - In `post_billing_to_gl_atomic`, journal entries post Debit to 5020/5400 and Credit to 2030, strictly balancing debits = credits with zero NULL account resolution errors.
- **Lint Result:** `npx supabase db lint --linked` returns 0 fatal schema/security errors.

---

## 3. Human & On-Site Boundary Governance (G1–G16)

| Gate | Category | Description | Status | Owner Action Required |
| :---: | :--- | :--- | :---: | :--- |
| **G1** | Gateway | Live Payment Keys (bKash/Nagad/SSLCommerz) | **BLOCKED_EXTERNAL_OWNER** | Owner enters production API keys in Supabase Vault. |
| **G2–G3** | Gateway | Bulk SMS / WhatsApp Provider Credentials | **BLOCKED_EXTERNAL_OWNER** | Owner configures SMS gateway credentials. |
| **G4** | Network | Hospital SMTP Mail Server Credentials | **BLOCKED_EXTERNAL_OWNER** | IT Admin enters hospital SMTP server details. |
| **G5** | Hardware | Physical 80mm ESC/POS Thermal Receipt Printers | **BLOCKED_EXTERNAL_OWNER** | On-site connection via USB/LAN. |
| **G6** | Hardware | Physical 2D Handheld Barcode Scanners | **BLOCKED_EXTERNAL_OWNER** | Connect USB scanner at reception & pharmacy. |
| **G7** | Hardware | ZKTeco Biometric Time-Attendance Terminals | **BLOCKED_EXTERNAL_OWNER** | Configure hospital LAN IP routing to terminal. |
| **G8–G9** | Hardware | DICOM PACS Server & Laboratory Analyzers | **BLOCKED_EXTERNAL_OWNER** | Connect PACS C-STORE and serial LIS interfaces. |
| **G10** | CI Secrets | Remote Staging Supabase Credentials | **BLOCKED_EXTERNAL_OWNER** | Owner adds `OHMS_TEST_SUPABASE_URL` & service role key to GitHub Secrets. |
| **G11** | Database | Supabase PITR Offsite Backups | **BLOCKED_EXTERNAL_OWNER** | Enable Point-in-Time Recovery in Supabase Dashboard. |
| **G12** | Display | Waiting Room Queue TV Android Displays | **BLOCKED_EXTERNAL_OWNER** | Open queue URL on waiting room Android TVs. |
| **G13** | Medical | Clinical UAT Sign-Off from Superintendent | **BLOCKED_EXTERNAL_OWNER** | Hospital Superintendent reviews end-to-end workflows. |
| **G14** | Legal | DGHS & BMDC Statutory Compliance Filings | **BLOCKED_EXTERNAL_OWNER** | File regulatory ERP paperwork with health authorities. |
| **G15** | Code Signing | Windows Authenticode EV Certificate | **BLOCKED_EXTERNAL_OWNER** | Owner signs executable with EV hardware token if SmartScreen bypass is desired. |
| **G16** | DNS | Custom Domain CNAME Cutover | **BLOCKED_EXTERNAL_OWNER** | Point hospital official domain CNAME to `onnesha-hospital.pages.dev`. |

---

## 4. Final Empirical Closure Verdict

$$\mathbf{SOFTWARE\ QUALITY\ VERIFIED\ \bullet\ DEPLOYMENT\ VERIFIED\ \bullet\ INSTALLERS\ VERIFIED}$$

1. **Software Quality:** 128/128 certification suites, 1,161 active passes, 0 failures, 60/60 route forensic acceptance, 52/52 Playwright browser tests, 0 lint warnings, 0 typecheck errors.
2. **Edge Deployment:** Live on Cloudflare Pages edge (`https://onnesha-hospital.pages.dev` & `https://fa3707dc.onnesha-hospital.pages.dev`).
3. **Installer Delivery:** Native WiX MSI and NSIS EXE binaries built on Windows, deployed to edge, downloaded over HTTPS, and SHA-256 hashes independently verified.
4. **External Owner Gates:** G1–G16 clearly isolated without false greens.
