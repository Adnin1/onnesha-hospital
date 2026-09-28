# Onnesha Hospital Management System — Release Notes v1.1.10

**Release Date:** 2026-09-28  
**Version:** v1.1.10  
**Git HEAD:** Synchronized with `origin/main` (Release Tag: `v1.1.10`)  
**Deployment Target:** Cloudflare Pages (`https://onnesha-hospital.pages.dev`)  
**Database:** Supabase PostgreSQL Cloud (`iuhtzahuszdkdarhxobx`, 90 Applied Migrations)  

---

## 🚀 What's New in v1.1.10

### 1. Server-Authoritative Financial Intelligence & Reporting RPCs (`Migration 90`)
- **Authoritative SQL RPCs (`supabase/migrations/20260928200000_financial_intelligence_reporting_and_ar_aging.sql`):** Added 5 `SECURITY DEFINER` PostgreSQL functions with strict tenant org boundaries and `SET search_path = ''`:
  1. `get_financial_dashboard_aggregates(p_org_id, p_start_date, p_end_date)`
  2. `get_payment_channel_breakdown(p_org_id, p_start_date, p_end_date)`
  3. `get_department_revenue_breakdown(p_org_id, p_start_date, p_end_date)`
  4. `get_accounts_receivable_aging(p_org_id, p_as_of_date)`
  5. `get_profit_and_loss_summary(p_org_id, p_start_date, p_end_date)`
- **Eliminated 1000-Row Client Aggregation Limits:** Aggregates and KPI totals are computed server-side in the database, avoiding truncation.

### 2. Accounts Receivable (AR) Aging Engine & Control Total Invariant
- **5 Standard Aging Buckets:** Current (0–30 days), 31–60 days, 61–90 days, 91–120 days, and 120+ days.
- **Mathematical Invariant Check (`isReconciled`):** Continuous automated assertion ensuring `Total AR == Sum(Buckets)` down to 2 decimal places.

### 3. True Accrual P&L vs Cash Basis Flow
- **Accrual Basis:** Gross Patient Revenue minus Discounts Allowed = Net Recognized Revenue. Net Recognized Revenue minus Operating Expenses = Net Operating Surplus/Deficit.
- **Cash Basis:** Inflow from patient collections minus cash outflows = Net Operating Cash Flow.

### 4. Asia/Dhaka Calendar Week & Payment-Date Anchoring
- **Fixed Rolling 7-Day Window Discrepancy:** Enforces true Bangladeshi calendar weeks starting Sunday 00:00:00 BST through Saturday 23:59:59 BST.
- **Payment Method Grouping by Payment Date:** MFS (bKash, Nagad, Rocket), Card, and Cash transactions are grouped according to when cash was collected, not invoice generation date.

### 5. Fail-Closed GL Posting & Trial Balance Isolation
- **Audit Logging for GL Failures (`lib/billing/actions.ts`):** `createInvoiceAction` captures `post_billing_to_gl_atomic` errors and logs high-priority audit events instead of swallowing errors.
- **Fail-Closed Trial Balance (`lib/accounting/actions.ts`):** Removed un-isolated fallback querying `journal_entry_lines` directly; enforces fail-closed return from authoritative `get_trial_balance` RPC.

### 6. Certified Quality & Test Metrics
- **84/84 Test Suites Passing:** 732 active test passes, 0 failures, 6 standard skips.
- **38/38 Real Browser E2E Tests Passing:** Playwright Chromium test suites fully green.
- **0 TypeScript Errors & 0 ESLint Warnings:** Strict verification passed.
- **58 Static Routes Exported:** Deployed to Cloudflare Pages edge.

---

## 🚀 What's New in v1.1.9

