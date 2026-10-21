# OHMS — PERMANENT ZERO-REGRESSION ENGINEERING CONSTITUTION
**Authority:** Synthetic Engineering Swarm (APEX Godmode v5.0)  
**Scope:** Universal Controlling Directive for Onnesha Hospital Management System  
**Permanent Baseline:** Enforced across all development, migrations, testing, and production edge releases.  

---

## MISSION
The objective is no longer to repeatedly fix individual bugs.  
The objective is to change the engineering architecture so that a defect caused by a future feature, migration, schema change, RPC change, permission change, or business-rule change is detected **BEFORE** production.  
Never claim that software can be mathematically guaranteed to have zero future defects.  
Instead enforce:  
**DEFECT PREVENTION + EARLY DETECTION + FAIL-CLOSED RELEASE + FAST RECOVERY.**

---

## CORE ENGINEERING RULES

### RULE 1 — NO MORE FEATURE-FIRST DEVELOPMENT
For every requested feature or bug fix follow:  
`REPRODUCE → ROOT CAUSE → BLAST RADIUS → CONTRACT MAP → TEST FIRST → IMPLEMENT → ISOLATED DATABASE → REAL WORKFLOW → SECURITY → FINANCIAL INVARIANTS → CI → PREVIEW → PRODUCTION → OBSERVABILITY`  
Do not use `patch → npm test → deploy` ever again.

### RULE 2 — FIVE TEST LEVELS MUST NEVER BE CONFUSED
Every test must declare one of:
- `L1_UNIT_INVARIANT`: Pure in-memory math, formulation, and state machine invariants (e.g. `tests/hospital-domain-invariants.test.mjs`).
- `L2_STATIC_CONTRACT`: AST, SQL migrations, column definitions, and RPC registries (e.g. `tests/database-schema-contracts.test.mjs`, `generated/rpc-registry.json`).
- `L3_REAL_DATABASE_INTEGRATION`: Live PostgREST, RLS, and Auth execution contracts (e.g. `tests/multi-tenant-security-matrix.test.mjs`).
- `L4_REAL_SYNTHETIC_WORKFLOW`: Full synthetic multi-role hospital journeys executed against isolated staging (e.g. `tests/live/hospital-workflow-e2e.live.test.mjs`).
- `L5_PRODUCTION_READ_ONLY`: Edge reachability, public probes, and read-only telemetry (e.g. `scripts/smoke_test.mjs`, `public/version.json`).

A lower level can NEVER certify a higher level.

### RULE 3 & 4 — REPLACE FAKE TRANSACTIONAL CANARIES & SYNTHETIC TEST TENANT
In-memory tests are classified as `hospital-domain-invariants.test.mjs`.  
Real multi-role journeys execute in `tests/live/hospital-workflow-e2e.live.test.mjs` against isolated staging using synthetic tenant `OHMS_AUTOMATED_CANARY_HOSPITAL` with `is_synthetic = true` and `test_run_id = UUID`.

### RULE 5 — FULL REAL HOSPITAL JOURNEY CANARY
Covers: Registration → OPD Queue → Prescription → IPD Ward Bed → IPD Cabin → Bed/Cabin Transfer → Mistake Cancel/Purge → Diagnostics/Lab → Billing → Finance Double-Entry → Expenses → Referral → Blood Bank → Pharmacy → Procurement → HR/Payroll.

### RULE 6 & 7 — DATABASE CONTRACT & COMPILER
Information schema, `pg_proc`, `pg_attribute`, `pg_constraint`, and application `.from(...)` / `.rpc(...)` calls are continuously reconciled before production release.

### RULE 8, 9, 10 — FORWARD-ONLY MIGRATION LIFECYCLE
Applied production migrations (001–240) are immutable. Fix issues with forward migrations only (241+). Use `EXPAND → BACKFILL → APPLICATION SWITCH → VERIFY → CONTRACT LATER`.

### RULE 11 & 12 — RPC REGISTRY & ZERO AMBIGUOUS OVERLOADS
Maintain `generated/rpc-registry.json`. All 9 critical hospital RPCs (`update_ipd_admission_atomic`, `update_waiting_queue_status_atomic`, `complete_ipd_discharge_atomic`, `collect_payment_atomic`, `record_hospital_expense_atomic`, `cancel_or_delete_ipd_admission_atomic`, `settle_referral_commissions_atomic`, `reverse_journal_entry_atomic`, `void_invoice_and_reverse_gl_atomic`) must maintain exactly ONE canonical signature. CI blocks unexpected overloads.

### RULE 13 & 14 — SECURITY DEFINER REDUCTION & PUBLIC HEALTH PROBE
Privileged `check_system_health_diagnostics` is revoked from `anon`. Edge/watchdog probes must invoke `public_health_probe()` (`SECURITY INVOKER`, returns only status/timestamp/service).

### RULE 15 — DEFAULT-DENY ACCESS MODEL
`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;`. Every future table or function must have explicit grant/revoke declarations.

### RULE 28 & 29 — HEALTH EVIDENCE STORE & EXPIRY
Component health must be computed from cryptographic evidence records in `generated/health-evidence.json`:
- Current SHA + <24h evidence: `PASS`
- 24h–72h: `STALE`
- >72h or missing: `NOT_RECENTLY_VERIFIED`
- New SHA or migration head mismatch: `INVALIDATED`

### RULE 44 — BLOOD BANK SAFETY
A genuinely transfused blood bag must NEVER become `AVAILABLE` again. State machine transitions are strictly forward-only: `AVAILABLE → RESERVED → ISSUED → TRANSFUSED / DISCARDED`.

---

## REQUIRED FINAL CERTIFICATION MATRIX
A full release requires:
- `GIT_MAIN_SHA == CI_SHA == BUILD_SHA == RUNTIME_SHA`
- `MIGRATION_HEAD` applied to remote Supabase
- `RPC_REGISTRY` verified with 0 critical overloads
- `ANON_SENSITIVE_RPC = 0`
- `100% GREEN TEST SUITES` (all 179+ test suites active pass)
- `STRICT HEALTH CHECK` (0 critical, 0 warnings)
