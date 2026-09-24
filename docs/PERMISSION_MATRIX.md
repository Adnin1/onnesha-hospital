# SYSTEM PERMISSION MATRIX & ACCESS CONTROL SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  
**Model:** Dynamic Role-Based Access Control (RBAC) with Granular Key Mapping  
**Security Standard:** Principle of Least Privilege (PoLP) & Fail-Closed Enforcement  

---

## 1. Canonical Roles Specification (Exactly 9 Roles)

In OHMS, the system recognizes exactly **9 Canonical Hospital Roles**:

| # | Role Identifier | Canonical Role Name | Department / Operational Scope |
|---|---|---|---|
| **1** | `super_admin` | **Super Administrator** | Full unrestricted authority across all clinical, financial, IAM, and system configurations. |
| **2** | `hospital_administrator` | **Hospital Administrator** | Hospital operations, clinical oversight, department management, and staff account management (excluding Super Admin privilege elevation). |
| **3** | `accountant` | **Accountant / Cashier** | Patient billing, POS cash collection, invoice discounting, refunds, ledgers, and financial reports. |
| **4** | `doctor` | **Doctor / Clinical Consultant** | OPD consultations, clinical notes, digital prescriptions, inpatient visit logs, and lab diagnostic orders. |
| **5** | `nurse` | **Nurse / Ward In-Charge** | Patient vitals, IPD bed allocations, casualty triage monitoring, and inpatient nursing care. |
| **6** | `lab_technologist` | **Lab Technologist / Pathologist** | Diagnostic test queue, specimen accessioning, numerical/text report entry, and diagnostic result verification. |
| **7** | `pharmacist` | **Pharmacist / Dispensary** | POS medicine dispensing, inventory batch tracking, expiry monitoring, and stock adjustments. |
| **8** | `hr_payroll` | **HR & Payroll Manager** | Staff directory, daily biometrics/attendance, employee rosters, and monthly salary disbursement. |
| **9** | `receptionist` | **Receptionist / Front Desk** | Patient registration, doctor appointment bookings, serial queue tokens, and basic billing lookup. |

---

## 2. Granular Permissions Matrix by Canonical Role

| Permission Key | Module | Super Admin | Hospital Admin | Accountant | Doctor | Nurse | Lab Tech | Pharmacist | HR Payroll | Receptionist |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `dashboard.view` | Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patients.view` | Patient | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `patients.create` | Patient | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `patients.edit` | Patient | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patients.history` | Patient | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `appointments.view` | Appointment | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `appointments.create` | Appointment | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `appointments.call_token` | Appointment | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `doctors.view` | Doctor | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `doctors.manage` | Doctor | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `opd.view` | OPD | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `opd.consult` | OPD | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ipd.view` | IPD | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `ipd.admit` | IPD | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ipd.transfer` | IPD | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ipd.discharge` | IPD | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `emergency.view` | Emergency | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `emergency.triage` | Emergency | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `lab.view` | Lab | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `lab.order` | Lab | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lab.sample_collect` | Lab | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `lab.enter_result` | Lab | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `lab.verify` | Lab | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `pharmacy.view` | Pharmacy | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `pharmacy.sale` | Pharmacy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `pharmacy.purchase` | Pharmacy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `pharmacy.stock_adjust` | Pharmacy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `beds.view` | Ward/Bed | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `beds.allocate` | Ward/Bed | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `ot.view` | OT | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prescriptions.view` | Rx | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prescriptions.create` | Rx | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.view` | Billing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `billing.create` | Billing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `billing.discount` | Billing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.void` | Billing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.refund` | Billing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `accounting.view` | Accounting | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `accounting.manage` | Accounting | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `hr.view` | HR | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `hr.attendance` | HR | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `hr.payroll` | HR | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `staff.view` | IAM | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `staff.create` | IAM | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `staff.manage` | IAM | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `staff.reset_password` | IAM | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `settings.view` | Settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `settings.manage_roles` | Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `settings.audit` | Settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Strict Privilege Elevation Guards

1. **Super Admin Creation**: Only an existing active Super Admin can create another Super Admin account. Hospital Administrator attempts are blocked with PostgreSQL exception.
2. **Role Elevation Guard**: Role changing RPC `admin_change_staff_role` prevents elevating any user to `super_admin` unless the invoker possesses `super_admin`.
3. **Session Revocation**: Password reset and account suspension automatically delete all corresponding rows in `auth.sessions`, rendering any stale browser tokens immediately non-functional.
