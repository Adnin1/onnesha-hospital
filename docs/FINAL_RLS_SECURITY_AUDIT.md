# Final Database & Row Level Security (RLS) Audit

> [!IMPORTANT]
> **RLS SECURITY DIRECTIVE:** In Onnesha Hospital Management System, Row Level Security (RLS) policies implemented in PostgreSQL serve as the primary security perimeter for multi-tenant data isolation (`organization_id`).

---

## 1. Schema RLS Status

Every public schema table containing patient, clinical, financial, or staff records has Row Level Security explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`):

| Table Name | RLS Status | Tenant Column | Access Policy |
| :--- | :--- | :--- | :--- |
| `patients` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `appointments` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `patient_visits` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `prescriptions` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `diagnostic_orders` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `diagnostic_results` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `invoices` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `payments` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `audit_logs` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |
| `push_subscriptions` | **ENABLED** | `organization_id` | Isolated by `get_current_org_id()` |

---

## 2. Multi-Tenant Cross-Access Policy Audit

- **Policy Definition:** All tenant tables use `CREATE POLICY ... USING (organization_id = get_current_org_id())`.
- **Verification Result:** An authenticated user from Tenant A cannot read, insert, update, or delete records belonging to Tenant B, even if the record UUID is known.
- **Anon Request Handling:** Requests with an invalid JWT or missing session context evaluate `get_current_org_id()` to `NULL`, returning `0` rows from RLS-protected tables.
