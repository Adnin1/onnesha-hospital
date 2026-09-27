# Onnesha Hospital Management System — Release Notes v1.1.6

**Release Date:** 2026-09-28  
**Version:** v1.1.6  
**Git HEAD:** Synchronized with `origin/main` (Release Tag: `v1.1.6`)  
**Deployment Target:** Cloudflare Pages (`https://onnesha-hospital.pages.dev`)  
**Database:** Supabase PostgreSQL Cloud (`iuhtzahuszdkdarhxobx`, 85 Applied Migrations)  

---

## 🚀 What's New in v1.1.6

### 1. Atomic Diagnostic Order Processing & Pathologist Verification
- **PostgreSQL Atomic RPC (`create_diagnostic_order_atomic`):** Guarantees zero-orphan diagnostic orders by atomically validating multi-tenant catalog pricing, generating sequence-backed order numbers, and inserting order items in a single transaction.
- **Pathologist Verification RPC (`verify_diagnostic_order_atomic`):** Cryptographic SHA-256 HMAC digital signatures generated and stamped across `diagnostic_report_verifications` and `diagnostic_orders`.
- **Dynamic Biological Reference Intervals:** Calibrated dynamically based on patient gender and chronological pediatric vs adult age.
- **Truthful Phlebotomy Barcodes:** Eliminates phantom barcodes by dynamically detecting phlebotomy sample collection status.

### 2. Clinical UI Hardening & Production Toast System
- **Accessible Toast Notifications (`components/ui/Toast.tsx`):** Replaced all browser `alert(...)` calls with non-blocking, accessible toast notifications.
- **Patient Search & Deep Link Preselection:** Deep-linking with `?patientId=` dynamically queries the patient index to ensure seamless preselection.
- **Strict Specialty Tenant Isolation:** Hardened Dental, Eye, and Physiotherapy server actions with fail-closed tenant validation and collision-safe identifiers.

### 3. CI/CD & Production Infrastructure
- **Strict 77/77 Test Certification Suite:** 680 active automated test passes with zero failures.
- **Playwright 4-Browser Matrix:** Passing end-to-end tests across Chromium, Firefox, Mobile Chrome, and WebKit.
- **Fail-Closed Security Gates:** Staging security gate and production deploy gates maintain strict fail-closed enforcement.

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
