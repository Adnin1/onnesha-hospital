# Onnesha Hospital Management System — Owner Action Checklist

## Overview
This document contains the exact real-world external prerequisites required from the hospital owner, IT administrator, or domain registrar prior to live commercial operations.

All application code, database schema, security policies, and user interfaces are **100% Code-Complete and Automated-Tested**. The items below require external keys, hardware, or third-party portal setup.

---

## 📋 Itemized Owner Action Checklist

### 🌐 1. Custom Domain & DNS Setup
- [ ] **Point DNS CNAME / A Records:** Point `onneshahospital.com` and `www.onneshahospital.com` to Cloudflare Pages (`onnesha-hospital.pages.dev`).
- [ ] **Verify SSL/TLS Certificate:** Ensure Cloudflare Universal SSL displays green padlock on `https://onneshahospital.com`.
- [ ] **Configure Environment Variable:** Set `NEXT_PUBLIC_SITE_URL=https://onneshahospital.com` in Cloudflare Pages build configuration.

### 🔑 2. Live External API Credentials (Environment Variables)
- [ ] **SMS Gateway Key:** Set `SMS_GATEWAY_API_KEY` (SSL Wireless / Greenweb) in `.env.local` / Cloudflare Pages secrets.
- [ ] **WhatsApp Business API Secret:** Set `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` from Meta Business Manager.
- [ ] **Email Provider Key:** Set `RESEND_API_KEY` or SendGrid credentials for transactional emails.
- [ ] **bKash Merchant Credentials:** Set `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` (Live Merchant).
- [ ] **Nagad Merchant Credentials:** Set `NAGAD_MERCHANT_ID`, `NAGAD_PUBLIC_KEY`, `NAGAD_PRIVATE_KEY` (Live Merchant).
- [ ] **SSLCommerz Credentials:** Set `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` (Live Merchant).

### 🖨️ 3. Physical Hardware & PC Installation
- [ ] **Connect POS Thermal Printer:** Plug 80mm roll POS thermal receipt printer into hospital reception/billing PC via USB.
- [ ] **Connect A4 Printer:** Connect standard A4 laser printer for prescriptions, lab reports, and formal invoices.
- [ ] **Connect USB Scanners:** Plug USB barcode / QR code scanners into reception and pharmacy checkout PCs.
- [ ] **Install Windows Desktop Client:** Download and run `Onnesha-Hospital-Setup-1.0.0.msi` from `https://onneshahospital.com/downloads/desktop` on hospital Windows PCs.

### 🔐 4. GitHub Actions CI/CD Secrets (Staging & Production Gates)
- [ ] **Staging Security Gate Secrets:** In GitHub Repo Settings -> Secrets and variables -> Actions (Environment: `staging`), set `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` to allow the automated fail-closed staging security gate to verify live cross-tenant RLS isolation.
- [ ] **Production Deployment Secrets:** In GitHub Repo Settings -> Secrets and variables -> Actions (Environment: `production`), set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for automated deployment to Cloudflare Pages.

### 🔐 5. Desktop Updater Signing Key Setup
- [ ] **Generate Tauri Private Signing Key:** Run `npx tauri signer generate` on a secure offline machine.
- [ ] **Configure Public Key:** Add public signing key string to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
- [ ] **Store Private Key Securely:** Store private key string in private build server environment variable `TAURI_SIGNING_PRIVATE_KEY` (NEVER commit to git repository).

### 🗄️ 6. Supabase Production Project Setup
- [ ] **Upgrade Supabase Project Tier:** Ensure production Supabase project is on Pro/Enterprise plan for managed daily backups.
- [ ] **Execute Disaster Recovery Restore Drill:** Perform a test database restore drill on a staging/non-production database instance to record RTO/RPO metrics.

---

## 🎯 Launch Status Statement
Upon completion of the above owner actions, the system status upgrades from **`PRODUCTION READY AFTER OWNER ACTIONS`** to **`PRODUCTION READY & GO-LIVE APPROVED`**.

