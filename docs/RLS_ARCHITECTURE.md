# ROW LEVEL SECURITY (RLS) ARCHITECTURE & ISOLATION POLICIES
**Project:** Onnesha Hospital Management System (OHMS)  
**Security Standard:** Zero Data Leakage Across Healthcare Tenants  

---

## 1. RLS Strategy Overview

In OHMS, application-level `WHERE organization_id = ?` filtering is treated as a presentation convenience, **not** a security boundary. Hardened security is enforced strictly at the database kernel level through PostgreSQL Row Level Security.

### Execution Model:
1. Every authenticated session sets the PostgreSQL local configuration parameter:
   ```sql
   SET LOCAL app.current_organization_id = '<user-active-organization-uuid>';
   ```
2. The stable helper function extracts this context:
   ```sql
   CREATE OR REPLACE FUNCTION get_current_org_id() 
   RETURNS UUID AS $$
   BEGIN
       RETURN NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
   END;
   $$ LANGUAGE plpgsql STABLE;
   ```
3. Every tenant table evaluates this function on `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.

---

## 2. Policy Categories & Enforcement Matrix

| Policy Category | Target Tables | Enforcement Rule | Description |
| :--- | :--- | :--- | :--- |
| **Tenant Data Isolation** | `patients`, `patient_visits`, `patient_allergies`, `clinical_alerts`, `patient_diagnoses`, `clinical_notes`, `patient_transfers`, `patient_consents`, `patient_merge_requests`, `appointments`, `invoices`, `payments`, `beds`, `cabins`, `employees` | `organization_id = get_current_org_id()` | Guarantees that Hospital A cannot see or query Hospital B data under any circumstance. |
| **Audit Immutability** | `audit_logs` | `REVOKE UPDATE, DELETE` + `organization_id = get_current_org_id()` | Audit logs can only be inserted or read by permitted staff; cannot be wiped. |
| **Clinical Privacy** | `prescriptions`, `patient_history`, `diagnostic_results` | `visit_id IN (SELECT id FROM patient_visits WHERE organization_id = get_current_org_id())` | Ensures clinical diagnostic and prescription notes remain strictly within the hospital boundary. |
| **Inventory Partitioning** | `medicines`, `medicine_batches`, `stock_transactions` | `organization_id = get_current_org_id()` | Pharmacy stock balances and supplier costs are completely isolated per hospital. |

---

## 3. Threat Mitigation Scenarios

1. **SQL Injection Bypass:** Even if an attacker injects a malicious query like `SELECT * FROM patients WHERE 1=1`, PostgreSQL RLS intercepts the AST and automatically appends `AND organization_id = get_current_org_id()`, preventing cross-tenant leakage.
2. **Exposed Service Keys:** Service role keys are kept strictly in server-side Cloudflare Worker secrets and never delivered to frontend client bundles.
