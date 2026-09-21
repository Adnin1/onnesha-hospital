# OHMS ERP: Production Database & Double-Entry Accounting Invariants (2026)

**Target System:** Onnesha Hospital ERP  
**Verification Date:** September 22, 2026  
**Auditor Mode:** Database Forensic & Enterprise Accounting Engineer  

---

## 1. Accounting & Fiscal Period Invariants

1. **Double-Entry General Ledger ($\sum \text{Debit} = \sum \text{Credit}$):**
   - Enforced at database trigger level on `journal_entry_lines`.
   - Balanced journal constraint guarantees ledger equilibrium across all posting transactions.
2. **Posting Immutability & Fiscal Period Control:**
   - Once a journal entry moves to status `POSTED`, update and delete operations are rejected by database triggers.
   - Adjustments must be performed via reverse journal entries.
   - Closed accounting periods reject posting attempts.
3. **Three-Way Matching:**
   - Purchase Order (PO) $\to$ Goods Receipt Note (GRN) $\to$ Supplier Invoice.
   - Matched quantities and prices prevent unauthorized invoice approval.

---

## 2. Backup & Disaster Recovery Assessment

- **Automated Snapshots:** Supabase daily infrastructure snapshots active.
- **Physical Restore Verification:** **BLOCKED (Unverified in Non-Production)**.
  - In compliance with zero-trust certification, automated cloud backups without a documented dry-run restore in a staging database cannot be certified as PASS.
