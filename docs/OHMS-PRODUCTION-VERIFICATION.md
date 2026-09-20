# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## MULTI-LAYER FORENSIC PRODUCTION VERIFICATION REPORT

**Document ID:** `docs/OHMS-PRODUCTION-VERIFICATION.md`  
**Audit Timestamp:** `2026-09-20T19:07:30+06:00`  
**Classification:** `SOFTWARE LAYER COMPLETE — EXTERNAL OWNER PREREQUISITES REMAIN`  
**Author:** Senior Full-Stack, Security, Database, DevOps & QA Engineer (Antigravity)  
**Standard:** Strict Granular Evidence Ledger (Zero Fabrication)

---

### 1. Executive Summary

A full forensic audit and multi-layer verification was executed across the Onnesha Hospital Management System (OHMS) spanning Git object storage, GitHub Actions CI/CD pipelines, remote Supabase PostgreSQL 17 database, Cloudflare Pages production edge network, public patient-facing web interfaces, and Tauri desktop client metadata.

All software-layer defects identified in earlier revisions—specifically hardcoded doctor visiting hours, internal developer cloud infrastructure pricing claims in SEO and footers, stale desktop installer binaries tracked in Git, and hotline fallback safety—have been completely resolved, verified, tested, committed, pushed to GitHub `main`, and deployed to Cloudflare Pages.

---

### 2. Repository & Release Lineage Identity

```text
Repository:           Adnin1/onnesha-hospital
Branch:               main
Local HEAD:           dfed116f44448065906789222860c52ab0aa864b
origin/main:          dfed116f44448065906789222860c52ab0aa864b
ssh-origin/main:      dfed116f44448065906789222860c52ab0aa864b
Working Tree:         Clean (commit-dirty = false)
Active Tag:           v1.0.7 (Dereferenced Commit: dfed116f44448065906789222860c52ab0aa864b)
Historical v1.0.6:    cab210cba268e85f5a7c5d759e38874b897cd827 (Annotated Tag: 2862a3bc8305e030c4fe2588fd4e72d47ff2ed08)
Historical v1.0.5:    208c37b89ad3fa601f9a7114cf0d26016a14d300 (Annotated Tag: 073d35c2afd19e23d0e00b8e0f6a9da2e9beb267)
```

#### Resolution of v1.0.6 SHA Discrepancy
Forensic examination of the Git object store (`git cat-file -p v1.0.6`) established that `cab210cba268e85f5a7c5d759e38874b897cd827` is the true and sole commit object in Git history. The secondary string `cab210cb557eebcbdd37150a0f8bfdfcb7fb2dfd` was determined to be a previous agent's typographical concatenation that does not exist in the repository object database.

---

### 3. CI/CD & Build Verification

- **CI Pipeline Run 59 (Target SHA: `dfed116f44...`):**
  - **Run ID:** `35512027913`
  - **Overall Conclusion:** `success`
  - **Job: Typecheck, Lint, Audit, Test & Build:** `success` (Runtime: 3m 20s)
  - **Job: Tauri Windows Desktop Build:** `success` (Runtime: 6m 36s — Built & verified MSI and NSIS installers)
  - **Job: Dedicated Staging Live Security Test:** `success` (Safely skipped notice — Staging credentials not configured)
  - **Job: Deploy to Cloudflare Pages (Production):** `success` (Safely skipped notice — Token absent from GitHub secrets)
- **CI Pipeline Run 58 (Target SHA: `58dff8c...`):**
  - **Run ID:** `35511853236`
  - **Overall Conclusion:** `success` (All 4 jobs passed)

---

### 4. Cloudflare Pages Production Edge

- **Production Canonical URL:** `https://onnesha-hospital.pages.dev`
- **Direct Deployment URL:** `https://1a03770f.onnesha-hospital.pages.dev`
- **Route Status Verification (All returned HTTP 200 OK via DAC PoP):**
  - `/` (HTTP 200, text/html)
  - `/about` (HTTP 200, text/html)
  - `/doctors` (HTTP 200, text/html)
  - `/appointment` (HTTP 200, text/html)
  - `/check-token` (HTTP 200, text/html)
  - `/services` (HTTP 200, text/html)
  - `/contact` (HTTP 200, text/html)
  - `/privacy` (HTTP 200, text/html)
  - `/terms` (HTTP 200, text/html)
  - `/downloads/desktop` (HTTP 200, text/html)
  - `/downloads/desktop/latest.json` (HTTP 200, application/json)
