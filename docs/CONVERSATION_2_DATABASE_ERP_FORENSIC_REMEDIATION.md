# Forensic Verification & Remediation Report: Conversation 2
## Database Architecture, True ERP Accounting, Transaction Ordering & Runtime Integrity

**Target Release:** Baseline Refinement (`v1.1.4`)  
**System:** Onnesha Hospital Management & Enterprise Resource Planning (OHMS ERP)  
**Verification Date:** September 2026  
**Auditor / Agent:** Antigravity (Google DeepMind)  
**Status:** CONVERSATION 2 COMPLETE & VERIFIED (Quality Gates 100% Passed)

---

### 1. Executive Summary

This report documents the deep forensic review, schema correction, transactional re-architecting, and runtime verification of the database and enterprise resource planning (ERP) modules in `Adnin1/onnesha-hospital`.

Prior to this workstream, an architectural conflict existed between journal posting and line immutability:
`post_journal_entry_atomic` inserted the journal entry header as `POSTED` before inserting lines into `journal_entry_lines`. When `trg_fn_enforce_journal_line_immutability` checked the parent entry, it threw an immutability exception because parent status was already `POSTED`. In addition, `journal_entries.status` had a check constraint restricting status to `('DRAFT', 'POSTED', 'VOID')`, blocking the `REVERSED` status required by reversal workflows.

Through **Migration 53** (`20260921060000_erp_true_accounting_and_runtime_integrity.sql`) and associated TypeScript action upgrades, this conflict was resolved with an atomic state-transition architecture (`PENDING` header -> line inserts -> atomic `POSTED` transition), complete double-entry invariants, line-level 3-way matching, billing subsequent payment GL posting, invoice void GL reversal, and server-side authoritative reporting RPCs.

---

### 2. Forensic Findings & Architectural Remediations

| # | Domain / Component | Defect Found | Remediation Implemented | Migration & Code References |
|---|---|---|---|---|
| 1 | **Journal Transaction Ordering** | Header inserted with `status = 'POSTED'` prior to line insertion, conflicting with `trg_journal_lines_immutability` which rejected line inserts into posted entries. | Re-architected `post_journal_entry_atomic`: Header inserted in controlled `'PENDING'` state, lines inserted, then header transitioned atomically to `'POSTED'`. | `Migration 53`, lines 220-310 |
| 2 | **Journal Status Check Constraint** | `journal_entries_status_check` only permitted `('DRAFT', 'POSTED', 'VOID')`, causing runtime check failures when attempting to set `status = 'REVERSED'`. | Replaced constraint with: `CHECK (status IN ('DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'VOID'))`. | `Migration 53`, lines 25-33 |
| 3 | **Double-Entry Balance Invariants** | Table-level check constraint ensuring `total_debit = total_credit` was missing on `public.journal_entries`. | Added `chk_journal_entries_balanced` (`CHECK (total_debit = total_credit AND total_debit >= 0)`) and `chk_journal_entries_posted_nonzero`. | `Migration 53`, lines 35-51 |
| 4 | **Immutability Enforcement** | Needed verification that line counts >= 2 and line sums match header totals before locking as `'POSTED'`. | Enhanced `trg_fn_enforce_journal_entry_immutability`: strictly verifies line count >= 2, line DR/CR sums equal header totals, and permanently locks header against deletion or mutation once posted. | `Migration 53`, lines 55-140 |
| 5 | **Line-Move Attack Prevention** | Risk of malicious actors transferring lines across journal entries via `UPDATE journal_entry_id`. | Hardened `trg_fn_enforce_journal_line_immutability`: strictly prohibits line transfers (`NEW.journal_entry_id != OLD.journal_entry_id`). | `Migration 53`, lines 150-205 |
| 6 | **Procurement 3-Way Match** | Lacked line-level quantity check between PO ordered quantity and GRN received quantity. | Enhanced `post_supplier_invoice_to_gl_atomic`: added Gate 2 to verify `poi.quantity_received <= poi.quantity_ordered`. Sets `match_status = 'QTY_DISCREPANCY'` and aborts on violation. | `Migration 53`, lines 320-360 |
| 7 | **Billing Subsequent Payment** | Cashier subsequent payments against existing invoices lacked direct, idempotent GL integration. | Implemented `post_payment_receipt_to_gl_atomic`: records DR Cash (1010) / Bank (1020) and CR Accounts Receivable (1100) with idempotency guard. | `Migration 53`, lines 400-475; `lib/accounting/actions.ts` |
| 8 | **Invoice Void GL Reversal** | Supervisor voiding of invoices did not automatically reverse posted revenue journal entries. | Implemented `void_invoice_and_reverse_gl_atomic`: atomically sets `is_voided = TRUE, status = 'VOID'` and triggers `reverse_journal_entry_atomic`. | `Migration 53`, lines 480-550; `lib/accounting/actions.ts` |
| 9 | **Server-Side Financial Reporting** | Trial balance was computed client-side by pulling all lines across network. | Implemented `get_trial_balance` and `get_general_ledger_report` RPCs with `SECURITY DEFINER SET search_path = ''`. | `Migration 53`, lines 560-650; `lib/accounting/actions.ts` |
| 10 | **Database Index Performance** | Missing composite indexes on journal dates, references, supplier invoice status, and fiscal periods. | Added 7 dedicated composite indexes on `journal_entries`, `journal_entry_lines`, `supplier_invoices`, `fiscal_periods`, and `medicine_batches`. | `Migration 53`, lines 655-685 |

