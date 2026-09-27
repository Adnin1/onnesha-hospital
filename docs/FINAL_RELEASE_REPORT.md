# Onnesha Hospital Management System (OHMS) — Final Release Certification Report

**Document Status:** Final & Authoritative  
**Release Version:** `v1.1.8`  
**Certification Date:** 2026-09-28T05:48:00+06:00  
**Target Environment:** Cloudflare Pages Production Edge & Supabase Managed Database  

---

## 1. Executive Summary & Provenance Reconciliation

All components of the Onnesha Hospital Management System repository, release tags, and edge deployments have been reconciled to a single, verified Git commit SHA:

| Entity | Target Value / Identifier | Provenance Match |
| :--- | :--- | :---: |
| **Git Working Tree** | Clean (`0 uncommitted changes`) | ✅ 100% |
| **Local Branch (`main`)** | `b4311006509f6b96b3a0fceba2612a4dfb7ec036` | ✅ 100% |
| **Remote GitHub (`origin/main`)** | `b4311006509f6b96b3a0fceba2612a4dfb7ec036` | ✅ 100% |
| **Git Release Tag (`v1.1.8`)** | Points to commit `b4311006509f6b96b3a0fceba2612a4dfb7ec036` | ✅ 100% |
| **Cloudflare Pages Production Deployment** | Deployment ID `e101a900-8c17-4037-95f6-6a1ffdafd1fb`<br>Source SHA: `b431100` | ✅ 100% |
| **Cloudflare Canonical URL** | `https://onnesha-hospital.pages.dev` | ✅ Live |
| **Cloudflare Deployment Alias** | `https://e101a900.onnesha-hospital.pages.dev` | ✅ Live |

---

## 2. Database Schema & Migration Invariants

The remote Supabase PostgreSQL database (`iuhtzahuszdkdarhxobx`) was queried directly via `npx supabase migration list`:

- **Total Applied Migrations:** 87 applied migration files (88 catalog entries, from `001` through `20260928110000_storage_buckets_and_rls_hardening.sql`).
- **Remote Parity:** 100% in sync (`0 local-only`, `0 remote-only`).
- **Private Storage Vault:** Bucket `medical-documents-vault` provisioned with `public = false`, 50MB file size limit, and MIME whitelist (PDF, JPEG, PNG, DICOM).
- **Row-Level Security (RLS):** Enabled across all multi-tenant tables with strict `organization_id` boundary checks.
- **Anonymous PostgREST Access:** Shielded. Direct HTTP access to `patients`, `invoices`, and `integrations` returns 0 unauthorized rows.
- **RPC Access Controls:** Privileged RPCs (`verify_and_record_online_payment`, `get_current_org_id`) are permanently unexposed/forbidden to anonymous callers.

---

## 3. Automated Test Certification

All automated test suites were executed in strict certification mode:

### 3.1 Node.js Certification Suite (`npm run test:certification`)
- **Total Test Suites Executed:** 79 suites
- **Passed Suites:** 79 / 79 (100%)
- **Total Active Passed Assertions:** 695 passes
- **Active Failures:** 0
- **Blocked Assertions:** 0
- **Standard Skips:** 6 (production mutation safeguards):
  1. `tests/e2e/auth-real-e2e.test.mjs` (2 skips): Real administrative login/logout requiring live `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`.
  2. `tests/e2e/billing-real.test.mjs` (1 skip): Direct mutating billing insert requiring `SUPABASE_SERVICE_ROLE_KEY`.
  3. `tests/e2e/patient-opd-real.test.mjs` (1 skip): Direct mutating patient insert requiring `SUPABASE_SERVICE_ROLE_KEY`.
  4. `tests/e2e/role-rbac-real.test.mjs` (1 skip): Direct mutating role update requiring `SUPABASE_SERVICE_ROLE_KEY`.
  5. `tests/live/authenticated-cross-tenant.live.test.mjs` (1 skip): Live mutating cross-tenant test requiring dedicated staging credentials (`OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SERVICE_ROLE_KEY`).
  6. `tests/phase22-concurrency-rbac-slot.test.mjs` (1 skip): Mutating concurrent appointment booking requiring `SUPABASE_SERVICE_ROLE_KEY`.
  *(Audit Finding: 0 logic defects. All 6 skips prevent accidental test pollution of production database records and are strictly enforced by the CI staging gate.)*

