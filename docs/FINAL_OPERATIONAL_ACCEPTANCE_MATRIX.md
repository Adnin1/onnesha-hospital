# Onnesha Hospital Management System — Final Operational Acceptance Matrix

This document provides an exhaustive, itemized audit matrix of all operational actions across every hospital module in the Onnesha Hospital Management System (OHMS).

---

## Acceptance Verification Criteria

Each action is evaluated against **10 strict functional criteria**:
1. **UI AVAILABLE**: Accessible interactive form, button, or modal in the admin control panel / staff interface.
2. **VALIDATION**: Server-side and client-side input validation and error handling.
3. **DATABASE PERSISTENCE**: Real PostgreSQL storage via Supabase with no mock array or memory fallback.
4. **RELATED MODULE UPDATE**: Changes propagate to downstream modules (e.g. prescription -> pharmacy, lab order -> lab queue).
5. **COUNTER UPDATE**: Real-time DB-driven dashboard and queue counters update automatically.
6. **AUDIT**: Action is recorded in `audit_logs` with actor ID, organization ID, and entity details.
7. **RBAC**: Protected by granular permission checks (e.g. `patients.create`, `billing.view`).
8. **RLS**: Enforces multi-tenant `organization_id` isolation at the database layer.
9. **PRINT / EXPORT**: Generates valid A4/80mm POS print format or structured CSV export.
10. **REAL E2E**: Verified through automated end-to-end integration and workflow test suites.

---

## Module Acceptance Matrix

### 1. Patient Management
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Register Patient | YES | YES | YES | Appointment/OPD | YES | YES | YES | YES | YES | YES | PASS |
| Edit Patient | YES | YES | YES | 360° Profile | YES | YES | YES | YES | YES | YES | PASS |
| Search Patient | YES | YES | YES | All Modules | N/A | N/A | YES | YES | YES | YES | PASS |
| View 360° Profile | YES | YES | YES | Medical Record | N/A | N/A | YES | YES | YES | YES | PASS |
| Start Visit | YES | YES | YES | OPD Queue | YES | YES | YES | YES | YES | YES | PASS |
| View Patient Timeline | YES | YES | YES | Timeline Events | N/A | N/A | YES | YES | N/A | YES | PASS |

### 2. Appointments & Scheduling
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Public Booking | YES | YES | YES | Staff Review | YES | YES | N/A | YES | YES | YES | PASS |
| Staff Booking | YES | YES | YES | Doctor Queue | YES | YES | YES | YES | YES | YES | PASS |
| Confirm Appointment | YES | YES | YES | Doctor Queue | YES | YES | YES | YES | N/A | YES | PASS |
| Reschedule Appointment | YES | YES | YES | Roster Slots | YES | YES | YES | YES | N/A | YES | PASS |
| Cancel Appointment | YES | YES | YES | Slot Availability | YES | YES | YES | YES | N/A | YES | PASS |
| Check-in Patient | YES | YES | YES | Token / Queue | YES | YES | YES | YES | YES | YES | PASS |
| Mark No-Show | YES | YES | YES | Queue Counters | YES | YES | YES | YES | N/A | YES | PASS |

### 3. Doctor Roster & Schedule Control
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Add Specialist Doctor | YES | YES | YES | Roster & Booking | YES | YES | YES | YES | YES | YES | PASS |
| Edit Doctor Details | YES | YES | YES | Public Directory | N/A | YES | YES | YES | N/A | YES | PASS |
| Activate/Deactivate | YES | YES | YES | Booking Availability | YES | YES | YES | YES | N/A | YES | PASS |
| Create Schedule Draft | YES | YES | YES | Doctor Dashboard | YES | YES | YES | YES | N/A | YES | PASS |
| Publish Schedule | YES | YES | YES | Booking Portal | YES | YES | YES | YES | N/A | YES | PASS |
| Cancel Schedule | YES | YES | YES | Booking Portal | YES | YES | YES | YES | N/A | YES | PASS |

### 4. OPD Consultation & Token Queue
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Generate Token | YES | YES | YES | Queue Counter | YES | YES | YES | YES | YES | YES | PASS |
| Call Patient | YES | YES | YES | Display Board | YES | YES | YES | YES | N/A | YES | PASS |
| Record Nurse Vitals | YES | YES | YES | Clinical Encounter | N/A | YES | YES | YES | N/A | YES | PASS |
| Start Consultation | YES | YES | YES | Patient Record | YES | YES | YES | YES | N/A | YES | PASS |
| Complete Consultation | YES | YES | YES | Billing / Lab / Pharmacy | YES | YES | YES | YES | YES | YES | PASS |

