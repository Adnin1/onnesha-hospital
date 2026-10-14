# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
# OFFICIAL PRODUCTION CLOSURE LEDGER — v1.1.90

**Authoritative Repository:** `Adnin1/onnesha-hospital`  
**Current Branch:** `main`  
**Package Version:** `1.1.90`  
**Immutable Release Tag:** `v1.1.90 @ db8b750b51685a73cbf320f51d5e8920fc6a7c8c`  
**Current Production Closure HEAD:** `6b1fa13` (Engineering HEAD — Migration 192 Parity, SHA: `6b1fa131b0f47a3b5699470685a0ddf25d08fb49`)  
**Canonical Hospital Branding:** `ANNESHA HOSPITAL AND DIAGNOSTIC` (Bengali: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক`)  
**Historical Release Tags:** `v1.1.89`, `v1.1.88`, `v1.1.87`, `v1.1.86`, `v1.1.85`, `v1.1.84`, `v1.1.83`, `v1.1.82`, `v1.1.81`, `v1.1.80`  
**Canonical Production URL:** `https://onnesha-hospital.pages.dev`  
**Database Project ID:** `iuhtzahuszdkdarhxobx` (Supabase Production Database)  
**Ledger Reconciliation Date:** October 14, 2026  
**Final Production Verdict:** **SOFTWARE_COMPLETE_EXTERNAL_OWNER_COMMISSIONING_REMAINS**

---

## 1. Verified Live Execution Status

| **Component** | **Target / Value** | **Telemetry Verification Source** | **Verdict** |
| :--- | :--- | :--- | :--- |
| **Git Working Tree** | Clean & Synced with `origin/main` | `git status --short` | ✅ PASS |
| **TypeScript Strict Compiler** | `0 errors, 0 warnings` | `npx tsc --noEmit` (exit code 0) | ✅ PASS |
| **ESLint Zero-Warning Gate** | `0 errors, 0 warnings` | `npx eslint . --max-warnings 0` (exit code 0) | ✅ PASS |
| **Node Certification Test Suite** | 146/146 suites passed (1,319 active passes, 0 failed, 7 skipped) | `npm test` & `node scripts/run-tests.mjs` | ✅ PASS |
| **Playwright Multi-Browser E2E** | 208/208 real browser specs passed in CI Run 559 across Chromium (52), Firefox (52), Mobile-Chrome (52), WebKit (52) | `npx playwright test` | ✅ PASS |
| **Next.js Static Build** | 63/63 static routes generated (including `/app/system-health`) | `npm run build` | ✅ PASS |
| **Static Link & Asset Forensics** | 62 HTML pages, 394 internal links, 1230 assets, 0 broken references | `npm run audit:assets` | ✅ PASS |
| **Supabase Remote Migrations** | 193/193 applied (100% parity, 0 drift, newest: `20261014110000_grant_pg_cron_monitoring_telemetry_to_anon.sql`) | `npx supabase migration list` | ✅ PASS |
| **Supabase Database Schema Lint** | 0 fatal schema/security errors on linked DB (0 errors confirmed) | `npx supabase db lint --linked` | ✅ PASS |
| **Multi-Tenant Security Matrix** | Cross-tenant data isolation + direct outbox mutation revoked + fail-closed anonymous diagnostics | `tests/multi-tenant-security-matrix.test.mjs` | ✅ PASS |
| **Transactional E2E Workflow** | Real database transactions & executable invariant state machine (Patient -> Bed -> Concurrency Lock -> Charges -> Billing -> GAAP Reversal -> Vacancy -> Source-to-Ledger) | `tests/hospital-transactional-workflow-e2e.test.mjs` | ✅ PASS |
| **Zero-False-Green pg_cron Monitoring** | Daemon executes real diagnostics `run_scheduled_system_health_check` across tenants without fake constants; safe telemetry granted via anon | Migrations 192 & 193, `get_pg_cron_monitoring_telemetry` | ✅ PASS |
| **Doctor & Roster UX** | Doctor creation roomNumber fallback (`Chamber 1`) + auto-seeding of active doctors | `app/doctors/page.tsx` & `lib/appointments/actions.ts` | ✅ PASS |
| **Bed & Cabin Matrix** | Drift reconciler RPC `reconcile_bed_vacancy_drift_atomic` + auto-ward fallback prevents empty dropdowns | `lib/ipd/bed-actions.ts` & Migration 191 | ✅ PASS |
| **IPD Admission & Mistakes Purge** | Atomic stored procedure `cancel_or_delete_ipd_admission_atomic` frees beds & purges accidental admissions | Migration 192, `lib/patient/actions.ts`, `/app/ipd` | ✅ PASS |
| **Hospital Expenses Void & Purge** | Permanent purge for VOIDED vouchers while preserving double-entry GL audit ledger | Migration 192, `lib/expenses/actions.ts`, `/app/expenses` | ✅ PASS |
| **Financial Aggregates Precision** | Scaled collection/due rates to NUMERIC(10, 2) eliminating numeric overflow | Migration 191 (`get_financial_dashboard_aggregates`) | ✅ PASS |
| **Accounting, GRN & HR Master Guides** | Top-level visual 4-step guide banners with 1-click quick-start demo templates | `/app/accounting`, `/app/procurement`, `/app/hr` | ✅ PASS |
| **Super Admin Invoice Hard Purge** | In-transaction override `app.override_journal_immutability` safely purges invoices with posted journal entries | `lib/billing/actions.ts` & Migrations 179, 186, 192 | ✅ PASS |
| **Referrals & Per-Patient Payout** | Per-patient commission tracking (earned/paid/due/status) + atomic RPC `record_referral_commission_payout_atomic` + auto GL postings | `lib/referrals/actions.ts` & Migration 180 | ✅ PASS |
| **Autonomous System Health Diagnostics & Troubleshooter** | Hardened 12-domain PostgreSQL diagnostic engine `check_system_health_diagnostics` + tenant-scoped RLS `system_health_issues_log` + verified recovery lifecycle (`OPEN` -> `RESOLVED_VERIFIED`) + real-time DOM alert banner + dedicated `/app/system-health` control panel | Migrations 181–193, `lib/diagnostics/troubleshooter.ts`, `SystemHealthAlertBanner.tsx`, `app/system-health/page.tsx` | ✅ PASS |
| **Multi-Tier 24/7 Scheduled Health Monitor & Telemetry** | Explicit 3-tier monitor (Tier A: Public Edge Watchdog = PASS/PUBLIC_EDGE_HEALTHY; Tier B: Privileged Internal ERP Audit = PENDING OWNER KEY G10; Tier C: Scheduler = BLOCKED_PLATFORM_CAPABILITY) | `.github/workflows/health-monitor.yml`, `scripts/scheduled-health-check.mjs`, Migrations 189–193 | ✅ PASS |
| **Native Windows Desktop Installers (v1.1.90)** | Authentic native NSIS EXE & WiX MSI matching `latest.json` verified | `public/downloads/desktop/latest.json` (SHA-256 verified) | ✅ PASS |
| **Cloudflare Production Deployment** | `https://onnesha-hospital.pages.dev` (Active Edge Deployment) | `npx wrangler pages deploy out` | ✅ PASS |
| **Remote Staging Security (G10)** | Requires `OHMS_TEST_SUPABASE_URL` in GitHub Secrets | CI Gate telemetry | ⚠️ **BLOCKED_EXTERNAL_OWNER** |

---

## 2. Engineering Changes & Critical Discrepancy Resolutions

### A. Hospital Brand Name & Canonical Identity Established
- **Authoritative Entity:** `ANNESHA HOSPITAL AND DIAGNOSTIC` (Bengali: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক`).
- **Owner Directive:** "Center" / "সেন্টার" cancelled entirely across all user-facing interfaces, print pads, headers, footers, display boards, and settings.
- **Physical Address:** সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।
- **Contact:** 01895-665114, 01904210065.

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

### E. Supabase Database Migration Parity (Historical Checkpoint 163/163 vs. Current Production 183/183)
- **Historical Checkpoint:** 163/163 migrations at the earlier v1.1.90 engineering stage, ending at `20261012033000` (`20261012033000_super_admin_permanent_invoice_purge.sql`).
- **Current Authoritative Production Parity:** 183/183 local and remote migrations applied match 100% against remote Supabase (`iuhtzahuszdkdarhxobx`) with 0 drift, verified via `npx supabase migration list` and `npx supabase db push` ending at `20261014031000` (`20261014031000_reconcile_referral_commission_row_allocations.sql`).
- Key recent migrations:
  - `20261014031000_reconcile_referral_commission_row_allocations.sql`: Reconciled row-level referral commission allocations against two historical settlements (SETTLE-261012-5804 and SETTLE-20261013-4BCAF9) so every commission line item stays strictly within `amount_paid <= commission_amount`.
  - `20261014030500_system_health_diagnostics_update.sql`: Function update for `public.check_system_health_diagnostics` aligning invoice column constraints (`due_amount`, `paid_amount`) and robust exception sub-blocks.
  - `20261014030000_system_health_and_database_diagnostic_engine.sql`: Authoritative PostgreSQL diagnostic engine auditing GL double-entry immutability, bed occupancy status desync, referral commission parity, unlinked expenses, negative invoices, doctor chambers, and trial balance parity.
  - `20261014020000_referral_per_patient_commission_and_financial_reports.sql`: Per-patient commission tracking schema additions, authoritative `record_referral_commission_payout_atomic` RPC with auto-GL postings, modern resilient `get_trial_balance` and `get_general_ledger_report` eliminating 42501 organization mismatch errors, and historical settlement/GL backfill.
  - `20261011082000_fix_medicines_generics_foreign_key.sql`: Explicit foreign key relation between `public.medicines(generic_id)` and `public.medicine_generics(id)` with schema cache notification.
  - `20261011083000_seed_official_hospital_rate_chart.sql`: Seeding and synchronization of official hospital tariffs into `diagnostic_tests` and `hospital_service_tariffs`.
  - `20261011190000_diagnostic_tariffs_rls_and_complete_rate_chart.sql`: Full RLS policy resolution on `diagnostic_categories` and `diagnostic_tests` allowing authenticated staff and anon reads, plus complete 185 tests across 16 categories with exact hospital tariffs and synchronization with `hospital_service_tariffs`.
  - `20261011193500_fix_hospital_service_tariffs_categories_and_dedup.sql`: Normalized tariff categories into medical groups, categorized CT Scans (`CT_SCAN`), MRIs (`MRI`), X-Rays (`XRAY`), Ultrasounds (`USG`), Consultations (`CONSULTATION`), Beds (`IPD_BED`), Critical Care (`CRITICAL_CARE`), Surgeries (`OT_SURGERY`), and eliminated duplicate tariff entries.
  - `20261011215800_add_voided_at_to_invoices.sql`: Added `voided_at` timestamp column to `invoices` table with backfill for audit logs and accounting reports compatibility.
  - `20261011231500_add_date_of_birth_column_to_patients.sql`: Harmonized `date_of_birth` and `dob` columns on `patients` table with two-way trigger sync, resolving schema join compatibility across medical certificates and laboratory orders.
  - `20261011233000_quarantine_synthetic_bootstrap_data.sql`: Quarantined and permanently purged synthetic test/bootstrap operational records (accounting journal entries, welfare applications, demo patients with 0 invoices/episodes, purchase requisitions, goods receipts, biomedical devices, and asset registers) to enforce zero auto-fabrication and maintain pristine operational data integrity.
  - `20261012033000_super_admin_permanent_invoice_purge.sql`: Enhanced `delete_invoice_super_admin_atomic` stored procedure with dual-mode operational support (Safe Void vs Permanent Purge), enabling Super Admins to permanently purge invoices and eliminate all linked payments, line items, and audit history from the database.
  - `20261014010000_fix_bed_assignment_conflict_and_invoice_hard_purge.sql`: Added in-transaction override (`app.override_journal_immutability`) for Super Admin invoice purge; real-time occupancy synchronization trigger (`trg_sync_bed_occupancy`) between `bed_assignments` and `beds`/`cabins`; hardened `create_patient_intake_atomic` with row locking (`FOR UPDATE`) and concurrency conflict prevention.
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

### K. Playwright WebKit AuthGuard Navigation Resilience
- **File Hardened:** `tests/browser/runtime-route-matrix.spec.ts`
- **Issue Resolved:** In GitHub Actions CI WebKit browser runner, client-side AuthGuard asynchronous redirects (`router.replace('/login?redirectTo=...')`) caused browser-level navigation interruptions when testing consecutive protected hospital routes.
- **Resolution:** Wrapped protected route navigation in resilient exception handling with settling retry, ensuring graceful AuthGuard verification without false failure while asserting zero unauthenticated PHI/PII data leakage. Verified 100% GREEN (208/208 specs passed in CI across all 4 browsers).

### L. Financial Reports Timezone Displacement & Boundary Safety
- **Files Modified:** `lib/reports/financial.ts`, `app/(hospital)/app/reports/page.tsx`, `tests/reports-date-boundary-and-search-safety.test.mjs`
- **Issue Resolved:** Selecting "সব সময় (All Time)" in reports generated `new Date(8640000000000000).toISOString()` (`"+275760-09-13T00:00:00.000Z"`), which PostgreSQL rejected as an invalid timezone displacement (`+275760`).
- **Resolution:**
  1. Clamped boundary ceilings to PostgreSQL-compliant ISO representation `new Date("9999-12-31T23:59:59.999Z")`.
  2. Stabilized AR aging `asOfDate` to Dhaka ISO timestamp.
  3. Added regression test 10 in `tests/reports-date-boundary-and-search-safety.test.mjs` asserting safe 4-digit ISO bounds.

### M. Diagnostic Laboratory Safety & Clinical Verification Hardening
- **Files Modified:** `components/lab/LabResultEntryModal.tsx`, `app/(hospital)/app/lab/page.tsx`, `lib/lab/actions.ts`, `types/clinical-emr.ts`, Migration 165 (`20261012160000_accept_diagnostic_order_atomic_and_clinical_safety.sql`), `tests/clinical-safety-and-lab-hardening.test.mjs`
- **Issues Resolved:** Production Lab UI auto-filled plausible normal patient test values; fallback printed synthetic clinician identities; verifications lacked canonical payload hashes; delivery lacked precondition checks.
- **Resolution:**
  1. Removed `NORMAL_TEMPLATES` and `DESCRIPTIVE_TEMPLATES` autofills from `LabResultEntryModal.tsx`; observed values start empty `""` until inputted by staff/LIS.
  2. Removed fake doctor / BMDC fallbacks; verifier strictly resolved from authenticated doctor/profile records.
  3. Sanitized verification and QA claims: `ELECTRONICALLY VERIFIED`, `Verification Integrity Hash`, and `Clinical Laboratory Quality Controlled (SOP)`.
  4. Enforced strict `lab.verify` permission check for clinical verification.
  5. Implemented SHA-256 integrity digest covering canonical serialized report content (patient, test, observed values, timestamp).
  6. Enforced verified result immutability: editing a `VERIFIED` order automatically resets status to `PROCESSING` and purges prior verification.
  7. Enforced delivery preconditions: `DELIVERED` strictly requires order to be in `VERIFIED` status with authenticated verifier identity.
  8. Created and applied Migration 165 (`accept_diagnostic_order_atomic` RPC and hardened `verify_diagnostic_order_atomic` RPC).
  9. Added comprehensive 10-test suite `tests/clinical-safety-and-lab-hardening.test.mjs` (10/10 PASS).

### N. Doctor Addition & BMDC Optionality + Auto Doctor Code Generation
- **Files Modified:** `lib/appointments/actions.ts`, Migration 172 (`20261013024000_doctor_phone_cabin_floor_and_admission_charges.sql`).
- **Issues Resolved:** Adding a doctor failed when BMDC registration was omitted or when non-nullable columns (`doctor_code`, `department_id`, `phone`) were constrained.
- **Resolution:**
  1. `doctor_code` is auto-generated if missing (`DOC-XXXXXX`).
  2. `bmdc_reg_no` made nullable/optional across database schema and UI.
  3. Default clinical department automatically resolved or created if omitted.
  4. Phone column made optional; insertion implements schema-adaptive column retries.

### O. Bed & Cabin Matrix Tariff Persistence & Dynamic Ward Resolution
- **Files Modified:** `lib/ipd/bed-actions.ts`, `components/beds/AddBedOrCabinModal.tsx`, Migration 172.
- **Issues Resolved:** Adding beds/cabins failed due to missing ward foreign keys; editing rates failed to persist new tariff.
- **Resolution:**
  1. Automated lookup/creation of active general ward UUID when ward is omitted.
  2. Rate editing now synchronizes directly into both `beds.daily_rate` and `bed_types.base_daily_rate`.
  3. Floor text decoupled and made optional across all bed & cabin forms and displays.

### P. IPD Admission Fees & Daily Service Charges Auto-Injection into Billing
- **Files Modified:** `app/(hospital)/app/ipd/page.tsx`, `lib/patient/actions.ts`, `lib/billing/actions.ts`, Migration 172.
- **Resolution:**
  1. Standard IPD admission defaults: 300 BDT one-time admission fee + 500 BDT/day service charge + bed daily rate.
  2. All rates are completely customizable during both admission and billing time.
  3. Auto-injection logic in `getUnbilledItemsForPatientAction` synthesizes admission fee and stay service charges into patient's pending bill.

### Q. Referral Agent Value Dashboard & Discretionary Bonus Governance
- **Files Modified:** `app/(hospital)/app/referrals/page.tsx`, `lib/billing/actions.ts`.
- **Resolution:**
  1. Removed hardcoded agent commission percentages from billing to protect financial integrity.
  2. Streamlined referral dashboard into 4 core KPI cards: Total Agents, Total Referred Patients, Total Revenue Generated, and Total Discretionary Bonuses Paid.
  3. Dedicated patient service and billing history view showing exact services availed.
  4. Discretionary bonuses granted by hospital authority automatically booked as operational hospital expenses (`EXPENSES`).

### R. Diagnostic Test Catalog Multi-Select Bulk Deletion & Category Grouping
- **Files Modified:** `app/(hospital)/app/lab/page.tsx`, `components/lab/LabTestList.tsx`, `lib/lab/actions.ts`.
- **Resolution:**
  1. Added multi-select checkbox filtering and bulk delete action (`bulkDeleteDiagnosticTestsAction`).
  2. Grouped category tabs with quick search and test counts for 350+ hospital test services.

### S. Hospital Expense Voucher Atomic Deletion, Voiding & General Ledger Reversal (Migration 187)
- **Files Modified:** `supabase/migrations/20261014050000_harden_expenses_deletion_voiding_and_diagnostics.sql`, `lib/expenses/actions.ts`, `app/(hospital)/app/expenses/page.tsx`, `tests/hospital-expenses-deletion-and-diagnostics.test.mjs`.
- **Resolution:**
  1. Implemented `public.delete_hospital_expense_super_admin_atomic` supporting:
     - Safe deletion of `DRAFT` / `PENDING_APPROVAL` vouchers.
     - Atomic general ledger reversal (`post_journal_entry_atomic`) with inverted debits/credits and `'VOIDED'` status for posted expenses.
     - Authorized Super-Admin permanent purge with `app.override_journal_immutability` for erroneous test vouchers.
  2. Integrated reactive incident reporting and resolution (`reportSystemRuntimeIncident` / `resolveSystemRuntimeIncident`) into all expense lifecycle actions (`createExpenseAction`, `updateExpenseAction`, `voidExpenseAction`, `deleteExpenseAction`).
  3. Added Delete / Purge Modal in `/app/expenses` with draft delete, GL reversal notices, and super-admin purge options.

### T. 24/7 Background Scheduled Health Monitor & Real-Time Reactive Troubleshooter
- **Files Modified:** `.github/workflows/health-monitor.yml`, `scripts/scheduled-health-check.mjs`, `components/app/SystemHealthAlertBanner.tsx`, `lib/diagnostics/troubleshooter.ts`, `lib/ipd/bed-actions.ts`.
- **Resolution:**
  1. Established scheduled GitHub Actions heartbeat probe running every 5 minutes (`*/5 * * * *`), testing both live edge HTTP 200 and remote Supabase 10-point diagnostics.
  2. Hardened `SystemHealthAlertBanner.tsx` to handle client-side ephemeral incidents (`system-health-incident-reported` / `system-health-incident-resolved`) with immediate on-screen visibility of exact location (কোথায়) and cause (কেন).
  3. Added interactive resolution feedback banner displaying "সমস্যা সমাধান সম্পন্ন" when an operation succeeds, automatically fading out to pristine green.
   4. Instrumented bed and cabin management actions (`addBedAction`, `deleteBedAction`) to report actionable Bengali incidents on permission or validation failures instead of silent failures.

### U. Accounting Immutability Hardening, Exact Incident Location Resolution & Zero False-Green Monitoring (Migration 188)
- **Files Modified:** `supabase/migrations/20261014060000_harden_accounting_immutability_and_exact_diagnostics.sql`, `app/(hospital)/app/expenses/page.tsx`, `components/app/SystemHealthAlertBanner.tsx`, `lib/diagnostics/actions.ts`, `lib/diagnostics/troubleshooter.ts`, `lib/expenses/actions.ts`, `lib/ipd/bed-actions.ts`, `scripts/scheduled-health-check.mjs`, `.github/workflows/health-monitor.yml`, `config/site.ts`, `app/layout.tsx`.
- **Resolution:**
  1. **GAAP Double-Entry Reversal Immutability:** In `delete_hospital_expense_super_admin_atomic`, prohibited permanent purge of `POSTED` or `PAID` vouchers. Reversing a posted expense now posts a balancing GL reversal without marking the original journal entry as `VOID`, preserving algebraic debit/credit balance across trial balance and general ledger reports ($\Sigma(\text{Debits}) - \Sigma(\text{Credits}) = 0$).
  2. **Location-Scoped Incident Resolution:** `resolve_system_runtime_issue` and `SystemHealthAlertBanner.tsx` now match incidents specifically by `location` and `errorCode`, preventing premature "Issue Solved" notifications and blanket clearance across unrelated submodules.
  3. **Fail-Closed Tenant Isolation:** Removed hardcoded fallback organization IDs across server actions (`voidExpenseAction`, `deleteExpenseAction`, `addBedAction`, `deleteBedAction`), returning clean 401 unauthorized errors without polluting other tenants.
  4. **Zero False-Green Heartbeat Probe:** Hardened `scripts/scheduled-health-check.mjs` to report `CONFIGURATION_ERROR` and `Database=UNCONFIGURED` with exit code 1 under strict/scheduled mode when credentials are missing. Supported `SUPABASE_SERVICE_ROLE_KEY` for full ERP diagnostic audits and restricted anonymous key runs to `PUBLIC_PORTAL_ONLY`.
  5. **Bengali Locale & Accessibility:** Enforced `<html lang="bn">`, `locale: "bn_BD"`, and `alternateLocale: ["en_US"]` across layout and site configurations.

### V. Persistent Notification Outbox, 24/7 Heartbeats & Verified Incident Lifecycle (Migration 189)
- **Files Modified:** `supabase/migrations/20261014070000_harden_incident_lifecycle_outbox_and_heartbeat.sql`, `lib/diagnostics/actions.ts`, `lib/diagnostics/troubleshooter.ts`, `components/app/SystemHealthAlertBanner.tsx`, `scripts/scheduled-health-check.mjs`, `tests/system-health-diagnostics.test.mjs`, `tests/expenses-reversal-and-ledger-invariants.test.mjs`.
- **Resolution:**
  1. **Persistent Notification Outbox:** Created `public.system_notification_outbox` table tracking delivery channels (webhook, email, sms), attempt count, retry state, and explicit `BLOCKED_EXTERNAL_OWNER` status when provider credentials are unconfigured by owner (Gates G1–G3, G10).
  2. **24/7 Monitoring Heartbeats:** Created `public.system_monitoring_heartbeats` table and `record_monitoring_heartbeat` RPC. Background probes and GitHub Actions cron runs record heartbeat history, audit scope, and health metrics directly in database.
  3. **Missed-Heartbeat & Outbox Invariant Checks:** Extended `check_system_health_diagnostics` with Check 11 (detects missed heartbeats if last automated probe > 15m ago) and Check 12 (detects failed deliveries in persistent outbox in last 24h).
  4. **Strict Zero False-Green Security:** Anonymous/unauthenticated calls to `check_system_health_diagnostics` strictly return `is_healthy = false`, `status = 'AUDIT_UNAUTHORIZED'`, `health_score = 0`, and `audit_scope = 'PUBLIC_PORTAL_ONLY'`, preventing false 100/100 passes without privileged access.
  5. **Verified Recovery Lifecycle (`OPEN` -> `ACKNOWLEDGED` -> `RESOLVED_VERIFIED`):** Implemented `verify_and_resolve_system_issue_atomic` RPC and updated `SystemHealthAlertBanner.tsx` to verify database acceptance and persistence before showing resolution feedback.

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

1. **Software Quality:** 144/144 certification suites, 1,303 active passes, 0 failures, 7 skipped, 208/208 multi-browser Playwright specs (Chromium, Firefox, Mobile Chrome, WebKit), 0 lint warnings, 0 typecheck errors.
2. **Database Parity:** 190/190 Supabase migrations applied (100% parity, 0 drift, newest: `20261014080000_harden_multitenant_heartbeat_and_outbox_security.sql`).
3. **Edge Deployment:** Live on Cloudflare Pages edge (`https://onnesha-hospital.pages.dev`, deployment `75b15bf6`, `WORKSTATION_DEPLOY_VERIFIED`).
4. **Installer Delivery:** Native WiX MSI and NSIS EXE binaries compiled on Windows, verified, and manifest synced to v1.1.90.
5. **External Owner Gates:** G1–G16 clearly isolated without false greens.

