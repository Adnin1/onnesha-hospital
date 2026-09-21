# OHMS ERP: Production Database & Double-Entry Accounting Invariants (2026)

**Target System:** Onnesha Hospital ERP
**Verification Date:** September 22, 2026
**Auditor Mode:** Database Forensic & Enterprise Accounting Engineer
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`
**Database:** Supabase PostgreSQL 17.6.1 (`iuhtzahuszdkdarhxobx`)

---

## 1. Accounting & Fiscal Period Invariants

1. **Double-Entry General Ledger ($\sum \text{Debit} = \sum \text{Credit}$):**
   - Enforced at database trigger level on `journal_entry_lines`.
   - Balanced journal constraint guarantees ledger equilibrium across all posting transactions.
2. **Posting Immutability & Fiscal Period Control:**
   - Once a journal entry moves to status `POSTED`, update and delete operations are rejected by database triggers.
   - Adjustments must be performed via reverse journal entries.
   - Closed accounting periods reject posting attempts.
3. **Migration 55 Hardening:**
   - `get_trial_balance()`: Strict subquery `INNER JOIN` on `journal_entries` filtered by `organization_id`, `status IN ('POSTED', 'REVERSED')`, and `entry_date <= p_as_of_date`. Eliminates leakage of unposted or out-of-window lines.
   - `post_supplier_invoice_to_gl_atomic()`: True 3-way matching enforcing mandatory Purchase Order (`purchase_order_id` NOT NULL), verified Goods Receipt Note (`status IN ('RECEIVED', 'VERIFIED')`), and line item quantity matching.
   - `post_payment_receipt_to_gl_atomic()`: Validates invoice existence, positive amounts, blocks void invoice payments, and prevents overpayment.
   - `void_invoice_and_reverse_gl_atomic()`: Reverses GL postings and strictly blocks voiding when active payments exist.

---

## 2. Backup & Disaster Recovery Assessment

- **Automated Snapshots:** Supabase daily infrastructure snapshots active.
- **Physical Restore Verification:** **BLOCKED (Unverified in Non-Production)**.
  - In compliance with zero-trust certification, automated cloud backups without a documented dry-run restore in a staging database cannot be certified as PASS.
