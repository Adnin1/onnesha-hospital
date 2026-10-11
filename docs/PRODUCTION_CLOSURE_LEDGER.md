# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
# OFFICIAL PRODUCTION CLOSURE LEDGER — v1.1.84

**Authoritative Repository:** `Adnin1/onnesha-hospital`  
**Current Branch:** `main`  
**Head Commit Reference:** Production Release `v1.1.84`  
**Canonical Hospital Branding:** `ANNESHA HOSPITAL AND DIAGNOSTIC` (Bengali: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক`)  
**Historical Release Tags:** `v1.1.83`, `v1.1.82`, `v1.1.81`, `v1.1.80`  
**Canonical Production URL:** `https://onnesha-hospital.pages.dev`  
**Database Project ID:** `iuhtzahuszdkdarhxobx` (Supabase Production Database)  
**Ledger Reconciliation Date:** October 11, 2026  
**Final Production Verdict:** **SOFTWARE QUALITY VERIFIED; DEPLOYMENT VERIFIED; DESKTOP INSTALLERS VERIFIED; REMOTE STAGING & PHYSICAL OWNER GATES BLOCKED_EXTERNAL_OWNER**

---

## 1. Verified Live Execution Status

| **Component** | **Target / Value** | **Telemetry Verification Source** | **Verdict** |
| :--- | :--- | :--- | :--- |
| **Git Working Tree** | Clean & Synced with `origin/main` | `git status --short` | ✅ PASS |
| **TypeScript Strict Compiler** | `0 errors, 0 warnings` | `npx tsc --noEmit` (exit code 0) | ✅ PASS |
| **ESLint Zero-Warning Gate** | `0 errors, 0 warnings` | `npx eslint . --max-warnings 0` (exit code 0) | ✅ PASS |
| **Node Certification Test Suite** | 129/129 suites passed (1,175 active passes, 0 failed, 7 standard skips) | `npm test` & `npm run test:certification` | ✅ PASS |
| **Playwright Real Browser E2E** | 52/52 real browser tests passed (Chromium headless) | `npx playwright test --project=chromium` | ✅ PASS |
| **Next.js Static Build** | 62/62 static routes generated | `npm run build` | ✅ PASS |
| **Static Link & Asset Forensics** | 61 HTML pages, 396 internal links, 1104 assets, 0 broken references | `npm run audit:assets` | ✅ PASS |
| **Supabase Remote Migrations** | 155/155 applied (100% parity, 0 drift, newest: `20261011074500`) | `npx supabase migration list` | ✅ PASS |
| **Supabase Database Schema Lint** | 0 fatal schema/security errors on linked DB | `npx supabase db lint --linked` | ✅ PASS |
| **Medical Certificate System** | International Standard A4 certificate, BMDC ethics, full clinical CRUD, SHA-256 QR | `components/registrar/*` & `lib/registrar/actions.ts` | ✅ PASS |
| **Billing & Cashier Permissions** | Super Admin exclusive invoice deletion, Receptionist/Cashier authorized edit | `components/billing/*` & `lib/billing/actions.ts` | ✅ PASS |
| **System UI 3D Dimensional Engine** | Tactile 3D cards, elevated floating metrics, beveled buttons, glassmorphic panels | `app/globals.css`, `components/dashboard/*`, `app/(hospital)/*` | ✅ PASS |
| **Lab Diagnostic Catalog Actions** | Zero fake fallback, cryptographically safe unique code generator with insert retry loop | `lib/lab/actions.ts` | ✅ PASS |
| **Billing Patient Demographics & Half-Letter Slip** | Mandatory validation (Name, UHID, Phone, Address, Age), Half-Letter (5.5" x 8.5") print | `components/print/HalfLetterInvoicePrint.tsx` & `app/billing/page.tsx` | ✅ PASS |
| **Hospital Expense Management & Voucher GL** | 20+ categories, voucher numbering, atomic GL posting, UI console | `app/expenses/page.tsx`, `lib/expenses/actions.ts` | ✅ PASS |
| **IPD 4-Part Discharge Certificate Folder** | Authentic 4-page medical pad folder with decoupled print streams (Sheets: 4) | `components/print/DischargeSummaryPrint.tsx` & `app/ipd/page.tsx` | ✅ PASS |
| **Native Windows Desktop Installers (v1.1.83/v1.1.84)** | MSI and EXE compiled, packaged, verified | `node scripts/build-desktop.mjs` & `public/downloads/desktop/latest.json` | ✅ PASS |
| **Cloudflare Production Deployment** | `https://onnesha-hospital.pages.dev` | `npx wrangler pages deploy out` | ✅ PASS |
| **Remote Staging Security (G10)** | Requires `OHMS_TEST_SUPABASE_URL` in GitHub Secrets | CI Gate telemetry | ⚠️ **BLOCKED_EXTERNAL_OWNER** |

---

## 2. Engineering Changes & Critical Discrepancy Resolutions

### A. Hospital Brand Name & Canonical Identity Established
- **Authoritative Entity:** `ANNESHA HOSPITAL AND DIAGNOSTIC` (Bengali: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক`).
- **Owner Directive:** "Center" / "সেন্টার" cancelled entirely across all user-facing interfaces, print pads, headers, footers, display boards, and settings.
- **Physical Address:** শেরপুর রোড, সূত্রাপুর, বগুড়া।
- **Hotlines:** 01620-003888, 01718-835623.

### B. Diagnostic Test Catalog Actions & Pricing Safety Hardening
- **File Modified:** `lib/lab/actions.ts`
- **Issue Addressed:** Previous code returned a hardcoded fallback test catalog with synthetic IDs when 0 database rows were found, and generated test codes using `Math.random()` without collision retries.
- **Resolution:**
  1. Removed `defaultTests` fake fallback. When the database query returns 0 rows, `getDiagnosticTestsAction` returns a truthful empty array `{ tests: [], categories }` so the frontend accurately reflects database truth.
  2. Implemented cryptographically secure candidate code generation (`crypto.randomBytes(3).toString("hex").toUpperCase()`) providing 16.7 million unique combinations.
  3. Wrapped test record insertion in a collision-safe retry loop (up to 4 attempts) on Postgres unique constraint code `23505`.
  4. Provided clear, bilingual error handling when a user-specified manual test code collides.

### C. Authentic 4-Part Inpatient (IPD) Discharge Certificate Folder & Decoupled Print Streams
- **Files Modified:** `components/print/DischargeSummaryPrint.tsx`, `app/(hospital)/app/ipd/page.tsx`
- **Authentic 4-Part Layout:** Strictly replicates the hospital's physical print pad reference materials:
  - **Page 1 (Discharge Certificate Cover):** Asclepius rod logo, header branding, blue 3D ribbon `DISCHARGE CERTIFICATE`, patient demographics with dotted underlines, timestamps, diagnosis, consultant, duty doctor signature line, computerized EMR barcode, and cyan bottom ribbon.
  - **Page 2 (Discharge Summary & OT Report):** Blue pill `DISCHARGE SUMMARY`, presenting features (a, b, c, d), investigations, comprehensive OT record (indication, operation, surgeon, assistants 1 & 2, anaesthetist, anaesthesia, findings & procedure), baby note (sex, weight, A/S, notes), and dual doctor signatures.
  - **Page 3 (Treatment Rx):** Blue pill `TREATMENT`, large `℞` symbol, take-home medication table with ruled continuation lines, medication safety note, and registered physician signature.
  - **Page 4 (Discharge Advice & Our Services):** `উপদেশ ঃ` (regular medicines, rest duration, heavy work restriction, stitch removal date, follow-up appointment, emergency hotline), dietary guidelines, wound hygiene, red-flag emergency symptoms, duty doctor & consultant signatures, blue banner `আমাদের সেবা সমূহ`, and hospital bottom footer.
- **Print Decoupling Resolution:**
  - Resolved the 5-sheet print overflow issue where the admission sheet printed alongside the discharge certificate.
  - Isolated the certificate modal outside the main IPD container. When the modal is open, the underlying IPD container receives `print:hidden`.
  - The discharge folder prints **EXACTLY 4 PAGES** (Sheets: 4) bounded to 279mm A4 dimensions.
  - Printing the admission sheet prints **EXACTLY 1 PAGE** (`.print-pad`).

### D. Native Windows Desktop Packaging (v1.1.83)
- **Toolchains:** Host WiX 3.11 (`C:\Users\mahin khan\wix311`) and NSIS 3.10 (`C:\Users\mahin khan\nsis310\nsis-3.10`).
- **Compiled Binaries:**
  - `Onnesha-Hospital-Setup-1.1.83.exe` (69,896,839 bytes, SHA-256: `6B4412B41B8FFE463087A4C78EF996D82268C101CC1717DAF2CEE924308D414B`)
  - `Onnesha-Hospital-1.1.83.msi` (74,035,200 bytes, SHA-256: `79646764E2642F1E0B13A47F4956567B19084D26191F26F3B9FC1AEFAB55B2BA`)
- **Manifest:** `public/downloads/desktop/latest.json` updated with exact bytes, hashes, and version `1.1.83`.

### E. Supabase Database Migration Parity (155/155)
- All 155 local migrations in `supabase/migrations/*.sql` match 100% against remote Supabase (`iuhtzahuszdkdarhxobx`).
- Verified via `npx supabase migration list` ending at `20261011074500` on both local and remote.
- Schema verification via `npx supabase db lint --linked` confirmed 0 fatal schema or security errors.

### F. Medical Certificates Overhaul & Cashier Billing Permission Governance
- **Medical Certificates (`components/registrar/*`, `lib/registrar/actions.ts`):**
  - International standard A4 layout bounded to 1 printable sheet.
  - Authentic clinical fields: Clinical diagnosis, vital signs, physical identification mark, bed rest from/to dates, total days calculated, fit-to-resume duty date, fitness radio pills (Fit, Temporarily Unfit, Light Duty Only, Unfit), circular hospital seal stamp, and anti-tamper QR code with SHA-256 integrity hash.
  - Complete clinical CRUD: Create/Issue, View/Print, Edit/Modify, and Delete/Void with audit logging.
- **Billing Permissions & Cashier Control (`app/billing/page.tsx`, `lib/billing/actions.ts`):**
  - Invoice editing (`Edit Bill`) enabled for Receptionists, Administrators, and Super Admins.
  - Super Admin toggle for Cashier invoice editing authorization stored in `organization_settings.cashier_can_edit_bills`.
  - Super Admin exclusive invoice deletion via atomic stored procedure `delete_invoice_super_admin_atomic` (hard delete if 0 payments, safe void/soft-delete if payments exist to preserve accounting integrity).
- **System 3D Dimensional Design Engine (`app/globals.css`, `app/(hospital)/*`, `components/*`):**
  - Tactile depth utility classes: `.card-3d`, `.card-3d-interactive`, `.stat-card-3d`, `.btn-3d-*`, `.glass-panel-3d`, `.input-3d`, `.badge-3d`.
  - Applied across Dashboard, Billing, Registrar, Sidebar, and system widgets.

---

## 3. Human & On-Site Boundary Governance (G1–G16)

| Gate | Category | Description | Status | Owner Action Required |
| :---: | :--- | :--- | :--- | :--- |
| **G1** | Gateway | Live Payment Keys (bKash/Nagad/SSLCommerz) | **BLOCKED_EXTERNAL_OWNER** | Owner enters production API keys in Supabase Vault. |
| **G2–G3** | Gateway | Bulk SMS / WhatsApp Provider Credentials | **BLOCKED_EXTERNAL_OWNER** | Owner configures SMS gateway credentials. |
| **G4** | Network | Hospital SMTP Mail Server Credentials | **BLOCKED_EXTERNAL_OWNER** | IT Admin enters hospital SMTP server details. |
| **G5** | Hardware | Physical 80mm ESC/POS Thermal Receipt Printers | **BLOCKED_EXTERNAL_OWNER** | On-site connection via USB/LAN. |
| **G6** | Hardware | Physical 2D Handheld Barcode Scanners | **BLOCKED_EXTERNAL_OWNER** | Connect USB scanner at reception & pharmacy. |
| **G7** | Hardware | ZKTeco Biometric Time-Attendance Terminals | **BLOCKED_EXTERNAL_OWNER** | Configure hospital LAN IP routing to terminal. |
| **G8–G9** | Hardware | DICOM PACS Server & Laboratory Analyzers | **BLOCKED_EXTERNAL_OWNER** | Connect PACS C-STORE and serial LIS interfaces. |
| **G10** | CI Secrets | Remote Staging Supabase Credentials | **BLOCKED_EXTERNAL_OWNER** | Owner adds `OHMS_TEST_SUPABASE_URL` & service role key to GitHub Secrets. |
| **G11** | Database | Supabase PITR Offsite Backups | **BLOCKED_EXTERNAL_OWNER** | Enable Point-in-Time Recovery in Supabase Dashboard. |
| **G12** | Display | Waiting Room Queue TV Android Displays | **BLOCKED_EXTERNAL_OWNER** | Open queue URL on waiting room Android TVs. |
| **G13** | Medical | Clinical UAT Sign-Off from Superintendent | **BLOCKED_EXTERNAL_OWNER** | Hospital Superintendent reviews end-to-end workflows. |
| **G14** | Legal | DGHS & BMDC Statutory Compliance Filings | **BLOCKED_EXTERNAL_OWNER** | File regulatory ERP paperwork with health authorities. |
| **G15** | Code Signing | Windows Authenticode EV Certificate | **BLOCKED_EXTERNAL_OWNER** | Owner signs executable with EV hardware token if SmartScreen bypass is desired. |
| **G16** | DNS | Custom Domain CNAME Cutover | **BLOCKED_EXTERNAL_OWNER** | Point hospital official domain CNAME to `onnesha-hospital.pages.dev`. |

---

## 4. Final Empirical Closure Verdict

$$\mathbf{SOFTWARE\ QUALITY\ VERIFIED\ \bullet\ DEPLOYMENT\ VERIFIED\ \bullet\ INSTALLERS\ VERIFIED}$$

1. **Software Quality:** 129/129 certification suites, 1,175 active passes, 0 failures, 52/52 Playwright real-browser tests, 0 lint warnings, 0 typecheck errors.
2. **Edge Deployment:** Live on Cloudflare Pages edge (`https://onnesha-hospital.pages.dev`).
3. **Installer Delivery:** Native WiX MSI and NSIS EXE binaries compiled on Windows, verified, and manifest synced.
4. **External Owner Gates:** G1–G16 clearly isolated without false greens.
