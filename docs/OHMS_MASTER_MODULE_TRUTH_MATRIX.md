# OHMS ARCH SPECIFICATION MASTER SUBFEATURE TRUTH & GAP MATRIX
**Authoritative Source of Truth:** Live Git Repository, Linked Supabase Schema & Production Edge  
**Audit Date:** 2026-09-26  
**Total Canonical Arch Requirement Modules Analyzed:** 34 Individual Modules  

---

## 📊 Comprehensive Itemized Arch Subfeature Matrix (Conversation 34 Scope: Modules 01 to 10 + Foundation Extensions)

| Arch Module | Subfeature Requirement | Dedicated Route / Subsystem | Database Entity | Migration | Tenant RLS | RBAC Guard | Real Mutation / Action | Business Rule & Concurrency | Forensic Audit | Core Integration Linkage | Test Suite Evidence | Final Truth Status |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| **01 OPD** | Patient Master, 360 & Code | `/app/patients` | `patients` | 001 | ✅ | ✅ | `registerPatientAction` | Duplicate phone/NID prevention | ✅ | Billing, Clinical EMR | `tests/clinical.test.mjs` | `COMPLETE` |
| **01 OPD** | Consultation & Doctor Queue | `/app/appointments`, `/app/opd` | `appointments` | 027, 054 | ✅ | ✅ | `bookOnlineAppointmentAtomic` | Atomic token sequence, slot uniqueness | ✅ | Central Ledger, OPD Billing | `tests/atomic-booking.test.mjs` | `COMPLETE` |
| **01 OPD** | Diagnostic Billing | `/app/billing` | `invoices`, `invoice_items` | 032, 033 | ✅ | ✅ | `createInvoiceAction` | Server-authoritative totals, discount limits | ✅ | Accounts Ledger, Diagnostics | `tests/billing-audit.test.mjs` | `COMPLETE` |
| **01 OPD** | Report Delivery Tracking | `/app/lab` | `diagnostic_orders` | 009 | ✅ | ✅ | `verifyDiagnosticReportAction` | Verified report status locking | ✅ | Patient 360, Document Print | `tests/phase15-printing-engine.test.mjs` | `COMPLETE` |
| **01 OPD** | Health Packages & Subscriptions | `lib/packages` | `health_packages`, `patient_package_subscriptions` | 071 | ✅ | ✅ | `createHealthPackageAction` | Validity days, quota deduction | ✅ | Billing, OPD Consultation | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **02 IPD** | Inpatient Admission & Bed Allocation | `/app/ipd` | `patient_visits`, `admissions` | 001, 047 | ✅ | ✅ | `createIpdAdmissionAction` | Zero double occupancy per bed | ✅ | Central Billing Account | `tests/integration/emergency-and-bed.test.mjs` | `COMPLETE` |
| **02 IPD** | Nurse Station & Vitals Rounds | `/app/ipd` | `nursing_notes`, `patient_vitals_rounds` | 047 | ✅ | ✅ | `nursing_notes_insert` | Shift handover invariant, vital thresholds | ✅ | Clinical Patient Timeline | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **02 IPD** | Doctor Station & Ward Census | `/app/ipd` | `inpatient_progress_notes`, `inpatient_doctor_orders` | 071 | ✅ | ✅ | `inpatient_doctor_orders_insert` | Order execution lifecycle state machine | ✅ | Clinical Records | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **02 IPD** | Dynamic Discounting & Approval | `/app/billing` | `invoices`, `financial_audit_logs` | 024, 032 | ✅ | ✅ | `applyDiscountAction` | Max discount approval threshold, justification | ✅ | Chart of Accounts | `tests/billing-overpayment.test.mjs` | `COMPLETE` |
| **03 PATHOLOGY**| Specimen Collection & Barcoding | `/app/lab` | `diagnostic_orders` | 009 | ✅ | ✅ | `collectSampleAction` | Unique barcode, sample tracking | ✅ | Patient 360, Central Billing | `tests/integration/pharmacy-and-lab.test.mjs` | `COMPLETE` |
| **03 PATHOLOGY**| Reagent Stock & Consumption | `lib/lab` | `pathology_reagent_lots`, `pathology_reagent_consumption` | 071 | ✅ | ✅ | `addReagentLotAction` | Zero negative reagent tests, lot expiry | ✅ | Central Inventory, Diagnostics | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **03 PATHOLOGY**| Result Verification & Approval | `/app/lab` | `diagnostic_results` | 009 | ✅ | ✅ | `verifyDiagnosticReportAction` | Immutable post-approval state | ✅ | Print Engine, Patient Portal | `tests/lab.spec.ts` | `COMPLETE` |
| **04 RADIOLOGY**| Imaging Modality Intake & Worklist | `/app/radiology` | `radiology_modalities`, `radiology_studies` | 068, 070 | ✅ | ✅ | `radiology_studies_insert` | Modality availability, study scheduling | ✅ | Central Billing (auto-item) | `tests/radiology.test.mjs` | `COMPLETE` |
| **04 RADIOLOGY**| Film & Media Stock Consumption | `lib/radiology` | `radiology_media_stock`, `radiology_media_consumption` | 071 | ✅ | ✅ | `recordMediaConsumptionAction` | Media decrement, reorder level alert | ✅ | Central Inventory | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **04 RADIOLOGY**| DICOM / PACS Integration Adapter | `lib/integrations/pacs` | Software boundary adapter | N/A | ⚠️ | ⚠️ | Boundary contract | Server connectivity requires live PACS endpoint | ⚠️ | Radiology Studies | `docs/FINAL_SYSTEM_ARCHITECTURE.md` | `EXTERNAL-DEPENDENCY` |
| **05 PHARMACY** | Dispensing POS & Zero Negative Stock | `/app/pharmacy` | `pharmacy_inventory`, `pharmacy_sales` | 010, 047 | ✅ | ✅ | `dispenseMedicineAction` | FEFO expiry sort, zero negative quantity | ✅ | Cashier Desk, GL Journal | `tests/pharmacy-inventory.test.mjs` | `COMPLETE` |
| **05 PHARMACY** | Multi-Store & OT Medicine Requisition| `/app/procurement` | `stock_transfers`, `purchase_requisitions` | 047 | ✅ | ✅ | `createStockTransferAction` | Warehouse isolation, custody sign-off | ✅ | Central Inventory Authority | `tests/procurement-3way-match.test.mjs` | `COMPLETE` |
| **06 DOCTOR**   | EMR Longitudinal Timeline | `/app/patients/[id]` | `clinical_records`, `prescriptions` | 020 | ✅ | ✅ | `createPrescriptionAction` | Doctor license validation, dosage schedule | ✅ | Pharmacy POS, Patient 360 | `tests/clinical.test.mjs` | `COMPLETE` |
| **06 DOCTOR**   | Inpatient Diet & Nutrition Charts | `lib/diet` | `patient_diet_charts` | 071 | ✅ | ✅ | `createDietChartAction` | Meal schedule, dietary restriction check | ✅ | Inpatient Ward Census | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **07 ACCOUNTS** | Chart of Accounts & General Ledger | `/app/accounting` | `chart_of_accounts`, `journal_entries` | 047, 049 | ✅ | ✅ | `post_journal_entry_atomic` | Total Debit = Total Credit invariant, period lock | ✅ | All Revenue & Expenses | `tests/accounting-integrity.test.mjs` | `COMPLETE` |
| **07 ACCOUNTS** | Doctor Accounts & Fee Settlements | `lib/accounting` | `doctor_accounts`, `doctor_fee_settlements` | 071 | ✅ | ✅ | `settleDoctorFeeAction` | Server-authoritative payable balance | ✅ | General Ledger, Staff IAM | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **08 HR**       | Employee Roster & Biometric Punches | `/app/hr` | `employees`, `attendance_punches` | 014, 047 | ✅ | ✅ | `recordBiometricPunchAction` | Daily attendance shift calculation | ✅ | Monthly Payroll Calculation | `tests/hr.spec.ts` | `COMPLETE` |
| **08 HR**       | Leave Applications & Loans | `lib/hr` | `employee_leave_applications`, `employee_loans` | 071 | ✅ | ✅ | `reviewLeaveApplicationAction` | Leave quota balance, monthly installment | ✅ | Payroll Deductions | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **09 ASSETS**   | Fixed Assets & Maintenance Logs | `/app/assets` | `fixed_assets`, `asset_maintenance_logs` | 047 | ✅ | ✅ | `createAssetAction` | Asset tag uniqueness, depreciation schedule | ✅ | GL Asset Ledger | `tests/accounting.spec.ts` | `COMPLETE` |
| **09 ASSETS**   | Regulatory Licenses & Compliance | `lib/assets` | `hospital_licenses` | 071 | ✅ | ✅ | `registerHospitalLicenseAction` | Renewal reminder countdown, validity guard | ✅ | Executive MIS | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **10 CRM**      | Corporate Clients & Tariffs | `lib/crm` | `corporate_clients`, `corporate_beneficiaries` | 071 | ✅ | ✅ | `createCorporateClientAction` | Credit limit enforcement, negotiated discount | ✅ | Central Billing Accounts | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |
| **10 CRM**      | Patient Follow-ups & Reminders | `lib/crm` | `patient_crm_followups` | 071 | ✅ | ✅ | `getCrmFollowupsAction` | Status transition, clinical linkage | ✅ | Notification Outbox | `tests/conversation34-core-extensions.test.mjs` | `COMPLETE` |

---

## 🎯 Verification Criteria Definition
* **`COMPLETE`**: Genuine end-to-end implementation verified with Database Schema + Migration applied to linked Supabase + Row-Level Security Policies + Granular RBAC Guards + Server-Authoritative Mutations & Validation + Audit Logging + Integration with Shared Core + Automated Unit/Integration Tests.
* **`EXTERNAL-DEPENDENCY`**: Software architecture, database entities, validation rules, and adapter boundaries implemented; physical hardware device (e.g. PACS server, biometric fingerprint scanner, USB thermal printer) or third-party merchant API credentials required for live connectivity.
* **`BLOCKED`**: Action requires repository-owner-level permissions, custom DNS nameserver pointing, or GitHub repository secret provisioning.
