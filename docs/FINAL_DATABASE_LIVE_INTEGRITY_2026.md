# Onnesha Hospital Management System (OHMS)
## Final Database Live Integrity & ERP Invariants Verification (2026)
**Document ID:** `DOC-VERIFY-DB-INTEGRITY-2026`  
**Generated At:** 2026-09-22T15:00:00+06:00  
**Verification Scope:** Core Clinical, Financial, ERP, and Accounting Database Invariants  
**Test Coverage:** 65 Test Suites (563 Active Test Cases Passed)  
**Database Migrations:** 57 / 57 Migrations Synchronized (`iuhtzahuszdkdarhxobx`)  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. Domain Integrity & Forensic Rules

| Functional Module | Architectural Rule & Database Invariant | Automated Test Coverage | Status |
| :--- | :--- | :--- | :---: |
| **Strict Non-Bypassable 3-Way Match (Migration 57)** | Zero-line fallback eliminated. Mandatory `po_item_id NOT NULL`. Line-level unit price and quantity matched against PO and GRN. Fails closed. | `phase56-true-3way-match-and-concurrency.test.mjs`, `phase57-strict-cumulative-3way-match.test.mjs` | `PASS` |
| **Cumulative PO Consumption (Migration 57)** | Cumulative sum of invoiced quantities across previously posted invoices plus current invoice must not exceed PO ordered and received quantity. | `phase57-strict-cumulative-3way-match.test.mjs` | `PASS` |
| **Cumulative GRN Consumption (Migration 57)** | Cumulative sum of invoiced quantities must not exceed GRN received quantity. Prevents double-invoicing received goods. | `phase57-strict-cumulative-3way-match.test.mjs` | `PASS` |
| **Double-Entry Accounting** | Every journal entry strictly balances: $\sum\text{Debit} == \sum\text{Credit}$. Unbalanced journals rejected at the database level. | `phase42-erp-accounting-double-entry.test.mjs` | `PASS` |
| **Cumulative Overpayment Prevention** | Row lock on invoice and payment. Cumulative payments must not exceed invoice total amount within 0.05 BDT tolerance. | `phase56-true-3way-match-and-concurrency.test.mjs` | `PASS` |
| **Unique Journal Reference Invariant** | Unique index `uq_journal_entries_org_ref` on `(organization_id, reference_type, reference_id)` prevents race condition duplicates. | `phase56-true-3way-match-and-concurrency.test.mjs` | `PASS` |
| **Fiscal Period Immutability** | Posted journals in closed fiscal periods cannot be modified or deleted. Adjustments require explicit reversal journals. | `phase50-accounting-period-immutability-and-3way-match.test.mjs` | `PASS` |
| **Pharmacy Inventory (FEFO)** | First-Expiry-First-Out dispensing logic. Expired batches locked from sale. Advisory locks prevent negative stock concurrency races. | `pharmacy.test.mjs`, `phase43-erp-procurement-and-inventory.test.mjs` | `PASS` |
| **Billing & Payment Atomicity** | Invoice generation and payment recording executed in atomic transactions. Voided receipts trigger audited reversal lines. | `phase32-billing-atomicity-payment-contracts.test.mjs`, `billing.test.mjs` | `PASS` |
| **Clinical OPD & Appointments** | Appointment token numbers are sequential and unique per doctor schedule. Token check projections leak 0 patient PII. | `appointments.test.mjs`, `phase41-v107-public-schedules-and-website-hardening.test.mjs` | `PASS` |
| **IPD & Bed Management** | Double-booking of active occupied beds strictly rejected via database exclusion / trigger constraints. | `beds-ot.test.mjs`, `phase44-erp-assets-and-nursing.test.mjs` | `PASS` |
| **Operation Theatre (OT)** | Room scheduling concurrency check prevents room booking collisions. | `beds-ot.test.mjs` | `PASS` |
| **HR & Payroll** | Attendance and salary disbursements linked to chart of accounts journal vouchers. | `hr.test.mjs` | `PASS` |
| **System Audit Trail** | Forensic audit log records all user mutations (`INSERT`, `UPDATE`, `DELETE`) with actor ID, timestamp, and previous/new JSON diffs. | `audit-hardening.test.mjs`, `phase35-case-safe-cash-and-deep-audit.test.mjs` | `PASS` |

---

## 2. Invariant Verification Conclusion

All transactional invariants, financial balancing rules, cumulative consumption guards, and stock management models have passed automated regression test suites without failures.
Database migrations ensure schema immutability and referential integrity across all clinical and financial modules.