### 5. Emergency 24/7 Casualty Triage
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create Emergency Case | YES | YES | YES | Triage List | YES | YES | YES | YES | YES | YES | PASS |
| Assign Triage (Red/Yellow/Green) | YES | YES | YES | Priority Queue | YES | YES | YES | YES | N/A | YES | PASS |
| Record Vitals & Intubation | YES | YES | YES | Clinical Record | N/A | YES | YES | YES | N/A | YES | PASS |
| Admit to IPD | YES | YES | YES | Bed Matrix | YES | YES | YES | YES | YES | YES | PASS |
| Emergency Discharge / Refer | YES | YES | YES | Billing / Invoice | YES | YES | YES | YES | YES | YES | PASS |

### 6. IPD Admission & Bed/Cabin Matrix
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Admit Patient to Bed | YES | YES | YES | Bed Status (Occupied) | YES | YES | YES | YES | YES | YES | PASS |
| Bed Transfer | YES | YES | YES | Bed Matrix (Atomically released & occupied) | YES | YES | YES | YES | N/A | YES | PASS |
| Discharge Patient | YES | YES | YES | Bed Status (Available/Cleaning) | YES | YES | YES | YES | YES | YES | PASS |
| Create / Edit Bed Category | YES | YES | YES | Rate Master | N/A | YES | YES | YES | N/A | YES | PASS |

### 7. Operation Theatre (OT)
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Book OT Schedule | YES | YES | YES | Surgeon Roster | YES | YES | YES | YES | N/A | YES | PASS |
| Confirm OT Booking | YES | YES | YES | Room Allocation | YES | YES | YES | YES | N/A | YES | PASS |
| Complete Surgery Case | YES | YES | YES | IPD Charges / Billing | YES | YES | YES | YES | YES | YES | PASS |
| Cancel OT Case | YES | YES | YES | OT Schedule | YES | YES | YES | YES | N/A | YES | PASS |

### 8. Diagnostics (Lab & Imaging)
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create Lab Order | YES | YES | YES | Lab Queue | YES | YES | YES | YES | YES | YES | PASS |
| Collect Sample | YES | YES | YES | Worklist | YES | YES | YES | YES | N/A | YES | PASS |
| Enter Test Results | YES | YES | YES | Lab Review | N/A | YES | YES | YES | N/A | YES | PASS |
| Finalize & Publish Result | YES | YES | YES | Patient Profile / Billing | YES | YES | YES | YES | YES | YES | PASS |

### 9. Digital Prescriptions & Pharmacy POS
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create Digital Prescription | YES | YES | YES | Pharmacy Dispense Queue | N/A | YES | YES | YES | YES | YES | PASS |
| Pharmacy POS Sale | YES | YES | YES | Stock Ledger (FEFO Deduct) | YES | YES | YES | YES | YES | YES | PASS |
| Receive Medicine Stock | YES | YES | YES | Stock Inventory | YES | YES | YES | YES | N/A | YES | PASS |
| Void Sale / Stock Return | YES | YES | YES | Audit & Ledger | YES | YES | YES | YES | YES | YES | PASS |

### 10. Billing, Cashier & Financial Management
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create Invoice | YES | YES | YES | Accounts Receivable | YES | YES | YES | YES | YES | YES | PASS |
| Apply Authorized Discount | YES | YES | YES | Invoice Balance | YES | YES | YES | YES | YES | YES | PASS |
| Collect Payment (Full/Partial) | YES | YES | YES | Due Ledger / Reports | YES | YES | YES | YES | YES | YES | PASS |
| Issue Refund / Void Invoice | YES | YES | YES | Financial Audit | YES | YES | YES | YES | YES | YES | PASS |

### 11. HR, Payroll & Software Biometrics
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Add Employee | YES | YES | YES | HR Directory | YES | YES | YES | YES | YES | YES | PASS |
| Software Attendance | YES | YES | YES | Payroll Ledger | YES | YES | YES | YES | YES | YES | PASS |
| Physical Hardware Bridge | YES | YES | N/A | Hardware Terminal | N/A | N/A | N/A | N/A | N/A | N/A | EXTERNAL CONFIG REQUIRED |

### 12. Settings & System Audit
| Action | UI Available | Validation | DB Persistence | Related Module | Counter Update | Audit | RBAC | RLS | Print/Export | Real E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Save Hospital Settings | YES | YES | YES | Application Shell | N/A | YES | YES | YES | N/A | YES | PASS |
| View Forensic Audit Logs | YES | YES | YES | System Security | N/A | N/A | YES | YES | YES | YES | PASS |

---

## Overall System Functional Readiness Summary
- Total Operational Actions Audited: **52**
- Fully Verified & Operational: **51**
- External Hardware Bridge Note: **1** *(Physical Biometric Scanner Terminal)*
- **Overall Final Acceptance Status:** **READY WITH EXTERNAL CONFIGURATION**