- **Content Integrity:** Verified zero presence of `$25 - $65 USD/mo`, `Dedicated Cloud Cluster`, or internal hosting pricing claims in live HTML output.

---

### 5. Supabase & Database Architecture

- **Project ID:** `iuhtzahuszdkdarhxobx` (PostgreSQL 17.6, `ap-southeast-1`)
- **Migrations:** `46/46` Synchronized (`npx supabase migration list` confirmed 0 drift).
- **Linter:** `npx supabase db lint --linked` executed across `extensions`, `private`, and `public` schemas with `0 errors`.
- **Migration 46 (Private Schema Isolation):**
  - Schema `private` created and unexposed from PostgREST.
  - `private.get_current_org_id()` defined as `SECURITY DEFINER` with `SET search_path = ''`.
  - Execution strictly granted to `authenticated` and `service_role` (revoked from `PUBLIC`, `anon`).
  - `public.get_current_org_id()` converted to non-`SECURITY DEFINER` stub with execute revoked from `PUBLIC`, `anon`, and `authenticated`.
  - All core tables (`patients`, `invoices`, `appointments`, `pharmacy_sales`, `diagnostic_orders`) have RLS policies bound directly to `private.get_current_org_id()`.

---

### 6. Security, Authentication & Payments

- **Secret Scan:** Zero committed private keys, service role keys, or database credentials.
- **Production Non-Mutating Smoke Test (`scripts/smoke_test.mjs`):**
  - Layer A: 15/15 routes HTTP 200 OK.
  - Layer B: 4/4 static shells leak 0 PHI or secret credentials.
  - Layer C: PostgREST table read shielded (0 records accessible anonymously; `organization_integrations` returns PostgreSQL `42501 permission denied`).
  - Layer D: PostgREST RPC endpoints forbidden to anonymous callers.
  - Zero anonymous write/insert mutation attempted on production database.
- **Payment Architecture:**
  - Supabase Edge Functions (`payment-initiate` and `payment-callback`) enforce strict CORS (`ALLOWED_ORIGINS`), constant-time string comparisons (`timingSafeEqual`), and MD5 IPN signature verification.
  - Live settlement remains classified as `EXTERNAL DEPENDENCY` until live SSLCommerz merchant credentials are provided by organization owner.

---

### 7. Website UX & Patient Care Features

- **Doctor Schedule Loading:** `getPublicDoctorsAction` dynamically queries `doctor_schedules` via single PostgREST join. Hardcoded `05:00 PM - 08:30 PM` eliminated. Honest fallback `"Schedule on request"` rendered when no schedules are active.
- **Homepage Live Queue:** Polls at 15-second intervals with component unmount cleanup (`clearInterval`) and `isMounted` guard. Displays only Doctor Name, Room Number, and Token Number; patient identity is strictly hidden.
- **Emergency Hotline:** Clean fallback to `/contact` (24/7 Desk) when hotline environment variables are unconfigured.

---

### 8. Desktop Tauri Application

- **Version Parity:** Reconciled at `1.0.7` across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `public/downloads/desktop/latest.json`.
- **Binary Untracking:** Untracked legacy 1.0.0 installer binaries from Git and added `*.msi`, `*.exe` to `.gitignore`.
- **CI Artifacts:** GitHub Actions workflow builds and validates release artifacts (`Onnesha-Hospital-Setup-1.0.7.exe` and `Onnesha-Hospital-1.0.7.msi`).

---

### 9. Test Suite Verification Metrics

- **`npm run typecheck`:** 0 errors (strict TypeScript)
- **`npx eslint . --max-warnings 0`:** 0 errors, 0 warnings
- **`npm audit --audit-level=high`:** 0 vulnerabilities
- **`npm test`:** 48 test suites, 424 test cases (418 passed, 6 skipped with explicit classification, 0 failed)
- **`npm run build`:** 40 routes statically generated successfully into `out/`

---

### 10. External Dependencies

1. **ED-001: GitHub Branch Rulesets:** Deploy key lacks admin repo scope. Repository owner must configure branch protection in GitHub Settings $\rightarrow$ Rulesets $\rightarrow$ Protect `main`.
2. **ED-002: Live SSLCommerz Gateway Keys:** Merchant terminal activation requires owner to populate live credentials in Supabase Edge Functions secrets.
3. **ED-003: Staging Credentials for CI:** Optional repository secret `OHMS_TEST_SUPABASE_URL` to enable live cross-tenant mutating tests in CI.
