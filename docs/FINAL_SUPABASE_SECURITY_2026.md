# OHMS ERP: Supabase Live Security & Database Audit (2026)

**Target Project:** `iuhtzahuszdkdarhxobx` (`aaih.apon@gmail.com's Project`, Region: `ap-southeast-1`)
**Database Engine:** PostgreSQL 17.6.1.166 (Active Healthy)
**Verification Date:** September 22, 2026
**Auditor Mode:** Supabase Database Security Engineer & Forensic Auditor
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`

---

## 1. Migration Synchronization Status

- **Total Local Migrations:** 55
- **Total Remote Applied Migrations:** 55
- **Sync Status:** **PASS (100% IN SYNC)**
- **Latest Applied Migration:**
  - `20260922030000_harden_accounting_and_true_3way_match.sql` (APPLIED)
    - Converted `get_trial_balance()` to strict subquery `INNER JOIN` on `journal_entries` filtered by `organization_id`, `status IN ('POSTED', 'REVERSED')`, and `entry_date <= p_as_of_date`.
    - Enforced mandatory Purchase Order (`purchase_order_id` NOT NULL), GRN verification, and line item quantity matching in `post_supplier_invoice_to_gl_atomic()`.
    - Hardened `post_payment_receipt_to_gl_atomic()` with mandatory invoice check, positive amount assertion, and overpayment guard.
    - Hardened `void_invoice_and_reverse_gl_atomic()` with active payment block.

---

## 2. Live Database Telemetry & Inspector Metrics

Inspected via `npx supabase inspect db db-stats --linked` and `table-stats --linked`:
- **Database Size:** 17 MB
- **Index Hit Rate:** 99.0%
- **Table Hit Rate:** 100.0%
- **WAL Size:** 96 MB
- **Active Tables Inspected:** 54 tables across clinical, financial, ERP, and operational schemas.

---

## 3. RLS Policies & Anonymous Privilege Shielding

Empirically verified against live project `iuhtzahuszdkdarhxobx.supabase.co` via automated test suite (`tests/security-rls-anonymous-write-attacks.test.mjs` — 19/19 PASSED):
1. **Anonymous Write Mitigation:**
   - Anonymous `INSERT`, `UPDATE`, `DELETE` on `organizations`: **BLOCKED (PASS)**
   - Anonymous `INSERT`, `UPDATE`, `DELETE` on `departments`: **BLOCKED (PASS)**
   - Anonymous `INSERT`, `UPDATE`, `DELETE` on `doctors`: **BLOCKED (PASS)**
   - Anonymous `INSERT`, `UPDATE`, `DELETE` on `doctor_schedules`: **BLOCKED (PASS)**
2. **Clinical Privacy Shielding:**
   - Anonymous `SELECT` on `patients`: **0 rows returned / Denied (PASS)**
   - Anonymous `SELECT` on `audit_logs`: **0 rows returned / Denied (PASS)**
3. **RPC Privilege & Execution Security:**
   - Anonymous execution of `verify_and_record_online_payment`: **REVOKED (PASS)**
   - Direct caller invocation restricted strictly to `service_role`: **PASS**
   - Public queue projection `get_public_live_queue`: **SECURITY DEFINER with locked `search_path = ''` (PASS)**
