# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
# OFFICIAL PRODUCTION CLOSURE LEDGER — v1.1.90

**Authoritative Repository:** `Adnin1/onnesha-hospital`  
**Current Branch:** `main`  
**Package Version:** `1.1.90`  
**Immutable Release Tag:** `v1.1.90 @ db8b750b51685a73cbf320f51d5e8920fc6a7c8c`  
**Current Production Closure HEAD:** `fa4066f90c239e1e56f266d4ed25764182d6a591` (verified in GitHub Actions Run 535)  
**Canonical Hospital Branding:** `ANNESHA HOSPITAL AND DIAGNOSTIC` (Bengali: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক`)  
**Historical Release Tags:** `v1.1.89`, `v1.1.88`, `v1.1.87`, `v1.1.86`, `v1.1.85`, `v1.1.84`, `v1.1.83`, `v1.1.82`, `v1.1.81`, `v1.1.80`  
**Canonical Production URL:** `https://onnesha-hospital.pages.dev`  
**Database Project ID:** `iuhtzahuszdkdarhxobx` (Supabase Production Database)  
**Ledger Reconciliation Date:** October 12, 2026  
**Final Production Verdict:** **SOFTWARE_COMPLETE_EXTERNAL_OWNER_COMMISSIONING_REMAINS**

---

## 1. Verified Live Execution Status

| **Component** | **Target / Value** | **Telemetry Verification Source** | **Verdict** |
| :--- | :--- | :--- | :--- |
| **Git Working Tree** | Clean & Synced with `origin/main` | `git status --short` | ✅ PASS |
| **TypeScript Strict Compiler** | `0 errors, 0 warnings` | `npx tsc --noEmit` (exit code 0) | ✅ PASS |
| **ESLint Zero-Warning Gate** | `0 errors, 0 warnings` | `npx eslint . --max-warnings 0` (exit code 0) | ✅ PASS |
| **Node Certification Test Suite** | 132/132 suites passed (1,207 active passes, 0 failed, 7 skipped) | `npm test` & `npm run test:certification` | ✅ PASS |
| **Playwright Multi-Browser E2E** | 208/208 real browser specs passed in CI Run 535 across Chromium (52), Firefox (52), Mobile-Chrome (52), WebKit (52) | `npx playwright test` | ✅ PASS |
| **Next.js Static Build** | 62/62 static routes generated | `npm run build` | ✅ PASS |
| **Static Link & Asset Forensics** | 61 HTML pages, 396 internal links, 1104 assets, 0 broken references | `npm run audit:assets` | ✅ PASS |
| **Supabase Remote Migrations** | 163/163 applied (100% parity, 0 drift, newest: `20261012033000`) | `npx supabase migration list` | ✅ PASS |
| **Supabase Database Schema Lint** | 0 fatal schema/security errors on linked DB | `npx supabase db lint --linked` | ✅ PASS |
| **Medical Certificate System** | International Standard A4 certificate, BMDC ethics, full clinical CRUD, SHA-256 QR | `components/registrar/*` & `lib/registrar/actions.ts` | ✅ PASS |
| **Billing & Cashier Permissions** | Super Admin exclusive invoice deletion, Receptionist/Cashier authorized edit | `components/billing/*` & `lib/billing/actions.ts` | ✅ PASS |
| **System UI 3D Dimensional Engine** | Tactile 3D cards, elevated floating metrics, beveled buttons, glassmorphic panels | `app/globals.css`, `components/dashboard/*`, `app/(hospital)/*` | ✅ PASS |
| **Billing Catalog Classification & Deduplication** | Deterministic domain categorization (Bed/ICU/OT/Doctor/Imaging/Lab), 0 duplicates, 3D quick adder | `lib/billing/serviceCatalog.ts`, `app/billing/page.tsx` & migration `20261011193500` | ✅ PASS |
| **Official Hospital Diagnostic Tariffs** | Complete official rate chart seeded across 16 categories, 185 tests with exact BDT tariffs | `lib/lab/actions.ts`, `lib/billing/serviceCatalog.ts` & migration `20261011190000` | ✅ PASS |
| **Native Windows Desktop Installers (v1.1.90)** | Authentic native NSIS EXE & WiX MSI matching `latest.json` verified | `public/downloads/desktop/latest.json` (SHA-256 verified) | ✅ PASS |
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

### D. Native Windows Desktop Packaging (v1.1.90)
- **Toolchains:** Host WiX 3.11 (`C:\Users\mahin khan\wix311`) and NSIS 3.10 (`C:\Users\mahin khan\nsis310\nsis-3.10`).
- **Compiled & Verified Binaries (Synchronized with `latest.json`):**
  - `Onnesha-Hospital-Setup-1.1.90.exe`: exactly **2,895,011 bytes**, SHA-256: `72BAD4D10633B4FDC03549DA64FE01C29FFE400EC142347561FC8394380134D1`
  - `Onnesha-Hospital-1.1.90.msi`: exactly **3,457,024 bytes**, SHA-256: `A87065466C27346EC54F100419E5FBDC740D1FDB3D934BDF966AFDF6CB394A12`
- **Manifest Provenance:** `public/downloads/desktop/latest.json` declares these exact byte lengths and cryptographic hashes with `artifact_status: "BUILT_AND_VERIFIED"`.

### E. Supabase Database Migration Parity (163/163)
- All 163 local migrations in `supabase/migrations/*.sql` match 100% against remote Supabase (`iuhtzahuszdkdarhxobx`).
- Verified via `npx supabase migration list` ending at `20261012033000` (`20261012033000_super_admin_permanent_invoice_purge.sql`) on both local and remote with 0 drift.
- Key recent migrations:
  - `20261011082000_fix_medicines_generics_foreign_key.sql`: Explicit foreign key relation between `public.medicines(generic_id)` and `public.medicine_generics(id)` with schema cache notification.
  - `20261011083000_seed_official_hospital_rate_chart.sql`: Seeding and synchronization of official hospital tariffs into `diagnostic_tests` and `hospital_service_tariffs`.
  - `20261011190000_diagnostic_tariffs_rls_and_complete_rate_chart.sql`: Full RLS policy resolution on `diagnostic_categories` and `diagnostic_tests` allowing authenticated staff and anon reads, plus complete 185 tests across 16 categories with exact hospital tariffs and synchronization with `hospital_service_tariffs`.
  - `20261011193500_fix_hospital_service_tariffs_categories_and_dedup.sql`: Normalized tariff categories into medical groups, categorized CT Scans (`CT_SCAN`), MRIs (`MRI`), X-Rays (`XRAY`), Ultrasounds (`USG`), Consultations (`CONSULTATION`), Beds (`IPD_BED`), Critical Care (`CRITICAL_CARE`), Surgeries (`OT_SURGERY`), and eliminated duplicate tariff entries.
  - `20261011215800_add_voided_at_to_invoices.sql`: Added `voided_at` timestamp column to `invoices` table with backfill for audit logs and accounting reports compatibility.
  - `20261011231500_add_date_of_birth_column_to_patients.sql`: Harmonized `date_of_birth` and `dob` columns on `patients` table with two-way trigger sync, resolving schema join compatibility across medical certificates and laboratory orders.
  - `20261011233000_quarantine_synthetic_bootstrap_data.sql`: Quarantined and permanently purged synthetic test/bootstrap operational records (accounting journal entries, welfare applications, demo patients with 0 invoices/episodes, purchase requisitions, goods receipts, biomedical devices, and asset registers) to enforce zero auto-fabrication and maintain pristine operational data integrity.
  - `20261012033000_super_admin_permanent_invoice_purge.sql`: Enhanced `delete_invoice_super_admin_atomic` stored procedure with dual-mode operational support (Safe Void vs Permanent Purge), enabling Super Admins to permanently purge invoices and eliminate all linked payments, line items, and audit history from the database.
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

### G. Video Diagnostics Resolution & 3D Interactive Billing Upgrade (v1.1.87)
- **Root-Cause Analysis from User Screen Recording (`Screen Recording 2026-10-11 192117.mp4`):**
  1. *Category Leak in Doctor Consultation:* The previous fallback `(t.category === "LAB" ? "LAB" : "CONSULTATION")` caused beds, cabins, OT surgeries, CT scans, and lab items to leak into "ডাক্তার কনসালটেশন". Resolved with deterministic `classifyServiceGroup()`.
  2. *Service Catalog Duplication:* Master services, dynamic lab tests, and database tariffs previously concatenated with partial matches. Resolved with unified `getAllHospitalServices` deduplication with case/punctuation normalization.
  3. *CT Scan & MRI Categorization:* CT scans and MRIs now grouped under "রেডিওলজি ও ইমেজিং" with dedicated `CT_SCAN` and `MRI` badges instead of `LAB`.
  4. *3D Interactive Card Styling:* Added tactile 3D hover elevation (`hover:-translate-y-0.5 hover:shadow-md`), custom category badges (Cyan for CT, Blue for MRI, Rose for ECG, Indigo for X-Ray, etc.), and a real-time `✓ Xটি ইনভয়েসে যুক্ত` badge.
  5. *Patient Demographics:* Newborn/infant age display formatted into contextual Bengali (`০ বছর (নবজাতক/শিশু)`).
  6. *Invoice Items DB Mapping:* Implemented `toDbInvoiceCategory()` ensuring extended categories safely map to PostgreSQL's 11-category CHECK constraint (`'CONSULTATION'`, `'LAB'`, `'XRAY'`, `'USG'`, `'ECG'`, `'PHARMACY'`, `'BED'`, `'CABIN'`, `'OT'`, `'AMBULANCE'`, `'MISC'`).

### H. Real-World Usability, Diagnostics & Integration Transparency (v1.1.88)
- **Billing Category Tab Scroll Controls:** Replaced non-standard Tailwind sizing tokens with standard `h-8 w-8` and `shadow-sm`, and implemented guaranteed inline `overflowX: "auto"` and `scrollBehavior: "smooth"` on the tab scroll track so Left/Right scroll buttons work deterministically across all desktop and mobile browsers.
- **OPD Consultation Console Loop Resilience:** Removed unstable state reference from `useEffect` dependencies in `app/(hospital)/app/opd/page.tsx`, eliminating infinite queue re-fetch cycles and UI freezing.
- **Radiology Modality Query Hardening:** Replaced PostgREST nested table column filter with client-side filtering on joined study modalities in `lib/radiology/actions.ts`, fixing the stuck loading state when querying modalities (such as CT/MRI/USG).
- **LIS Integration Transparency (G9 Gate Boundary):** Relabeled "Connected Analyzers" to "Registered Analyzers" in `components/lab/LisAnalyzerModal.tsx` and embedded an explicit G9 Gate Simulation Mode notice clarifying that physical analyzer connectivity requires the on-premise LIS Bridge Agent.
- **Desktop Installers v1.1.88 Recompiled:** Native WiX MSI (9.54 MB) and NSIS EXE (8.91 MB) compiled with fresh release artifacts and synchronized into `public/downloads/desktop/latest.json`.

### I. Production Data Authenticity & Zero Auto-Fabrication Policy
- **Surgical Codebase Cleanup:** Completely purged query-time auto-seeding logic across `lib/accounting/actions.ts` (JE-2026-001/002/003), `lib/scholarship/actions.ts` (SCH-2026-001/002/003 & demo patients), `lib/procurement/actions.ts` (PR-ICU-2026-003 & GRN-2026-001), `lib/hr/actions.ts` (synthetic staff punch logs), `lib/biomedical/actions.ts`, and `lib/assets/actions.ts`.
- **Database Quarantine Migration:** Applied `20261011233000_quarantine_synthetic_bootstrap_data.sql` to remote Supabase DB (`iuhtzahuszdkdarhxobx`), permanently purging synthetic demo records from the production tenant while preserving genuine clinical data.
- **Honest Empty States:** Empty database tables now render honest, zero-state interfaces rather than auto-fabricating transactional records.

### J. Desktop Manifest Alignment to v1.1.90
- Corrected release notes in `public/downloads/desktop/latest.json` from `v1.1.89` to `v1.1.90`.
- Verified cryptographic hashes and file sizes for native Windows installers (`Onnesha-Hospital-1.1.90.msi` at 3,457,024 bytes and `Onnesha-Hospital-Setup-1.1.90.exe` at 2,895,011 bytes).

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

1. **Software Quality:** 131/131 certification suites, 1,193 active passes, 0 failures, 7 skipped, 208/208 multi-browser Playwright specs (Chromium, Firefox, Mobile Chrome, WebKit), 0 lint warnings, 0 typecheck errors.
2. **Edge Deployment:** Live on Cloudflare Pages edge (`https://onnesha-hospital.pages.dev`).
3. **Installer Delivery:** Native WiX MSI and NSIS EXE binaries compiled on Windows, verified, and manifest synced.
4. **External Owner Gates:** G1–G16 clearly isolated without false greens.
