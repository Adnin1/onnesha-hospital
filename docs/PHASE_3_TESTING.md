# Phase 3: Clinical & Security Testing Suite

## 1. Overview
The Onnesha Hospital Management System testing framework consists of 38 automated test scenarios:
- **Phase 2 Security Suite**: 20 test cases verifying route guards, tenant isolation, RLS rules, permission assertions, and file storage security.
- **Phase 3 Clinical Suite**: 18 test cases validating phone normalization, duplicate detection scoring, migration schema RLS, sequence generators, vitals sanity checks, discharge preconditions, and emergency temporary workflows.

---

## 2. Test Execution Command
```bash
npm test
```
The test runner utilizes Node.js native test runner (`node --test tests/**/*.test.mjs`).

---

## 3. Test Cases Breakdown

### 3.1 Phase 3 Clinical Suite (18 Scenarios)
1. **normalizeBDPhone canonicalization**: Verifies `+880`, `880`, hyphens, and leading zero handling.
2. **isValidNormalizedBDPhone validation**: Validates genuine BD mobile operator prefixes (`013` through `019`) and rejects invalid lengths and non-BD prefixes (`012`).
3. **formatBDPhoneDisplay**: Formats standard `01XXX-XXXXXX` display masks.
4. **calculateNameSimilarity**: Validates Dice bigram overlap computations against identical, partial, and distinct names.
5. **lib/patient/phone.ts implementation**: Confirms regular expressions and logic in source files.
6. **lib/patient/duplicate-detection.ts matrix**: Asserts high-confidence NID and phone+name similarity conditions.
7. **Family member phone sharing**: Verifies medium-confidence threshold for shared household phones.
8. **Migration 020 RLS policies**: Confirms Row Level Security on all 7 Phase 3 clinical tables.
9. **Atomic sequence generators**: Asserts presence of `generate_patient_code` and `generate_visit_number`.
10. **registerPatientAction permission**: Asserts `patients.create` authorization check.
11. **getPatient360Action permission**: Asserts `patients.view` authorization check.
12. **Vitals sanity bounds**: Tests systolic BP ($40 - 300$) and temperature ($30 - 45^\circ\text{C}$) limits.
13. **Mandatory discharge diagnosis**: Verifies discharge blocked if diagnosis string is missing.
14. **Emergency temporary encounter**: Tests `TEMP-EMG-` generation and `is_temporary: true` flag.
15. **Static export compatibility**: Checks `generateStaticParams()` on `[id]` route.
16. **Official printable header**: Asserts presence of `HospitalPrintHeader` in Patient 360 page.
17. **Rapid emergency triage**: Verifies RED, YELLOW, GREEN zone registration in Emergency console.
18. **OPD consultation console**: Verifies vitals entry and clinical note creation linkage.

### 3.2 Phase 2 Security Suite (20 Scenarios)
- 20/20 scenarios passing cleanly, verifying multi-tenant isolation, RBAC matrices, and protection of private routes.
