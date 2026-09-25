# OHMS MASTER MODULE TRUTH & GAP MATRIX
**Authoritative Source of Truth:** Live Git Repository, Linked Supabase Schema & Production Edge  
**Audit Date:** 2026-09-26  
**Total Target Requirement Domains:** 25 Merged Domains  

---

## 📊 Comprehensive Module Status Matrix

| Domain | Capability Target | Dedicated Route / Artifact | UI | Server Actions / Client Queries | DB Persistence | Multi-Tenant RLS Policy | RBAC Guard | Audit Trail | Test Suite | Final Truth Status | Exact Current State & Operational Dependencies |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **A. Front Desk** | Patient Registry & 360 | `/app/patients` | ✅ | ✅ | `patients` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | End-to-end operational with live Supabase queries and registration. |
| **A. Front Desk** | Appointments & Tokens | `/app/appointments` | ✅ | ✅ | `appointments` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Online appointment queue, doctor slots and token generation active. |
| **A. Front Desk** | Health Cards & Member CRM | `/app/patients` | ✅ | ✅ | `health_cards` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Scoped composite uniqueness `(org_id, card_number)`, RLS active. |
| **B. IPD / Ward** | Admissions & Bed Grid | `/app/ipd`, `/app/beds` | ✅ | ✅ | `admissions`, `beds` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Bed occupancy grid, ward transfers, and admission state machine verified. |
| **B. IPD / Ward** | Clinical Vitals & Round Notes | `/app/opd` | ✅ | ✅ | `clinical_records` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Nurse vitals intake and doctor consultation console operational. |
| **C. Critical Care** | Unified ICU / CCU / SICU Engine | `/app/critical-care` | ✅ | ✅ | `critical_care_units`, `critical_care_admissions`, `critical_care_observations` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Dedicated route, live Supabase queries, empty state views, Migration 070 composite tenancy. |
| **D. Pathology** | Lab Worklists, Tests & Barcodes | `/app/lab` | ✅ | ✅ | `diagnostic_orders` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Specimen tracking, sample collection, verified test reports complete. |
| **E. Radiology** | Imaging Studies & Modalities | `/app/radiology` | ✅ | ✅ | `radiology_modalities`, `radiology_studies` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Dedicated route, modality worklist, study records, Migration 070 RLS hardening. PACS server connectivity is external. |
| **F. LIS Adapter** | ASTM/HL7 Machine Simulator | `lib/integrations/lis` | ⚠️ | ✅ | Internal Message Queue | ✅ | ✅ | ✅ | ✅ | `EXTERNAL-DEPENDENCY` | Software simulator ready; hardware RS-232 bridge / analyzer device external. |
| **G. OT Suite** | Theatre Booking & Procedures | `/app/ot` | ✅ | ✅ | `surgeries` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Scheduling & surgeon roster verified with conflict detection. |
| **H. Pharmacy** | Stock, POS, Expiry & FEFO | `/app/pharmacy` | ✅ | ✅ | `pharmacy_inventory` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Zero negative stock enforced, batch expiry management verified. |
| **I. Blood Bank** | Donor, Blood Inventory & Crossmatch | `/app/blood-bank` | ✅ | ✅ | `blood_donors`, `blood_inventory`, `blood_transfusion_records` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Dedicated route, live inventory queries, group cards, Migration 070 tenant uniqueness. Physical testing is laboratory-conducted. |
| **J. Finance/ERP** | Billing, Cashier & GL Ledger | `/app/billing`, `/app/accounting` | ✅ | ✅ | `invoices`, `gl_entries` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Double-entry ledger, cashier receipts, void audit justification verified. |
| **K. Insurance** | Payer Claims & Settlement | `lib/insurance` | ⚠️ | ✅ | `insurance_claims` | ✅ | ✅ | ✅ | ✅ | `EXTERNAL-DEPENDENCY` | Claims software schema ready; live insurer API portal credentials external. |
| **L. HR & Payroll** | Employee Roster & Biometric Hook | `/app/hr` | ✅ | ✅ | `employees`, `payrolls` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Attendance, payroll & roster live. Physical biometric scanner hardware external. |
| **M. Biomedical** | Asset Lifecycle & Calibration Logs | `/app/assets` | ✅ | ✅ | `fixed_assets` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Equipment registry and maintenance scheduling functional. |
| **N. Registrar** | Birth/Death/Medical Certificates | `/app/registrar` | ✅ | ✅ | `medical_certificates` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Dedicated route, deterministic numbering, cryptographic anti-tamper QR hash, live queries. |
| **P. Transport** | Ambulance Fleet & Trip Dispatch | `/app/ambulance` | ✅ | ✅ | `ambulance_vehicles`, `ambulance_trips` | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Dedicated route, vehicle fleet registry, trip dispatching, Migration 070 composite uniqueness. Real-time GPS hardware external. |
| **Y. Executive MIS** | Real-Time MIS & Forensic Reports | `/app/reports` | ✅ | ✅ | Multi-table Aggregation | ✅ | ✅ | ✅ | ✅ | `EXISTING-FUNCTIONAL` | Daily revenue, departmental totals, audit trail inspections live. |

---

## 🎯 Verification Criteria Definition
* **`EXISTING-FUNCTIONAL`**: Full end-to-end stack (Dedicated UI Route + Server Action/Client Query + Database Persistence + RLS Policies + RBAC Guards + Audit Trail + Automated Tests + Clean Empty/Loaded States).
* **`EXTERNAL-DEPENDENCY`**: Complete software architecture, database schema, and validation ready; real physical device, merchant key, or vendor credentials required for live connectivity.
* **`BLOCKED`**: Missing external authorization, account ownership, or third-party DNS configuration.
