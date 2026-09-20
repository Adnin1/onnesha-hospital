# Final Repository Verification & Truth Classification Matrix

## Overview
This document provides an itemized capability verification matrix for the Onnesha Hospital Management System (OHMS). Every capability is classified according to its true empirical state.

---

## 📊 Capability Verification Matrix

| Capability | Status | Verification Evidence |
|------------|--------|----------------------|
| **Public Website Pages** | `AUTOMATED-TESTED` & `DEPLOYED` | 39 static HTML routes built, verified via `tests/phase13-public-appointment-seo.test.mjs`, `tests/e2e/privacy-and-compliance-e2e.test.mjs`, & `tests/auth/admin-login.test.mjs` |
| **Patient Registration & Search** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Verified via `tests/integration/patient-workflow.test.mjs` & `tests/clinical.test.mjs` |
| **Outpatient Department (OPD)** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Vitals validation & consultation console verified in `tests/clinical.test.mjs` |
| **Inpatient Department (IPD)** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Admission & bed transfer verified in `tests/integration/emergency-and-bed.test.mjs` |
| **Emergency Casualty Triage** | `AUTOMATED-TESTED` & `IMPLEMENTED` | RED/YELLOW/GREEN triage sorting verified in `tests/integration/emergency-and-bed.test.mjs` |
| **Pharmacy Stock & Dispensing** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Zero negative stock rule verified in `tests/integration/pharmacy-and-lab.test.mjs` |
| **Diagnostic Lab Reports** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Immutable result state transitions verified in `tests/integration/pharmacy-and-lab.test.mjs` |
| **Billing & Void Audit Vault** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Due calculations & void audit verified in `tests/integration/billing-and-payments.test.mjs` |
| **Multi-Tenant RLS Security** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Cross-tenant isolation verified in `tests/security.test.mjs` & `tests/integration/multi-tenant-rbac.test.mjs` |
| **Server-Side RBAC Guards** | `AUTOMATED-TESTED` & `IMPLEMENTED` | Permission matrix guards verified in `tests/security.test.mjs` |
| **Dual-Format Document Printing** | `AUTOMATED-TESTED` in Software | A4 & 80mm POS Thermal layout styles verified in `tests/phase15-printing-engine.test.mjs` |
| **Physical Printer Output** | `PHYSICAL-DEVICE-REQUIRED` | Requires USB connection to physical 80mm POS thermal / A4 printers |
| **PWA & Service Worker** | `AUTOMATED-TESTED` & `DEPLOYED` | `public/manifest.json` and `public/sw.js` verified via `tests/phase17-pwa-performance-a11y.test.mjs` |
| **Operational Health & Error Telemetry** | `AUTOMATED-TESTED` & `IMPLEMENTED` | `lib/health.ts` verified via `tests/phase19-backup-monitoring-dr.test.mjs` |
| **Tauri 2 Windows Desktop Client Config** | `AUTOMATED-TESTED` & `IMPLEMENTED` | `src-tauri/` configuration verified via `tests/phase18-infrastructure-desktop.test.mjs` |
| **Tauri Desktop Updater Signing** | `EXTERNAL-CREDENTIAL-REQUIRED` | Requires generating private key via `tauri signer generate` for production releases |
| **Custom Domain DNS (onneshahospital.com)** | `OWNER-ACTION-REQUIRED` | Requires owner pointing DNS CNAME/A records to Cloudflare Pages |
| **SMS / WhatsApp / Email Live Keys** | `EXTERNAL-CREDENTIAL-REQUIRED` | Requires owner adding SSL Wireless, Meta WhatsApp, Resend keys to environment |
| **Payment Gateway Merchant Credentials** | `EXTERNAL-CREDENTIAL-REQUIRED` | Requires live bKash, Nagad, SSLCommerz merchant credentials |
| **Supabase Database Backup & PITR** | `OWNER-ACTION-REQUIRED` | Managed daily backups active on Supabase Cloud; manual restore drill requires DB console action |
