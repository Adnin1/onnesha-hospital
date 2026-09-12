# ROLE-BASED ACCESS CONTROL (RBAC) ARCHITECTURE & ENGINE SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  

---

## 1. Multi-Tenant Role Hierarchy

1. **`SUPER_ADMIN`**: Complete multi-organization governance, SaaS billing, and platform-wide security overrides.
2. **`HOSPITAL_ADMIN`**: Full administrative, operational, and financial control over the hospital tenant.
3. **`FINANCE_ADMIN`**: Financial controller, expense approvals, large discount overrides, and ledger audits.
4. **`ACCOUNTANT / CASHIER`**: Invoicing, payment collection, shift reconciliation.
5. **`DOCTOR`**: Clinical chambers, electronic prescriptions, diagnosis, and patient medical records.
6. **`RECEPTIONIST`**: Patient registration, appointment scheduling, serial token queue calling.
7. **`LAB_TECHNICIAN`**: Phlebotomy, specimen accessioning, and parameter result entry.
8. **`PATHOLOGIST`**: Electronic signature verification and analytical report authorization.
9. **`PHARMACIST`**: Retail medicine dispensing, batch management, and goods receipt (GRN).
10. **`NURSE`**: IPD vitals logging, bed allocation, and ward administration.
11. **`HR_MANAGER`**: Staff directory, biometric attendance reconciliation, and monthly payroll.
12. **`VIEWER`**: Executive read-only analytics access.

---

## 2. Server-Side Permission Verification
```typescript
import { requirePermission } from "@/lib/auth/session";

export async function createPatientRecord(formData: FormData) {
  // Server-side permission assertion
  await requirePermission("patients.create");
  // Proceed with safe database transaction...
}
```
Client UI hiding is coupled with uncompromising server-side enforcement.