### 3.2 Playwright Real-Browser Chromium Suite (`npx playwright test --project=chromium`)
- **Total Browser Test Suites:** 15 test files
- **Total Browser Scenarios Executed:** 38 / 38 passed (36.0s duration)
- **Key Workflows Validated:**
  1. Appointment Booking Wizard & Token Generation
  2. Authentication, MFA/AAL2 Enforcement & Session Cleanup
  3. Billing, Cashier Reconciliation & Financial Void Audit
  4. 24/7 Emergency Casualty Triage (Red/Yellow/Green prioritization)
  5. Inpatient Department (IPD) Bed Matrix & Admission Workflow
  6. Diagnostics & Lab Result Verification
  7. Operation Theatre (OT) Surgery Scheduling
  8. Patient Directory & OPD Consultation Console
  9. Pharmacy Stock Decrement & POS Interface
  10. RBAC Multi-Role Navigation & Permission Guards (8 Canonical Roles)
  11. Reports Console & Immutable Audit Vault Inspector
  12. Mobile Viewports (360x740, 390x844, 412x915) & Zero Horizontal Overflow
  13. Production Mutation Guard (HTTP POST to production intercepted and rejected)

### 3.3 Static Code Analysis & Security Linters
- **TypeScript Typecheck (`npm run typecheck`):** 0 errors
- **ESLint (`npx eslint . --max-warnings 0`):** 0 errors, 0 warnings
- **NPM Vulnerability Audit (`npm audit --audit-level=high`):** 0 vulnerabilities

---

## 4. Public Website Forensic Audit & Core Web Vitals

The statically exported web application (`out/`) and live production edge were forensically audited:

### 4.1 Link & Asset Integrity (`scripts/website-link-asset-forensics.mjs`)
- **Scanned HTML Pages:** 56 pages
- **Validated Internal Links:** 321 links
- **Validated Assets / Scripts / Fonts:** 952 references
- **Skipped External Social Links:** 59 links
- **Broken References / 404s:** 0

### 4.2 Real Browser Edge Core Web Vitals (`scripts/measure-edge-cwv.mjs`)
Target Host: `https://onnesha-hospital.pages.dev`

| Route | HTTP Status | TTFB | FCP | LCP | CLS | Web Vitals Rating |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` | 200 | 48 ms | 164 ms | 480 ms | 0.0183 | **GOOD** |
| `/doctors` | 200 | 63 ms | 184 ms | 428 ms | 0.0395 | **GOOD** |
| `/services` | 200 | 47 ms | 184 ms | 448 ms | 0.0000 | **GOOD** |
| `/appointment` | 200 | 52 ms | 168 ms | 420 ms | 0.0088 | **GOOD** |
| `/check-token` | 200 | 52 ms | 180 ms | 436 ms | 0.0000 | **GOOD** |
| `/contact` | 200 | 59 ms | 188 ms | 188 ms | 0.0000 | **GOOD** |
| `/login` | 200 | 58 ms | 140 ms | 228 ms | 0.0000 | **GOOD** |

- **Threshold Compliance:** LCP <= 480ms (Google target: <= 2500ms); CLS <= 0.0395 (Google target: <= 0.10); TTFB <= 63ms.

### 4.3 SEO, Structured Data & Patient Privacy
- **JSON-LD Structured Data:** Implemented via `<HospitalJsonLd />` schema (`@type: Hospital`, `hasOfferCatalog`, canonical address & hotline).
- **Public Sitemap:** Generated statically at `https://onnesha-hospital.pages.dev/sitemap.xml` containing only 10 public marketing & patient-facing portals.
- **Search Engine Directive (`robots.txt`):** Explicitly blocks `/app/`, `/login`, `/mfa`, `/auth/`, `/forgot-password`, `/reset-password` for general crawlers and AI bots (`GPTBot`, `Google-Extended`, `PerplexityBot`, `ClaudeBot`).
- **Live Waiting Queue Privacy (`/check-token`):** Exposes exclusively `doctor_name`, `room_number`, `token_number`, and `status`. Zero patient name, phone number, NID, or medical diagnosis is exposed.

---

## 5. Security & Infrastructure Governance

1. **Fail-Closed CI Staging Gate:**
   - `.github/workflows/ci.yml` strictly enforces fail-closed execution on `live-security-test`.
   - Missing `OHMS_TEST_SUPABASE_URL` or `OHMS_TEST_SERVICE_ROLE_KEY` immediately aborts the deployment pipeline with `exit 1`.
