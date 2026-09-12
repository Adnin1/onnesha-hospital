# PROGRESSIVE UI MIGRATION PLAN
**Project:** Onnesha Hospital Management System (OHMS)  
**Strategy:** Zero-Regression In-Place Data Migration (Prototype ➔ Production)  

---

## 1. Migration Strategy

The existing prototype UI in `app/(hospital)/*` contains 16 working pages with rich UX, filters, and modal wizards that currently consume `lib/mock-data.ts`. The migration will **preserve all UI components and styling**, replacing the mock data bindings with live Supabase Server Actions and real queries in an orderly phase progression.

---

## 2. Progressive Wiring Schedule

| Phase | Target Module | Existing Mock Source | Target Database Entities | Migration Task |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 2** | **Authentication & Tenancy** | Hardcoded role buttons in `/login` | `profiles`, `user_roles`, `organizations` | Connect Supabase Auth, verify RLS session context |
| **Phase 3** | **Patient Master & Reception** | `MOCK_PATIENTS` in `/app/patients` | `patients`, `patient_contacts`, `patient_visits` | Replace React state array with Supabase Server Actions; hook up search |
| **Phase 3** | **Appointments & Token Board** | `MOCK_APPOINTMENTS` in `/app/appointments` | `appointments`, `token_counters`, `waiting_queue` | Wire slot booking, concurrency token generation, Realtime queue listener |
| **Phase 4** | **Doctors & OPD Clinic** | `MOCK_DOCTORS` in `/app/doctors` & `/app/opd` | `doctors`, `doctor_schedules`, `prescriptions` | Load active doctor roster, hook up consultation desk and E-Rx saving |
| **Phase 5** | **Diagnostics & Lab** | `MOCK_LAB_ORDERS` in `/app/lab` | `diagnostic_orders`, `diagnostic_results`, `diagnostic_report_verifications` | Wire sample accessioning barcode, technician entry worklist, pathologist sign |
| **Phase 6** | **Pharmacy & FIFO Stock** | `MOCK_MEDICINES` in `/app/pharmacy` | `medicines`, `medicine_batches`, `stock_transactions` | Implement FIFO batch deduction at checkout, PO receiving GRN form |
| **Phase 7** | **Beds, Cabins & IPD** | `MOCK_BEDS` in `/app/beds` & `/app/ipd` | `wards`, `beds`, `cabins`, `bed_assignments` | Replace hardcoded matrix with live bed status query, admission bed picker |
| **Phase 8** | **Billing & Cashier Ledger** | `MOCK_INVOICES` in `/app/billing` | `invoices`, `invoice_items`, `payments`, `refunds` | Wire point-of-sale invoice creation, partial payments, supervisor discounts |
| **Phase 9** | **HR & Biometric Attendance** | `MOCK_EMPLOYEES` in `/app/hr` | `employees`, `attendance_records`, `payroll_runs` | Connect employee directory, attendance stream API, monthly salary runner |
| **Phase 10** | **Executive Dashboard & Reports** | Hardcoded KPI numbers in `/app/dashboard` | PostgreSQL Aggregations & Views | Compute real-time revenue, bed occupancy %, patient visit stats |

---

## 3. Preserved Assets Guarantee
- No UI components will be deleted.
- Layouts (`HospitalSidebar.tsx`, `HospitalHeader.tsx`, `HospitalPrintHeader.tsx`) will be untouched except for receiving authenticated profile data.
- The 80mm thermal receipt and A4 hospital letterhead print layouts will remain fully operational.
