# Onnesha Hospital Management System (OHMS)
## Final Supabase Live Security & RLS Isolation Architecture (2026)

**Document ID:** `DOC-SUPABASE-LIVE-SEC-2026`  
**Target Cluster:** Supabase PostgreSQL 17.6.1 (`iuhtzahuszdkdarhxobx`)  
**Database Migration Baseline:** 57 / 57 Migrations Synchronized  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. Multi-Tenant Row-Level Security (RLS) Matrix

Every exposed database table enforces PostgreSQL Row-Level Security (RLS) linked to the active tenant via `private.get_current_org_id()`:

| Table Name | RLS Status | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy | Tenant Isolation Mechanism |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `patients` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `appointments` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `invoices` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `invoice_items` | **ENABLED** | Invoice Org | Invoice Org | Invoice Org | Denied | Foreign key through `invoices.organization_id` |
| `payments` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `chart_of_accounts` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `journal_entries` | **ENABLED** | Org Match | RPC Only | Immutability Trigger | Denied | Atomic double-entry GL ledger |
| `journal_entry_lines`| **ENABLED** | JE Org Match | RPC Only | Immutability Trigger | Denied | Double-entry journal line verification |
| `fiscal_periods` | **ENABLED** | Org Match | Org Match | Super Admin | Denied | `organization_id = private.get_current_org_id()` |
| `purchase_orders` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `purchase_order_items`| **ENABLED**| PO Org Match | PO Org Match | PO Org Match | Denied | Foreign key through `purchase_orders` |
| `goods_receipt_notes`| **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `goods_receipt_items`| **ENABLED** | GRN Org Match| GRN Org Match| GRN Org Match| Denied | Foreign key through `goods_receipt_notes` |
| `supplier_invoices` | **ENABLED** | Org Match | Org Match | Org Match | Denied | `organization_id = private.get_current_org_id()` |
| `supplier_invoice_items`|**ENABLED**| SI Org Match | SI Org Match | SI Org Match | Denied | Foreign key through `supplier_invoices` |
| `pharmacy_batches` | **ENABLED** | Org Match | Org Match | Org Match | Denied | FEFO expiry and batch tracking |
| `employees` | **ENABLED** | Org Match | Org Match | Org Match | Denied | Staff directory and payroll records |
| `payroll_runs` | **ENABLED** | Org Match | Org Match | Org Match | Denied | Monthly payroll disbursement batches |
| `hospital_assets` | **ENABLED** | Org Match | Org Match | Org Match | Denied | Biomedical equipment registry |
| `audit_logs` | **ENABLED** | Org Match | Append-Only | Denied (Immutable) | Denied | Append-only forensic audit trail |

---

## 2. SECURITY DEFINER Hardening Invariants

Every privileged database function adheres strictly to the official PostgreSQL & Supabase security guidelines:

1. **Empty Search Path:** `SET search_path = ''` on all `SECURITY DEFINER` functions to prevent search path hijacking.
2. **Schema-Qualified References:** Every internal table, view, or type reference explicitly includes schema qualification (e.g., `public.chart_of_accounts`, `private.get_current_org_id()`, `auth.uid()`).
3. **Execution Privilege Restrictions:**
   - `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
   - `REVOKE ALL ON FUNCTION ... FROM anon;`
   - `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;`
4. **Active Tenant Guard:**
   ```sql
   v_active_org := private.get_current_org_id();
   IF v_active_org IS NULL OR v_active_org != p_org_id THEN
       RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
   END IF;
   ```

---

## 3. Storage & Realtime Security

- **Storage Buckets (`medical-records`, `prescriptions`, `lab-reports`):**
  - Configured as `public: false` (private buckets).
  - Direct anonymous HTTP downloads are rejected.
  - Access requires authenticated session or time-limited signed URLs generated server-side.
  - File upload mime types and size limits ($< 10\text{ MB}$) are enforced.
- **Supabase Realtime:**
  - Topic subscriptions respect RLS policies.
  - Cross-tenant queue updates are blocked at the database publication level.

---

## 4. Staging Live Security Test Gate

- In CI, the test suite executes `node scripts/run-tests.mjs --certification`.
- The live cross-tenant attack suite (`tests/live/*.live.test.mjs`) connects strictly to staging via `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY`.
- If staging credentials are not supplied, the test runner marks the live test deferred and prevents targeting production credentials.
