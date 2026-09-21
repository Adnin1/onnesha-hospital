# OHMS ERP: Supabase Live Security & Database Audit (2026)

**Target Project:** `iuhtzahuszdkdarhxobx` (`aaih.apon@gmail.com's Project`, Region: `ap-southeast-1`)  
**Database Engine:** PostgreSQL 17.6.1.166 (Active Healthy)  
**Verification Date:** September 22, 2026  
**Auditor Mode:** Supabase Database Security Engineer & Forensic Auditor  

---

## 1. Migration Synchronization Status

- **Total Local Migrations:** 54
- **Total Remote Applied Migrations:** 54
- **Sync Status:** **PASS (100% IN SYNC)**
- **Latest Applied Migrations:**
  - `20260921060000_erp_true_accounting_and_runtime_integrity.sql` (APPLIED)
  - `20260921070000_secure_public_waiting_queue_and_contact_intake.sql` (APPLIED)

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
