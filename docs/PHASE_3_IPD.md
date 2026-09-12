# Phase 3: Inpatient Department (IPD) Architecture

## 1. Clinical Overview
The Inpatient Department (IPD) manages bed admissions, ward/room allocation, intra-hospital transfers, daily clinical rounds, and structured discharge protocols.

---

## 2. Inpatient Admission Protocol

### 2.1 Admission Creation
When an OPD or Emergency patient requires acute inpatient care:
1. `patient_visits` entry created with `visit_type = 'IPD'`.
2. Initial bed allocated from `beds` inventory (`status = 'OCCUPIED'`).
3. Admitting primary consultant (`attending_doctor_id`) assigned.
4. Provisional admission diagnosis recorded.

### 2.2 Intra-Hospital Bed Transfers
When a patient transfers between wards (e.g., General Ward $\to$ ICU or Post-Operative Recovery $\to$ Cabin):
- `patient_transfers` record logged with:
  - `from_bed_id` $\to$ released back to `CLEANING_REQUIRED` / `AVAILABLE`.
  - `to_bed_id` $\to$ marked `OCCUPIED`.
  - `transfer_reason`: Clinical deterioration, step-down, patient request.
  - Authorized medical officer approval.

---

## 3. Mandatory Discharge Protocol

To safeguard against premature or undocumented patient departures, OHMS enforces strict clinical prerequisites before a discharge order can be finalized:

1. **Mandatory Final Diagnosis**:
   - The primary attending consultant MUST record a verified final diagnosis.
   - Discharge is programmatically blocked if final diagnosis is absent:
     ```typescript
     if (!params.finalDiagnosis || params.finalDiagnosis.trim().length === 0) {
       return { success: false, error: "Final diagnosis is mandatory for patient discharge." };
     }
     ```
2. **Discharge Disposition Types**:
   - `RECOVERED` / `IMPROVED`: Routine completion of inpatient treatment.
   - `REFERRED`: Transferred to specialized tertiary center.
   - `DOR` (Discharged on Request): Patient/family chose early discharge.
   - `LAMA` (Left Against Medical Advice): Patient departed without clinical clearance; requires signed documentation.
   - `DECEASED`: Mortality protocol with death certificate reference.
3. **Structured Discharge Summary**:
   - Brief hospital course, surgical procedures performed, condition on discharge.
   - Discharge medications with dosage, frequency, and instructions in Bengali/English.
   - Follow-up date and emergency warning signs.
