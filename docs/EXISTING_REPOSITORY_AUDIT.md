# EXISTING REPOSITORY AUDIT & TECHNICAL INVENTORY REPORT
**Project:** Onnesha Hospital Management System (OHMS)  
**Repository:** `Adnin1/onnesha-hospital`  
**Framework:** Next.js 16.3.5 (Turbopack, App Router) + React 19.2.8 + Tailwind CSS v4  
**Date:** September 13, 2026  

---

## 1. Executive Summary

This audit establishes the baseline state of the repository prior to introducing the full production database architecture and backend integrations. The repository currently functions as a **high-fidelity prototype** featuring 28 routes, comprehensive UI workflows, and design systems for both the public hospital website and the internal hospital ERP. 

### Key Audit Findings
1. **Frontend Completeness:** UI screens for all clinical, operational, and financial modules are established, responsive, and styled.
2. **Backend/Database Gap:** All pages currently consume in-memory mock datasets defined in `lib/mock-data.ts`.
3. **Environment Security Resolution:** The Supabase client, server helper, and middleware previously contained fallback strings pointing to `"https://mock-onnesha.supabase.co"`. This unsafe fallback has now been **completely eliminated**; all clients strictly mandate valid production environment variables.
4. **Preservation Directive:** No UI pages or working UX workflows will be discarded. They will be progressively wired to live Supabase PostgreSQL tables without regression.

---

## 2. Route & Module Inventory

### Public Web Experience
| Route | Purpose | Current State | Business Logic Present | Migration Action |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Homepage | Static UI with Hero, Stats, Services | Quick booking anchor | Preserve; bind stats to live counts |
| `/about` | Hospital info | Static presentation | None | Preserve |
| `/services` | Clinical services | Static catalog | None | Preserve; bind to `services` table |
| `/departments` | Specialty list | Static cards | None | Preserve; bind to `departments` table |
| `/doctors` | Consultant roster | Renders from `MOCK_DOCTORS` | Search, Dept filter | Wire to live `doctors` query |
| `/appointment` | 4-step booking wizard | Client-state driven | Slot calculation | Wire to live `appointments` mutation |
| `/diagnostic` | Test catalog | Client-state driven | Price calculation | Wire to live `lab_tests` query |
| `/check-token` | Live queue display | Polls mock waiting queue | Token status badges | Bind to Supabase Realtime websocket |
| `/contact` | Emergency numbers & map | Static presentation | Contact form | Wire to `inquiries` table |

### Hospital Application (`/app/*`)
| Route | Module | Current State | Logic Present | Migration Action |
| :--- | :--- | :--- | :--- | :--- |
| `/app/dashboard` | Executive KPI Center | Renders from mock aggregates | Revenue/Bed charts | Replace with Postgres SQL view aggregation |
| `/app/patients` | Patient Master & EMR | Mock patient list + modal | Patient code generator | Wire to `patients` table & search index |
| `/app/doctors` | Doctor Master & Schedule | Mock doctor list | Schedule toggle | Wire to `doctors` & `doctor_schedules` |
| `/app/appointments` | Reception Queue Manager | Mock queue & appointment list | Call token state | Wire to `appointments` & `token_queues` |
| `/app/opd` | Out-Patient Clinic | Mock chamber queue | Vitals recording | Wire to `encounters` & `prescriptions` |
| `/app/ipd` | In-Patient & Admissions | Mock admission list | Admission wizard | Wire to `ipd_admissions` & `beds` |
| `/app/emergency` | Emergency Triage | Mock triage board | Red/Yellow/Green triage | Wire to `encounters` where type=EMERGENCY |
| `/app/billing` | Cashier POS & Ledger | Mock invoice list & creator | Subtotal/Due math | Wire to `invoices` & `billing_transactions` |
| `/app/lab` | Diagnostic & Pathology | Mock order list & entry | Abnormal flag checks | Wire to `lab_orders` & `lab_results` |
| `/app/pharmacy` | Pharmacy Counter & Stock | Mock medicine list & POS | FIFO simulation | Wire to `medicine_batches` & `stock_ledger` |
| `/app/beds` | Bed & Cabin Grid | Visual bed matrix | Occupy/Vacate state | Wire to live `beds` table |
| `/app/ot` | Operation Theater | Mock surgical schedule | Team assignment | Wire to `ot_bookings` |
| `/app/prescriptions`| Clinical E-Rx Desk | Mock prescription writer | Rx item addition | Wire to `prescriptions` & `prescription_items` |
| `/app/hr` | Staff & Biometric Clock | Mock employee & punch list | Punch calculation | Wire to `employees` & `attendance_punches` |
| `/app/reports` | Enterprise Reports | Mock financial summaries | Date filtering | Wire to SQL reporting views |
| `/app/settings` | Hospital Settings | Mock org configuration | Prefix/Pad config | Wire to `organization_settings` |

---

## 3. Reusable Components & Library Audit

### Components Preserved:
- `HospitalHeader.tsx`: Role indicators, live clock, notification trigger.
- `HospitalSidebar.tsx`: Navigation menu with module groupings.
- `HospitalPrintHeader.tsx`: 80mm thermal receipt and A4 hospital letterhead print layouts.
- `PublicNavbar.tsx` & `PublicFooter.tsx`: Public portal navigation.

### Library Utilities:
- `lib/utils.ts`: Currency formatting (`formatCurrencyBDT`), Date formatting (`formatDateBDT`).
- `lib/permissions.ts`: Static permission definition and role assignment helper.
- `lib/sms/sms-service.ts`: SMS abstraction interface.

---

## 4. Security & Architecture Deficiencies Identified

1. **Mock Environment Fallbacks (Resolved):**
   - *Previous state:* `lib/supabase/client.ts` and `server.ts` defaulted to `"https://mock-onnesha.supabase.co"`.
   - *Resolution:* Removed. Clients now throw a clear configuration error if `NEXT_PUBLIC_SUPABASE_URL` is absent.
2. **Client-Side State Mutation:**
   - Pages like `/app/billing/page.tsx` generate IDs with `Date.now()` and mutate state in React memory. This will be replaced with Server Actions executing against PostgreSQL sequences.
3. **Absence of Row Level Security (RLS) Enforcement in Prototype:**
   - In-memory data structures lacked multi-tenant boundaries. The production schema must enforce `organization_id` on every query.

---

## 5. Recommended Migration Strategy
1. **Phase 1 (Current):** Deploy full modular SQL migration suite to Supabase.
2. **Phase 2:** Connect real Supabase client, authenticate real users, verify RLS.
3. **Phase 3 – 10:** Progressively replace `lib/mock-data.ts` references with live Supabase queries, module by module, leaving UI code intact.
