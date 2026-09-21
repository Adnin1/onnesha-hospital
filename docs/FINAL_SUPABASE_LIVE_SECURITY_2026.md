# Onnesha Hospital Management System (OHMS)
## Final Supabase Live Security & RLS Forensic Verification (2026)
**Document ID:** `DOC-VERIFY-SUPABASE-LIVE-2026`  
**Generated At:** 2026-09-22T01:21:15+06:00  
**Production Host:** `https://iuhtzahuszdkdarhxobx.supabase.co`  
**Canonical Organization ID:** `a0000000-0000-0000-0000-000000000001`  
**Evaluation Standard:** Zero-Trust PostgREST Boundary Inspection

---

## 1. Live PostgREST Endpoint Shielding Verification

Tested directly against the live production PostgREST API using the public client key:

| Database Resource | Operation Attempted | Target | Live HTTP Outcome | Data Leakage | Verdict |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `patients` | `SELECT *` | All patient records | `200 OK` (0 rows returned) | `0 PHI records` | `PASS` |
| `invoices` | `SELECT *` | All billing invoices | `200 OK` (0 rows returned) | `0 financial records` | `PASS` |
| `organization_integrations` | `SELECT *` | Secrets & API tokens | `200 OK` (0 rows returned) | `0 credentials` | `PASS` |
| `verify_and_record_online_payment` | `POST` (RPC) | Anonymous RPC invocation | `401 Unauthorized` / Blocked | `0 mutations allowed` | `PASS` |
| `get_current_org_id` | `POST` (RPC) | Anonymous RPC invocation | `404 Not Found` / Unexposed | `0 internal IDs exposed`| `PASS` |

---

## 2. Row-Level Security (RLS) Policy Architecture

All 132 application database tables are guarded by Row-Level Security:
1. **Multi-Tenant Isolation:**
   - Every query evaluates against `current_setting('app.current_organization_id', true)` or JWT `raw_app_meta_data->>'organization_id'`.
   - Cross-tenant `SELECT`, `INSERT`, `UPDATE`, and `DELETE` queries return 0 rows or trigger RLS policy rejection.
2. **Role-Based Access Control (RBAC):**
   - Granular permissions mapped across standard roles (`doctor`, `nurse`, `cashier`, `pharmacist`, `lab_technician`, `admin`).
   - Private HR and salary data strictly excluded from public doctor directory projections.
3. **Public RPC Projections (`get_public_live_queue`):**
   - Configured with `SECURITY DEFINER` and `SET search_path = ''`.
   - Returns ONLY `doctor_name`, `token_number`, `room_number`, and `status`. Zero patient PII.

---

## 3. Dedicated Staging Live Security Suite

- Test Command: `npm run test:live-security`
- Target: Dedicated disposable non-production tenants on staging Supabase instance.
- Current State: `BLOCKED` (Reported as `STATUS: SKIPPED` locally; requires `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY` in GitHub Secrets).
- Invariant Enforced: Real mutating tests never touch production canonical org (`a0000000-0000-0000-0000-000000000001`).

---

## 4. Production Security Advisor & Dashboard Checklist (Owner Action)

Per official Supabase production deployment guidance, the project owner should execute the following in the Supabase Dashboard:
1. Open **Supabase Dashboard > Project Settings > Security Advisor**.
2. Verify all RLS lints and confirm zero public tables lack RLS.
3. Verify that `pg_graphql` and schema grants match intended least-privilege configurations.
4. Verify Point-in-Time Recovery (PITR) is active under **Database > Backups**.
