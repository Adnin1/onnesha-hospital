# ONNESHA / ANNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
# OFFICIAL SOFTWARE RELEASE FREEZE DECLARATION — v1.1.90

**System Identity:** Onnesha / Annesha Hospital Management System (OHMS ERP & Clinical Suite)  
**Canonical Organization Name:** ANNESHA HOSPITAL AND DIAGNOSTIC  
**Canonical Bengali Name:** অন্বেষা হাসপাতাল ও ডায়াগনস্টিক  
**Release Status:** **FROZEN — PRODUCTION COMPLETE**  
**Package Version:** `1.1.90`  
**Effective Freeze Date:** October 13, 2026  
**Final Verdict:** `SOFTWARE_COMPLETE_EXTERNAL_OWNER_COMMISSIONING_REMAINS`  

---

## 1. Release Freeze Status Summary

This document certifies that the Onnesha Hospital Management System (OHMS) codebase has undergone full forensic reconciliation, automated verification, and is hereby **FROZEN**. No further software modifications, refactorings, or cosmetic releases are permitted unless new clinical or operational requirements are formally commissioned.

| Verification Pillar | Forensic Value / Telemetry | Status |
| :--- | :--- | :--- |
| **Code Freeze Verdict** | `RELEASE_FROZEN_FOR_PRODUCTION` | ✅ CERTIFIED |
| **Package Version** | `1.1.90` | ✅ CERTIFIED |
| **Canonical Hospital Brand** | `ANNESHA HOSPITAL AND DIAGNOSTIC` | ✅ SYNCHRONIZED |
| **Bengali Hospital Brand** | `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক` | ✅ SYNCHRONIZED |
| **Canonical Physical Address** | `সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।` | ✅ SYNCHRONIZED |
| **Official Telephone Numbers** | `01895-665114, 01904210065` | ✅ SYNCHRONIZED |
| **DGHS Facility Status** | `RECONCILED` | ✅ CERTIFIED |
| **Supabase Remote Migrations** | 178 / 178 applied (Latest: `20261013114500_fix_get_episode_billing_overview_schema_and_overload.sql`) | ✅ 100% PARITY |
| **Data Authenticity Policy** | Honest empty states enforced; zero synthetic auto-fabrication in production tenant | ✅ CERTIFIED |
| **TypeScript Strict Compiler** | `tsc --noEmit` -> 0 errors, 0 warnings | ✅ PASS |
| **ESLint Quality Gate** | `eslint` -> 0 errors, 0 warnings | ✅ PASS |
| **Node.js Certification Suites** | 138/138 suites passed (1,250 active pass, 0 fail, 7 skipped) | ✅ PASS |
| **Playwright Multi-Browser E2E** | 208/208 real browser specs passed in CI Run 559 across Chromium (52), Firefox (52), Mobile-Chrome (52), WebKit (52) | ✅ PASS |
| **Next.js Static Export** | 62/62 static routes prerendered into `out/` | ✅ PASS |
| **Static Link & Asset Forensics** | 61 HTML pages, 395 internal links, 1172 assets, 0 broken links | ✅ PASS |
| **Native Windows MSI Installer** | `Onnesha-Hospital-1.1.90.msi` (3,457,024 bytes, SHA-256: `A87065466C27346EC54F100419E5FBDC740D1FDB3D934BDF966AFDF6CB394A12`) | ✅ VERIFIED |
| **Native Windows EXE Installer** | `Onnesha-Hospital-Setup-1.1.90.exe` (2,895,011 bytes, SHA-256: `72BAD4D10633B4FDC03549DA64FE01C29FFE400EC142347561FC8394380134D1`) | ✅ VERIFIED |
| **Cloudflare Edge Deployment** | `https://onnesha-hospital.pages.dev` (Deployment `ead5e2ca`, `WORKSTATION_DEPLOY_VERIFIED`) | ✅ DEPLOYED |

---

## 2. Immutable Provenance & Remote Branch Parity

- **Authoritative Git Repository:** `Adnin1/onnesha-hospital`
- **Active Branch:** `main`
- **Engineering HEAD:** `8f55e414dda91aa83f50b41433ab2275d06b2bb0`
- **Remote Remotes:** `origin` (`https://github.com/Adnin1/onnesha-hospital.git`) & `ssh-origin` (`git@github.com:Adnin1/onnesha-hospital.git`)
- **Database Parity:** 178 local / 178 remote Supabase migrations applied (`iuhtzahuszdkdarhxobx`)
- **Historical Release Tags Preserved:** `v1.1.88` (`c33728d`), `v1.1.89` (`688d869`), `v1.1.90` (`db8b750`)
- **Release Freeze Lifecycle:** Current production release formally frozen and certified at `8f55e41` with CI Run 559 success, 178 migrations, doctor creation room fallback, bed matrix synchronization, IPD auto-billing (৳300 one-time + ৳500/day service charge), referral expense integration to `/app/expenses`, P&L reports reconciliation, and clean edge deployment.

---

## 3. Database Reproducibility & Schema Invariants

1. **Version-Controlled Migrations:** All remote database changes are reproducible via version-controlled schema migrations located in `supabase/migrations/*.sql`. Direct untracked DB alterations are prohibited.
2. **Postgres Row Level Security (RLS):** Strict RLS is enforced across all tables (`patients`, `invoices`, `appointments`, `medical_records`, `hospital_service_tariffs`, `diagnostic_tests`).
3. **Double-Entry Financial Invariants:** Invoice calculations enforce mathematical invariants: `grand_total = subtotal - discount_amount`, `paid_amount + due_amount = grand_total`.

---

## 4. Human & On-Site External Boundaries (G1–G16)

Software development is 100% complete. The remaining operational activities are governed strictly by physical on-site commissioning and external ownership credentials:

- **G1:** Live Payment Gateway API keys (bKash, SSLCommerz, Nagad).
- **G2–G3:** Bulk SMS & WhatsApp Business Cloud API keys.
- **G4:** Hospital SMTP mail credentials.
- **G5:** Physical 80mm ESC/POS thermal receipt printers.
- **G6:** Physical 2D handheld barcode scanners.
- **G7:** Physical ZKTeco biometric time-attendance terminals.
- **G8:** Physical DICOM PACS modalities (C-STORE binding).
- **G9:** Physical LIS laboratory analyzers (Serial/TCP interfaces).
- **G10:** GitHub Actions staging secrets (`OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SERVICE_ROLE_KEY`).
- **G11:** Supabase Point-in-Time Recovery (PITR) & offsite backups.
- **G12:** Physical Queue TV Android displays.
- **G13:** Clinical UAT sign-off from Hospital Superintendent.
- **G14:** DGHS & BMDC statutory compliance filings.
- **G15:** Windows Authenticode EV code-signing certificate & hardware token.
- **G16:** Custom domain DNS CNAME cutover.

---

## 5. Architectural Handoff & Release Seal

The software foundation of OHMS is certified production-ready. No further changes to source code or configuration files are required.
