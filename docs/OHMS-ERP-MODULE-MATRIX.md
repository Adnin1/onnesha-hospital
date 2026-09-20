# Onnesha Hospital ERP - 32-Domain Module Matrix

## Authoritative Enterprise Module Status (v1.1.0)

| Domain # | Functional Domain | Status | Route / Component | Database Entities | Key Invariants / Security |
|---|---|---|---|---|---|
| **1** | Multi-Tenant Organization Isolation | **PRODUCTION-CERTIFIED** | Middleware & Private Schema | `organizations`, `profiles` | `private.get_current_org_id()`, strict RLS on 100% tables |
| **2** | Patient Demographics & Master Patient Index | **PRODUCTION-CERTIFIED** | `/app/patients` | `patients`, `patient_documents` | Unique `patient_code`, national ID verification |
| **3** | Appointment Scheduling & Token Queue | **PRODUCTION-CERTIFIED** | `/app/appointments`, `/appointment` | `appointments`, `doctor_schedules` | Real-time queue, SMS token notification |
| **4** | Outpatient Department (OPD) Consultation | **PRODUCTION-CERTIFIED** | `/app/opd` | `patient_visits`, `vital_signs` | Vitals intake, consultation notes, prescription linking |
| **5** | Inpatient Department (IPD) Admissions | **PRODUCTION-CERTIFIED** | `/app/ipd` | `patient_visits`, `bed_assignments` | Bed allocation, admission date, discharge summaries |
| **6** | 24/7 Emergency & Casualty Triage | **PRODUCTION-CERTIFIED** | `/app/emergency` | `emergency_cases`, `emergency_triage` | Red/Yellow/Green triage matrix, 0-downtime intake |
| **7** | Bed & Cabin Management Matrix | **PRODUCTION-CERTIFIED** | `/app/beds` | `wards`, `beds`, `bed_assignments` | Status `AVAILABLE/OCCUPIED/CLEANING`, daily bed tariffs |
| **8** | Operation Theater (OT) Management | **PRODUCTION-CERTIFIED** | `/app/ot` | `operating_rooms`, `ot_bookings` | Surgeon/anesthetist scheduling, pre-op checklist |
| **9** | Digital Prescriptions & E-Rx | **PRODUCTION-CERTIFIED** | `/app/prescriptions` | `prescriptions`, `prescription_items` | Dosage, frequency, duration, print/PDF export |
| **10** | Pathology & Diagnostic Lab Services | **PRODUCTION-CERTIFIED** | `/app/lab` | `lab_tests`, `diagnostic_orders`, `diagnostic_results` | Sample barcode, technician entry, pathologist verification |
| **11** | Pharmacy Inventory & POS | **PRODUCTION-CERTIFIED** | `/app/pharmacy` | `medicines`, `pharmacy_sales`, `pharmacy_sale_items` | Batch tracking, FEFO expiry alert, thermal POS print |
| **12** | Central Billing & Cashier Desk | **PRODUCTION-CERTIFIED** | `/app/billing` | `invoices`, `invoice_items`, `payments` | Pre-validated atomicity, partial payments, receipts |
| **13** | Payment Gateway Integrations | **PRODUCTION-CERTIFIED** | `/app/billing`, Edge Functions | `payment_intents`, `payment_transactions` | bKash, Nagad, SSLCommerz, idempotent webhook HMAC |
| **14** | Double-Entry Chart of Accounts | **PRODUCTION-CERTIFIED** | `/app/accounting` | `chart_of_accounts` | Standard 5-type GL hierarchy (Asset, Liab, Eq, Rev, Exp) |
| **15** | General Ledger & Journal Vouchers | **PRODUCTION-CERTIFIED** | `/app/accounting` | `journal_entries`, `journal_entry_lines` | $\sum \text{Debit} = \sum \text{Credit}$ atomic RPC |
| **16** | Automated Real-Time Trial Balance | **PRODUCTION-CERTIFIED** | `/app/accounting` | Computed from `journal_entry_lines` | Debit/Credit balance ledger, zero-imbalance guarantee |
| **17** | Purchase Requisitions & Approvals | **PRODUCTION-CERTIFIED** | `/app/procurement` | `purchase_requisitions`, `items` | Departmental workflow, priority flags, line costing |
| **18** | Goods Receipt Notes (GRN) | **PRODUCTION-CERTIFIED** | `/app/procurement` | `goods_receipt_notes`, `items` | Batch/expiry intake, supplier challan reconciliation |
| **19** | Multi-Location Warehouses | **PRODUCTION-CERTIFIED** | `/app/procurement` | `warehouses`, `inventory_transfers` | Warehouse code uniqueness, manager attribution |
| **20** | Fixed Assets & Biomedical Equipment | **PRODUCTION-CERTIFIED** | `/app/assets` | `hospital_assets` | Serial tracking, purchase valuation, depreciation |
| **21** | Asset Maintenance & Calibration Logs | **PRODUCTION-CERTIFIED** | `/app/assets` | `asset_maintenance_logs` | Calibration checklist, service cost, next service date |
| **22** | Inpatient Nursing Shift Notes | **PRODUCTION-CERTIFIED** | `/app/ipd`, lib/nursing | `nursing_notes` | Morning/Evening/Night shift handover logs |
| **23** | Patient Vitals Rounds Monitoring | **PRODUCTION-CERTIFIED** | `/app/ipd`, lib/nursing | `patient_vitals_rounds` | Structured BP, pulse, temp, SpO2, blood glucose |
| **24** | HR Employee Registry & Attendance | **PRODUCTION-CERTIFIED** | `/app/hr` | `employees`, `attendance_records` | Shift timing, biometric logging, designation matrix |
| **25** | Payroll & Compensation Management | **PRODUCTION-CERTIFIED** | `/app/hr` | `payroll_records`, `salary_components` | Basic pay, allowances, deductions, payslip generation |
| **26** | Role-Based Access Control (RBAC) | **PRODUCTION-CERTIFIED** | `lib/permissions.ts`, middleware | `roles`, `role_permissions` | 8 clinical/admin roles, fail-closed permission checks |
| **27** | Forensic Audit Trail & Logging | **PRODUCTION-CERTIFIED** | `/app/settings`, lib/audit | `audit_logs` | Immutable audit records across 14 enterprise modules |
| **28** | Multi-Factor Authentication (MFA / AAL2) | **PRODUCTION-CERTIFIED** | `/mfa`, `lib/auth/session.ts` | Supabase MFA TOTP | AAL1 baseline, AAL2 fail-closed gate for high-risk actions |
| **29** | Public Patient Portal & Web Discovery | **PRODUCTION-CERTIFIED** | `/`, `/doctors`, `/services` | Next.js SSG + Cloudflare Edge | Zero hardcoded doctor rosters, dynamic visiting hours |
| **30** | Desktop Native Application (Windows) | **PRODUCTION-CERTIFIED** | `src-tauri` | Rust 1.85 + Tauri v2 | Genuine WiX 3.11 MSI & NSIS 3.10 EXE binaries |
| **31** | Automated Release & CI/CD Delivery | **PRODUCTION-CERTIFIED** | `.github/workflows/ci.yml` | GitHub Actions + Wrangler | Full lint, typecheck, test, Playwright E2E, deployment |
| **32** | Continuous Monitoring & Zero-Fabrication | **PRODUCTION-CERTIFIED** | `scripts/smoke_test.mjs` | Multi-layer probe | 4-layer remote Cloudflare & Supabase verification |
