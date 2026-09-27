# Onnesha Hospital Management System — Release Notes v1.1.7

**Release Date:** 2026-09-28  
**Version:** v1.1.7  
**Git HEAD:** Synchronized with `origin/main` (Release Tag: `v1.1.7`)  
**Deployment Target:** Cloudflare Pages (`https://onnesha-hospital.pages.dev`)  
**Database:** Supabase PostgreSQL Cloud (`iuhtzahuszdkdarhxobx`, 86 Applied Migrations)  

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
