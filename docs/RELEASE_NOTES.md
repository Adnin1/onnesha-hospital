# Onnesha Hospital Management System — Release Notes v1.0.0

**Release Date:** 2026-09-15  
**Version:** v1.0.0  
**Git HEAD:** Synchronized with `origin/main`  

---

## 🚀 What's Included

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
