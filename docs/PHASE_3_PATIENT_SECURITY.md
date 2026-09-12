# Phase 3: Patient Data Security & Row Level Security (RLS)

## 1. Security Architecture Principles

All patient health information (PHI) in OHMS is safeguarded by defense-in-depth security principles:
1. **Multi-Tenant Isolation**: No database query can span across organizations. Every query is filtered by PostgreSQL Row-Level Security (RLS) policies matching `organization_id = get_current_org_id()`.
2. **Granular RBAC Permission Checks**: Server actions and endpoints verify explicit permissions before executing mutations.
3. **Immutable Audit Vault**: Every creation, modification, discharge, and emergency override is written to the append-only `audit_logs` table.

---

## 2. Row Level Security on Phase 3 Clinical Tables

Migration `020_phase3_clinical_foundation.sql` establishes Row Level Security on all Phase 3 tables:

```sql
-- Pattern applied to all clinical tables:
ALTER TABLE patient_merge_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_patient_merge_requests ON patient_merge_requests
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_patient_allergies ON patient_allergies
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE clinical_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_clinical_alerts ON clinical_alerts
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE patient_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_patient_diagnoses ON patient_diagnoses
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_clinical_notes ON clinical_notes
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE patient_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_patient_transfers ON patient_transfers
  FOR ALL USING (organization_id = get_current_org_id());

ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_patient_consents ON patient_consents
  FOR ALL USING (organization_id = get_current_org_id());
```

---

## 3. Server-Side RBAC Permission Enforcement

The following permissions are strictly asserted in `lib/patient/actions.ts`:

| Action | Enforced Permission | Authorized Roles |
|:---|:---|:---|
| `registerPatientAction` | `patients.create` | Admin, Doctor, Receptionist, Nurse |
| `getPatient360Action` | `patients.view` | Admin, Doctor, Nurse, Medical Records Officer |
| `recordVitalsAction` | `patients.update` | Doctor, Nurse, Triage Officer |
| `createClinicalNoteAction` | `patients.update` | Doctor, Consultant, Nurse |
| `admitPatientIPDAction` | `ipd.admit` | Admin, Doctor, Admission Officer |
| `dischargePatientAction` | `ipd.discharge` | Primary Attending Consultant, Admin |
| `registerEmergencyEncounterAction` | `emergency.triage` | Emergency MO, Triage Nurse, Admin |

Attempts to bypass UI forms and call backend actions directly result in immediate termination with:
`403 Forbidden: Missing required permission [<permission_key>]`
and an intrusion notice logged in the system log.
