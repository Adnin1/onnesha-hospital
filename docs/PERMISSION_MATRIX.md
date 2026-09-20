# SYSTEM PERMISSION MATRIX & ACCESS CONTROL SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  
**Model:** Dynamic Role-Based Access Control (RBAC) with Granular Key Mapping  

---

## 1. Permission Matrix by Role

| Permission Key | Description | Super Admin | Hospital Admin | Doctor | Receptionist | Cashier | Lab Tech | Pathologist | Pharmacist | Nurse | Viewer |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `patients.view` | View patient master directory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patients.create` | Register new patients | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patients.update` | Edit demographics/contacts | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `patients.delete` | Archive/soft-delete patient | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `appointments.view` | View schedules and token queues | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `appointments.create` | Issue serial/tokens & book slots | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `appointments.cancel` | Cancel or reschedule bookings | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `prescriptions.write` | Compose and sign electronic Rx | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.view` | View invoices and shift logs | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.create` | Create invoice & collect payment | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.discount` | Cashier discount (capped <= 10%) | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.discount_override` | Special discount approval (> 10%) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.refund` | Authorize customer money refund | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `billing.void` | Void erroneous unpaid invoices | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lab.order` | Create diagnostic test orders | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lab.collect` | Specimen accessioning & barcode | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `lab.result` | Input numerical/text test findings| ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `lab.verify` | Pathologist signature authorization| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `pharmacy.view` | View medicine catalog and stocks | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `pharmacy.sale` | Dispense medicines at POS counter | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `pharmacy.purchase` | Ingest supplier purchase orders | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Mgr) | ❌ | ❌ |
| `pharmacy.adjust` | Write-off damaged or expired stock| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Mgr) | ❌ | ❌ |
| `ipd.admit` | Admit patient and allocate bed | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `ipd.transfer` | Execute inter-bed/ward transfer | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `ipd.discharge` | Prepare and sign discharge note | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `emergency.view` | View emergency triage queues | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `emergency.triage` | Assign casualty triage code (Red/Yel/Grn)| ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `hr.view` | View employee roster and punches | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `hr.payroll` | Run monthly salary calculations | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `settings.manage` | Modify hospital profile & config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `audit.view` | Inspect immutable audit logs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 2. Viewer Role Specifications

The `VIEWER` role is strictly **read-only**:
- Allowed: Viewing directory information (`patients.view`, `appointments.view`).
- Forbidden: All mutation, creation, financial deletion, and clinical signing permissions.
- Server-side and RLS policies block any write or modification operations initiated by a viewer.