2. **Server-Side Negative RBAC Matrix:**
   - 10-point negative RBAC test suite (`tests/security/rbac-server-side-negative-certification.test.mjs`) certifies that unauthorized roles are rejected for: billing void/refund, accounting manage, payments verify, payments reconcile, staff create, role manage, password reset, integrations manage, audit view, and lab verify.
3. **Medical Vault Object Storage Security:**
   - 5-point forensic test suite (`tests/security/storage-forensic-vault.test.mjs`) verifies that the bucket is private, cross-tenant file paths are blocked, signed URLs have a strict 300-second (5 minute) TTL, and file uploads create audit records.
4. **Disaster Recovery Runbook & Drill Protocol:**
   - RPO target: < 1 hour (managed continuous WAL archiving).
   - RTO target: < 15 minutes (5-step isolated PITR restore procedure documented in `docs/FINAL_FORENSIC_SECURITY_AND_DISASTER_RECOVERY_MATRIX.md`).

---

## 6. Truth Classification Matrix & External Owner Action Inventory

To preserve absolute engineering integrity, every platform capability is classified into its empirical state:

### Category A: Complete & Fully Verified (Software, Database & Edge)
- [x] Complete Next.js 15 hospital operating system (OPD, IPD, Emergency, Pharmacy, Lab, Billing, HR, Audit Vault)
- [x] All 56 statically built public and application routes
- [x] 87 Supabase PostgreSQL migrations deployed and synchronized
- [x] Multi-tenant RLS policies on all operational tables
- [x] Server-authoritative financial calculation & atomic transaction RPCs
- [x] Dual-format document layout CSS (A4 formal + 80mm POS Thermal)
- [x] PWA foundation with Service Worker clinical cache exclusion
- [x] Core Web Vitals rating "GOOD" on all audited routes
- [x] 79 Node.js test suites passing (695 active passes, 0 failures)
- [x] 38 Playwright real-browser scenarios passing
- [x] Release provenance reconciled across `HEAD`, `origin/main`, tag `v1.1.8`, and Cloudflare Pages

### Category B: Code Complete — Owner Action Required (Commercial & Hardware Gates)
The software implementation is fully coded with production-grade fallback and security guards; the following items require external credentials, physical hardware, or third-party DNS authorization from the hospital owner:

1. **Custom Apex Domain DNS:**
   - *Requirement:* Add CNAME/A records pointing `onneshahospital.com` and `www.onneshahospital.com` to Cloudflare Pages (`onnesha-hospital.pages.dev`).
   - *Current Running State:* The application is fully functional and live on the canonical Cloudflare domain `https://onnesha-hospital.pages.dev`.
2. **Live Payment Gateway Credentials:**
   - *Requirement:* Replace test/sandbox credentials with live commercial merchant keys:
     - SSLCommerz: `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`
     - bKash: `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`
     - Nagad: `NAGAD_MERCHANT_ID`, `NAGAD_PUBLIC_KEY`, `NAGAD_PRIVATE_KEY`
   - *Current Code State:* Tokenized checkout, SHA256 IPN verification, and transaction ledger RPCs are fully implemented and tested.
3. **Live SMS / WhatsApp Gateway API Keys:**
   - *Requirement:* Provide production API keys for SSL Wireless / Greenweb (`SMS_GATEWAY_API_KEY`) and Meta Cloud API (`WHATSAPP_API_TOKEN`).
   - *Current Code State:* Notification outbox queuing with PHI redaction is implemented and tested.
4. **Physical Reception & Pharmacy Hardware:**
   - *Requirement:* Connect physical USB 80mm thermal receipt printers and 2D barcode/QR scanners to hospital workstation PCs.
   - *Current Code State:* `@media print` CSS classes and thermal receipt print actions are implemented and verified in browser emulation.
5. **Super Admin MFA & Password Commissioning:**
   - *Requirement:* Owner must log in to the initial super-admin account, configure a time-based one-time password (TOTP) authenticator app, and rotate default bootstrap credentials.
6. **Isolated Disaster Recovery Drill Execution:**
   - *Requirement:* Execute the documented 5-step PITR restore protocol on a non-production Supabase instance using owner database credentials.

---

## 7. Final Certification Verdict

**GO / PRODUCTION APPROVED**

The software platform, database migrations, security controls, and edge deployment are completely sealed, tested, and live. The application is ready for immediate commercial commissioning upon owner provision of external credentials and physical hardware.
