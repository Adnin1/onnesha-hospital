# OHMS ACTIVE HEALTH TEST ENGINE V1 — INVARIANT CONTRACT SPECIFICATION
# ZERO-FAKE-GREEN / FAIL-CLOSED AUTHORITATIVE HEALTH DIRECTIVES

## Document Overview
This document formalizes the non-negotiable architectural invariants governing the Onnesha Hospital Management System (OHMS ERP) Active Health Test Engine. Under no circumstances may code, tests, CI pipelines, or AI assistants relax these rules for cosmetic, presentation, or reporting convenience.

---

## 1. Core Invariants (HEALTH-001 through HEALTH-008)

### `HEALTH-001: Absolute 100% Health Standard`
A health score of exactly **100** and status **`HEALTHY`** may be emitted **ONLY IF**:
1. `required_check_count > 0`
2. `required_executed_count == required_check_count`
3. `required_pass_count == required_check_count`
4. `required_fail_count == 0`
5. `required_unknown_count == 0`
6. `required_skipped_count == 0`
7. `required_blocked_count == 0`
8. `monitor_error_count == 0`
9. `unresolved_incident_count == 0` (Zero open or acknowledged critical/warning incidents)
10. `latest_authoritative_check_is_fresh == TRUE`

If ANY condition is violated:
$$\text{health\_score} < 100 \quad \text{and} \quad \text{status} \neq \text{HEALTHY}$$

---

### `HEALTH-002: Non-Pass Semantics Law`
The following operational states MUST NEVER be evaluated, mapped, or interpreted as `PASS` or `HEALTHY`:
```text
UNKNOWN            != PASS
SKIPPED            != PASS
NOT_RUN            != PASS
UNAUTHORIZED       != PASS
AUDIT_UNAUTHORIZED != PASS
CONFIGURATION_ERROR!= PASS
MONITOR_ERROR      != PASS
EXCEPTION          != PASS
STALE              != PASS
BLOCKED            != PASS
BLOCKED_EXTERNAL_OWNER      != PASS
BLOCKED_PLATFORM_CAPABILITY != PASS
PARTIAL            != PASS
```
Any check producing these states reduces the score below 100.

---

### `HEALTH-003: Authoritative Server-Side Calculation (No Caller Overrides)`
Neither Antigravity, browser client, GitHub workflow, administrator UI, nor arbitrary API caller may declare:
```text
health_score = 100
status = HEALTHY
active_issues = 0
```
- Health scores and statuses MUST be derived exclusively by the authoritative database engine (`public.run_authoritative_system_health_check(p_org_id)`).
- The caller supplies organization context ONLY.
- Telemetry supplied by unverified callers is strictly quarantined as untrusted.

---

### `HEALTH-004: Public Edge vs ERP Domain Separation`
- **`PUBLIC_EDGE_WATCHDOG`**: Measures HTTP 200 edge availability, SSL termination, and fail-closed public PostgREST API security. Its success verdict is strictly **`PUBLIC_EDGE_HEALTHY`**.
- **`PRIVILEGED_ERP_MONITOR`**: Measures deep PostgreSQL database invariants (General Ledger double-entry, bed occupancy, referral overpayments, invoice balances, unlinked expenses).
- Under NO circumstance may a `PUBLIC_EDGE_HEALTHY` result be reported as or imply `FULL_INTERNAL_ERP_HEALTHY` or full-system 100% compliance.
- When privileged credentials (`SUPABASE_SECRET_KEY`) are absent, the internal ERP domain MUST be explicitly classified as `NOT_VERIFIED` or `BLOCKED_EXTERNAL_OWNER (Gate G10)`.

---

### `HEALTH-005: Snapshot Freshness & Expiration (Stale Guard)`
A healthy verdict is ephemeral and must expire if continuous monitoring is interrupted:
- Authoritative health snapshots are valid for a maximum freshness window (`p_max_age_seconds`, default 900 seconds / 15 minutes).
- Once the age exceeds this threshold:
$$\text{is\_stale} = \text{true} \implies \text{status} = \text{STALE}, \quad \text{score} = 0$$
- A healthy result from a previous run or yesterday never guarantees health today.

---

### `HEALTH-006: Open Incident Gate & Warning Invariant`
1. **Zero Open Incidents Required:**
   Before returning 100, the database engine audits `public.system_health_issues_log`. If any incident has:
   $$\text{is\_resolved} = \text{false} \quad \text{and} \quad \text{lifecycle\_status} \in (\text{'OPEN'}, \text{'ACKNOWLEDGED'})$$
   the health score CANNOT be 100.
2. **Warning Score Ceiling:**
   $$\text{warning\_count} > 0 \implies \text{health\_score} \le 99, \quad \text{status} = \text{DEGRADED}$$
   Even a single active warning prevents 100% `HEALTHY`.
3. **Critical Score Ceiling:**
   $$\text{critical\_count} > 0 \implies \text{health\_score} \le 70, \quad \text{status} = \text{CRITICAL}$$

---

### `HEALTH-007: Manual Action Invariant (Verification-First Recovery)`
No user interface button (e.g., "Resolve", "Mark OK", "Dismiss") may directly reset the system health score to 100:
- An administrative action transitions an incident to `ACKNOWLEDGED`.
- An incident transitions to `RESOLVED_VERIFIED` ONLY after:
  1. The underlying source code or data anomaly is remediated.
  2. The exact reproducer is re-executed and passes.
  3. The affected domain diagnostic re-runs and returns `PASS`.
  4. The complete authoritative system health audit passes.

---

### `HEALTH-008: AI & Report Citation Mandate`
Antigravity and automated reports MUST NOT independently fabricate system health status. All final closure reports must quote the exact verdict from the authoritative engine:
```text
Authoritative Engine Verdict: <database value>
Authoritative Engine Score:   <database value>/100
Authoritative Snapshot ID:   <snapshot UUID>
Evidence Hash:               <md5 hash>
```
If the database engine returns `NOT_FULLY_VERIFIED`, reports must faithfully print `NOT_FULLY_VERIFIED`.

---

## 2. Invariant Score Ceiling Matrix

| Active Condition | Maximum Allowed Score | Permitted Status |
| :--- | :---: | :--- |
| **All Required Checks Pass + 0 Incidents + Fresh** | **100** | `HEALTHY` |
| **1 or more WARNINGS detected** | **99** | `DEGRADED` |
| **1 or more CRITICAL defects detected** | **70** | `CRITICAL` / `DEFECT_DETECTED` |
| **Required Check SKIPPED / NOT_RUN** | **90** | `NOT_FULLY_VERIFIED` |
| **Required Check UNKNOWN** | **90** | `UNKNOWN` |
| **Snapshot Expired (> 15 mins)** | **0** | `STALE` |
| **Health Engine Threw Exception** | **0** | `MONITOR_ERROR` |
| **Unprivileged / Anonymous Caller** | **0** | `AUDIT_UNAUTHORIZED` |
| **Public Edge Reachable, ERP Unverified** | **N/A (Watchdog)** | `PUBLIC_EDGE_HEALTHY (ERP: NOT_VERIFIED)` |