---

### 3. File Inventory of Changes

#### Created Files:
1. `supabase/migrations/20260921060000_erp_true_accounting_and_runtime_integrity.sql` - Migration 53 (53 total migrations now in catalog).
2. `tests/phase53-erp-true-accounting-and-runtime-integrity.test.mjs` - 13 structural and AST tests for Migration 53.
3. `tests/phase54-accounting-runtime-simulation.test.mjs` - 14 runtime simulation tests executing double-entry mathematics, immutability attacks, 3-way match, and concurrency.
4. `docs/CONVERSATION_2_DATABASE_ERP_FORENSIC_REMEDIATION.md` - This forensic report.

#### Modified Files:
1. `lib/accounting/actions.ts` - Integrated `get_trial_balance` RPC, added `postPaymentReceiptToGlAction`, `voidInvoiceAndReverseGlAction`, and `getGeneralLedgerReportAction` with 100% strict TypeScript types.

---

### 4. Quality Gates Verification Evidence

All six quality gates were executed locally with zero errors, zero warnings, and zero skips:

```
======================================================================
GATE 1: TypeScript Static Typecheck
Command: npm run typecheck
Result:  PASS (0 errors)
======================================================================
GATE 2: ESLint Static Quality Gate
Command: npx eslint . --max-warnings 0
Result:  PASS (0 errors, 0 warnings)
======================================================================
GATE 3: Dependency Security Audit
Command: npm audit --audit-level=high
Result:  PASS (found 0 vulnerabilities)
======================================================================
GATE 4: Certification Regression Test Suite
Command: npm run test:certification
Result:  PASS (57/57 test suites passed, 506 active passes, 0 failures, 0 blocked)
======================================================================
GATE 5: Next.js Production Static Export & Build
Command: npm run build
Result:  PASS (43 static routes compiled and prerendered)
======================================================================
GATE 6: Playwright Chromium Real Browser E2E Suite
Command: npx playwright test --project=chromium
Result:  PASS (22/22 browser specs passed in 13.8s)
======================================================================
```

---

### 5. Cross-Module ERP Transaction Integrity Matrix

| ERP Flow | Trigger Action | Database Operation | Invariant Enforced | Audit & Immutability Result |
|---|---|---|---|---|
| **FLOW A: Patient Billing** | Cashier creates invoice | `create_invoice_atomic` -> `post_billing_to_gl_atomic` | DR Cash/AR/Discount, CR Revenue; $\sum DR = \sum CR = \text{Subtotal}$ | Locked in `journal_entries` (`POSTED`), recorded in `audit_logs` |
| **FLOW B: Payment Receipt** | Subsequent settlement | `collect_payment_atomic` -> `post_payment_receipt_to_gl_atomic` | DR Cash (1010) / Bank (1020), CR AR (1100); $\text{Payment} \le \text{Due}$ | Immutable receipt; prevents overpayment and double-posting |
| **FLOW C: Invoice Voiding** | Supervisor voids invoice | `void_invoice_and_reverse_gl_atomic` | Inverts original journal entry with identical amounts | Original entry -> `REVERSED`; reversing entry -> `POSTED` |
| **FLOW D: Procurement 3-Way Match** | Supplier invoice approved | `post_supplier_invoice_to_gl_atomic` | GRN exists; PO supplier matches; Qty $\le$ Ordered; Price $\le \pm 0.05$ BDT tolerance | DR Inventory (1200), CR Accounts Payable (2010); `match_status = 'MATCHED'` |
| **FLOW E: Supplier Payment** | Accounts Payable payout | `record_supplier_payment_to_gl_atomic` | DR Accounts Payable (2010), CR Bank (1020); $\text{Paid} \le \text{Total}$ | AP balance decremented; duplicate payment blocked |
| **FLOW F: Pharmacy POS** | Medicine dispensed | `record_pharmacy_sale_atomic` | `FOR UPDATE` row lock on batch; rejects expired batches; exact stock sale | DR Cash (1010), CR Revenue (4020); DR COGS (5010), CR Inventory (1210) |
| **FLOW G: Payroll Accrual** | Monthly payroll approved | `post_payroll_accrual_to_gl_atomic` | DR Salary Expense (5010), CR Salaries Payable (2020) + Withholdings (2030) | Full jurisdictional accrual posted to GL |
| **FLOW H: Asset Depreciation** | Depreciation schedule | `record_asset_depreciation_to_gl_atomic` | DR Depreciation Exp (5030), CR Accumulated Dep (1590); $\text{Dep} \le \text{Value}$ | Carrying value updated; GL entry immutable |

---

### 6. External Prerequisites & Blockers

The following items are external prerequisites for live staging/production verification in Conversation 3:
1. **Dedicated Staging Supabase Credentials:**
   - `OHMS_TEST_SUPABASE_URL`
   - `OHMS_TEST_SERVICE_ROLE_KEY`
   - `OHMS_TEST_PUBLISHABLE_KEY`
   Required for `npm run test:live-security` (currently fails closed when absent).
2. **Cloudflare Deployment Credentials:**
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   Required for automated deployment to Cloudflare Pages (currently fails closed when absent).

---

### 7. Handoff to Conversation 3

- **Current Git HEAD:** Baseline `5697cff` + Conversation 2 modifications ready for atomic commit and push.
- **Next Step:** Conversation 3 — GitHub Actions CI/CD fail-closed gate analysis, Cloudflare Pages deployment verification, Desktop release parity, and Final Production Gate.
