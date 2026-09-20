# HOSPITAL CLINICAL, FINANCIAL & OPERATIONAL BUSINESS RULES
**Project:** Onnesha Hospital Management System (OHMS)  

---

## 1. Patient Identity & Registration Rules
- **Rule BR-PAT-01:** Patient IDs are generated automatically via PostgreSQL sequence (`patient_code_seq`) with the tenant prefix (e.g. `P-202609-00001`). Manual ID override is strictly forbidden.
- **Rule BR-PAT-02:** Primary emergency phone number and gender are mandatory fields for every registration.
- **Rule BR-PAT-03:** All domestic Bangladeshi mobile numbers must be normalized into the canonical 11-digit form (`01[3-9]\d{8}`).
- **Rule BR-PAT-04:** Server-side duplicate detection combines exact NID matching, phone matching, and Dice bigram name similarity (score $\ge 0.70$) to prevent duplicate health charts while accommodating shared family phones.

## 2. Appointment & Token Integrity Rules
- **Rule BR-APT-01:** Concurrency-safe token generation must use the `token_counters` table with PostgreSQL `ON CONFLICT DO UPDATE`. Frontend client counters are forbidden.
- **Rule BR-APT-02:** A doctor cannot have duplicate tokens assigned for the exact same date and organization.
- **Rule BR-APT-03:** When an appointment status transitions to `'IN_CHAMBER'`, the previous patient's token in that chamber is automatically marked `'COMPLETED'`.

## 3. Financial & Billing Rules
- **Rule BR-BIL-01:** Invoices cannot be physically deleted. Invoices containing payment errors must be corrected via supervisor-approved `VOID` or `REFUND` transactions.
- **Rule BR-BIL-02:** Standard Cashiers cannot apply discounts exceeding `organization_settings.max_cashier_discount_pct` (default 10%). Any higher discount requires a supervisor approval record (`discount_approved_by`).
- **Rule BR-BIL-03:** Partial payments are supported; an invoice remains in `'PARTIAL'` status until `paid_amount >= grand_total`.

## 4. Pharmacy & FIFO Stock Rules
- **Rule BR-PHM-01:** Dispensing medicines must strictly decrement stock from the oldest non-expired batch first (FIFO).
- **Rule BR-PHM-02:** Physical stock balances cannot be manually updated via `UPDATE medicines SET quantity = x`. All stock adjustments must pass through `stock_adjustments` and generate a `DAMAGE` or `ADJUSTMENT` ledger row.

## 5. Bed, Ward & Cabin Rules
- **Rule BR-BED-01:** A bed or cabin cannot have two active allocations (`status = 'ACTIVE'`) simultaneously.
- **Rule BR-BED-02:** Changing a patient's bed creates an immutable historical record in `patient_transfers` and sets the previous bed to `CLEANING_REQUIRED`.

## 6. Diagnostic & Pathology Rules
- **Rule BR-LAB-01:** Phlebotomy specimen collection generates an immutable barcode record (`OH-LAB-XXXXXX`).
- **Rule BR-LAB-02:** Diagnostic reports cannot be printed by Reception or viewed by Patients until an authorized pathologist verifies and signs the electronic report (`diagnostic_report_verifications`).

## 7. Clinical Inpatient & Emergency Rules
- **Rule BR-EMG-01:** Unidentified trauma patients must be rapidly registered with `TEMP-EMG-` temporary codes and `is_temporary = true` without blocking lifesaving clinical care.
- **Rule BR-IPD-01:** Inpatient discharge is programmatically blocked without an explicit, non-empty final confirmed diagnosis.
- **Rule BR-CLIN-01:** Vital signs entries must satisfy physiological sanity bounds (Systolic BP $40-300\text{ mmHg}$, Temp $30-45^\circ\text{C}$).

