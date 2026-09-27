# Onnesha Hospital Management System — Release Notes v1.1.8

**Release Date:** 2026-09-28  
**Version:** v1.1.8  
**Git HEAD:** Synchronized with `origin/main` (Release Tag: `v1.1.8`)  
**Deployment Target:** Cloudflare Pages (`https://onnesha-hospital.pages.dev`)  
**Database:** Supabase PostgreSQL Cloud (`iuhtzahuszdkdarhxobx`, 86 Applied Migrations)  

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