### 1. Server-Authoritative Storage & Session Hardening
- **Server Session Architecture (`lib/auth/server-session.ts`):** Created clear separation between client UX session helpers and server-authoritative authorization. Server modules now derive user identity and permissions directly from server cookies/headers rather than trusting client-supplied parameters.
- **Storage Vault Path Canonicalization (`lib/storage/validation.ts` & `lib/storage/files.ts`):** Enforces strict path normalization and blocks path traversal attempts (`../`, `..\`, `%2e%2e`, null bytes). Strict patient ID matching and tenant isolation enforced on all document operations.
- **MIME & Quota Boundaries:** Enforces strict clinical MIME type whitelist (`application/pdf`, `image/jpeg`, `image/png`, `application/dicom`) and 50MB file size ceiling.

### 2. Authoritative Public Token Status RPC (`Migration 88`)
- **Deterministic Token Lookup (`public.get_public_token_status`):** Migration `20260928190000_authoritative_public_token_status_lookup.sql` implements an authoritative PostgreSQL RPC for chamber token search. Replaces client-side array search over partial queues.
- **Queue Position & Cross-Date Scheduling:** Returns exact queue position ahead, consultation chamber room, and doctor without exposing patient PII. Accurately informs patients if a token is scheduled for another date.
- **Zero-PHI Guarantee:** Never exposes patient names, phone numbers, addresses, or diagnosis.

### 3. Supabase Auth Configuration Drift Alignment
- **Strict Staff-Provisioned Policy (`supabase/config.toml`):** Aligned `[auth.email] enable_signup = false` with global `[auth] enable_signup = false`, locking down the hospital ERP to administrator-provisioned staff accounts.
- **Automated Drift Suite (`tests/auth-config-drift.test.mjs`):** Regression test preventing inadvertent enablement of public signups, wildcard redirects, or anonymous sessions.

### 4. 82/82 Test Suites Passing (713 Active Passes)
- 3 new regression suites added: `tests/storage-vault-hardening.test.mjs`, `tests/auth-config-drift.test.mjs`, and `tests/public-token-status.test.mjs`.
- All 82 test suites passing with 713 active passes, 0 failures, and exactly 6 standard skips.

---

## 🚀 What's New in v1.1.8

### 1. Strict Fail-Closed CI Staging Gate (`.github/workflows/ci.yml`)
- **Fail-Closed Security Assurance:** The dedicated staging live security gate (`live-security-test`) strictly enforces that `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` are present. If staging credentials are not provided, production deployment is strictly **BLOCKED** with an error. No deployment can proceed to production without real, authenticated staging security validation.

### 2. Comprehensive Server-Side Negative RBAC Certification
- **10/10 Negative Role Tests Passed (`tests/security/rbac-server-side-negative-certification.test.mjs`):** Verified that unauthorized roles are strictly denied for:
  - Billing Void and Refund (receptionist, doctor, nurse, pharmacist $\rightarrow$ DENIED).
  - General Ledger and Accounting Posting (clinical/front-desk roles $\rightarrow$ DENIED).
  - Online Payment Verification and Gateway Management (non-finance roles $\rightarrow$ DENIED).
  - Cashier Reconciliation (non-accountant roles $\rightarrow$ DENIED).
  - Staff Account Provisioning (operational staff $\rightarrow$ DENIED).
  - Role Governance (`settings.manage_roles` is strictly barred from Hospital Administrator; reserved for Super Admin).
  - Password Reset Authority (clinical staff $\rightarrow$ DENIED).
  - Integration and Merchant Secrets Management (non-admin roles $\rightarrow$ DENIED).
  - Forensic Audit Log Access (front-desk and clinical roles $\rightarrow$ DENIED).
  - Diagnostic Report Verification (receptionist, nurse, pharmacist $\rightarrow$ DENIED; restricted to Pathologist / Lab Technologist).

### 3. Storage, Realtime & Disaster Recovery Matrix
- **Document Vault (`docs/FINAL_FORENSIC_SECURITY_AND_DISASTER_RECOVERY_MATRIX.md`):** Documents storage bucket scheme (`medical-documents-vault`, 300s signed URL TTL, tenant prefix enforcement), realtime publication security boundaries, and disaster recovery PITR runbook (RPO < 1h, RTO < 15m).

### 4. Website Metadata, Dual Manifest & CSP Hardening
- **Dual Manifest Support:** Added `public/manifest.webmanifest` alongside `public/manifest.json` ensuring both Next.js metadata and PWA browser requests resolve with HTTP 200.
- **Sitemap Release Freshness:** Updated `app/sitemap.ts` to output exact release timestamp (`2026-09-28T05:00:00.000Z`) across all 10 public marketing & patient-facing URLs.
- **Content-Security-Policy Tightening:** Eliminated overly broad wildcards in `public/_headers` (such as `https://*.pages.dev` and open `https:` for images), locking down to exact canonical hosts and whitelisted Supabase/SSLCommerz endpoints.

---

## 🚀 What's New in v1.1.7

### 1. SSLCommerz Payment Gateway Live Execution on Running Domain
- **Running Domain Execution (`https://onnesha-hospital.pages.dev`):** Successfully executed SSLCommerz payment gateway on running domain without requiring custom domain setup.
- **CSP Hardening (`public/_headers`):** Allowed `https://sandbox.sslcommerz.com` and `https://securepay.sslcommerz.com` in `connect-src` and `form-action`.
- **Edge Functions Deployed:** `payment-initiate` and `payment-callback` active on Supabase instance `iuhtzahuszdkdarhxobx`.
- **Database Migration 86 (`20260928093000_configure_sslcommerz_running_domain.sql`):** Configured organization integration and validated 100% remote database parity.

### 2. Security Architecture & IAM Hardening
- **Public Signup Explicitly Disabled (`supabase/config.toml`):** Staff-provisioned hospital system policy hardened with `enable_signup = false`.
- **Fail-Closed CSPRNG Credentials (`lib/staff/actions.ts`):** Eliminated `Date.now()` and pseudo-random fallbacks; temporary password generator strictly throws if CSPRNG is unavailable.
- **High-Risk RBAC Hardening (`lib/auth/session.ts`):** Removed blind permission bypass for administrator roles; root governance permissions (e.g. `settings.manage_roles`) are strictly confined to `super_admin`.
- **Environment-Driven Test Infrastructure (`tests/e2e/auth-real-e2e.test.mjs`):** Removed all hardcoded real-looking Supabase credentials and placeholder admin emails.

### 3. Release Provenance Reconciled
- Synchronized all version manifests across Web, Desktop (Tauri 2/Cargo), Download Metadata, and Documentation to single authoritative SHA.

### 1. Unified Hospital Platform (Web + PWA + Desktop)
- **Public Website & Patient Portal:** Homepage, doctor directory, online OPD appointment booking, and token queue lookup.
- **Private Hospital HMS:** Complete OPD, IPD, Emergency casualty triage, Pharmacy stock, Lab diagnostics, Billing, HR, and Audit Vault.
- **PWA & Mobile:** Standalone web manifest, Service Worker with clinical cache isolation, and offline status indicator (`NetworkStatus.tsx`).
- **Windows PC Software:** Tauri 2 desktop client configuration (`src-tauri/`) connecting to canonical production origin `https://onneshahospital.com`.

### 2. Security & Compliance
- **Multi-Tenant RLS:** Strict organization-level row isolation across PostgreSQL tables.
- **Immutable Audit Vault:** PostgreSQL audit log triggers with before/after forensic diffs and mandatory clinical void justifications.
- **PHI Telemetry Sanitization:** Operational health subsystem (`lib/health.ts`) automatically redacting patient IDs and numeric identifiers.

### 3. Printing & Notifications
- **Dual-Format Printing:** A4 formal documents (Prescriptions, Invoices, Lab Reports, Discharge Summaries) + 80mm POS Thermal receipt slips.
- **Notification Outbox:** Multi-channel Outbox architecture supporting SMS (SSL Wireless/Greenweb), WhatsApp Business Cloud API, and Email.

---

## ⚠️ Known Limitations & Operational Requirements

1. **Custom Domain Setup:** DNS CNAME/A records must be pointed to Cloudflare Pages for `https://onneshahospital.com`.
2. **Provider Credentials:** Merchant API keys for SMS, WhatsApp, Email, bKash, Nagad, and SSLCommerz must be configured in environment settings.
3. **Physical Hardware:** Thermal 80mm printers and barcode scanners must be connected via USB to client PCs.
