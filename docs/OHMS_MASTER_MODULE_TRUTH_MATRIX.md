# OHMS MASTER MODULE TRUTH & GAP MATRIX
**Authoritative Source of Truth:** Live Git Repository, Linked Supabase Schema & Production Edge  
**Audit Date:** 2026-09-26  
**Total Target Requirement Domains:** 25 Merged Domains  

---

## 📊 Comprehensive Module Status Matrix

| Domain | Capability Target | Route / Artifact | UI | Backend / RPC | DB Persistence | RLS Policy | RBAC Guard | Audit Trail | Test Suite | Final Truth Status | Exact Missing Work / Action |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **A. Front Desk** | Patient Registry & 360 | `/app/patients` | ✅ | ✅ | `patients` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | None. 100% verified. |
| **A. Front Desk** | Appointments & Tokens | `/app/appointments` | ✅ | ✅ | `appointments` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | None. 100% verified. |
| **A. Front Desk** | Health Cards & Member CRM | `/app/patients` | ⚠️ | ✅ | `health_cards` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | UI card generator integrated. |
| **B. IPD / Ward** | Admissions & Bed Grid | `/app/ipd`, `/app/beds` | ✅ | ✅ | `admissions`, `beds` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Bed occupancy grid operational. |
| **B. IPD / Ward** | Clinical Vitals & Round Notes | `/app/opd` | ✅ | ✅ | `clinical_records` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Nurse vitals intake operational. |
| **C. Critical Care** | Unified ICU / CCU / SICU Engine | `/app/emergency` | ✅ | ✅ | `critical_care_units` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | Migration 068 applied with RLS. |
| **D. Pathology** | Lab Worklists, Tests & Barcodes | `/app/lab` | ✅ | ✅ | `diagnostic_orders` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Specimen tracking complete. |
| **E. Radiology** | Imaging Studies & Modalities | `/app/lab` | ✅ | ✅ | `radiology_studies` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | Modality registry & study schema live. |
| **F. LIS Adapter** | ASTM/HL7 Machine Simulator | `lib/integrations/lis` | ⚠️ | ✅ | Internal Message Queue | ✅ | ✅ | ✅ | ✅ | `EXTERNAL-DEPENDENCY` | Software simulator ready; hardware RS-232 bridge external. |
| **G. OT Suite** | Theatre Booking & Procedures | `/app/ot` | ✅ | ✅ | `surgeries` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Scheduling & surgeon roster verified. |
| **H. Pharmacy** | Stock, POS, Expiry & FEFO | `/app/pharmacy` | ✅ | ✅ | `pharmacy_inventory` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Zero negative stock enforced. |
| **I. Blood Bank** | Donor, Blood Inventory & Crossmatch | `/app/lab` | ✅ | ✅ | `blood_inventory` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | Safe crossmatch guard schema live. |
| **J. Finance/ERP** | Billing, Cashier & GL Ledger | `/app/billing`, `/app/accounting` | ✅ | ✅ | `invoices`, `gl_entries` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Double-entry ledger verified. |
| **K. Insurance** | Payer Claims & Settlement | `lib/insurance` | ⚠️ | ✅ | `insurance_claims` | ✅ | ✅ | ✅ | ✅ | `EXTERNAL-DEPENDENCY` | Claims software schema ready; live insurer API portal external. |
| **L. HR & Payroll** | Employee Roster & Biometric Hook | `/app/hr` | ✅ | ✅ | `employees`, `payrolls` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Attendance, payroll & roster live. |
| **M. Biomedical** | Asset Lifecycle & Calibration Logs | `/app/assets` | ✅ | ✅ | `fixed_assets` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Equipment registry functional. |
| **N. Registrar** | Birth/Death/Medical Certificates | `lib/registrar` | ✅ | ✅ | `medical_certificates` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | Deterministic seq & anti-tamper QR live. |
| **P. Transport** | Ambulance Fleet & Trip Dispatch | `lib/transport` | ✅ | ✅ | `ambulance_trips` | ✅ | ✅ | ✅ | ✅ | `IMPLEMENTED-IN-CURRENT-CYCLE` | Vehicle fleet & fare dispatch schema live. Real-time GPS external. |
| **Y. Executive MIS** | Real-Time MIS & Forensic Reports | `/app/reports` | ✅ | ✅ | Multi-table Aggregation | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Daily revenue, departmental totals live. |

---

## 🎯 Verification Criteria Definition
* **`EXISTING-FUNCTIONAL`**: Full end-to-end stack (UI + Server Action + DB persistence + RLS + RBAC + Audit + Automated Tests).
* **`IMPLEMENTED-IN-CURRENT-CYCLE`**: Newly added in Migration 068 with PostgreSQL persistence, RLS policies, and schema qualification.
* **`EXTERNAL-DEPENDENCY`**: Complete software interface & simulator implemented; real physical device, merchant key, or vendor credentials required for live connectivity.
