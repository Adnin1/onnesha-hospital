# Phase 3: Outpatient Department (OPD) Architecture

## 1. Clinical Overview
The Outpatient Department (OPD) module coordinates the arrival, vitals screening, consultation queuing, and clinical documentation for non-admitted ambulatory patients.

---

## 2. Visit Lifecycle & State Transitions

OPD visits transition through distinct clinical states:
```
[SCHEDULED / REGISTERED] 
       │
       ▼
   [ARRIVED] ─── (Vitals Recording by Triage Nurse)
       │
       ▼
  [IN_CONSULT] ── (Doctor Examination, Diagnosis & Notes)
       │
       ▼
  [COMPLETED] ── (Prescription Generation, Billing & Follow-up)
```

### 2.1 State Rules
- **ARRIVED**: Patient is physically present in the clinic waiting area; triage queue activates.
- **IN_CONSULT**: Doctor opens the consultation room chart; timestamp recorded.
- **COMPLETED**: Doctor records clinical findings, diagnoses, and completes encounter.

---

## 3. Physiological Vitals Sanity Bounds
To prevent erroneous vitals entries that could lead to clinical misdiagnoses or adverse medication dosing, OHMS enforces strict physiological bounds on data input:

| Parameter | Unit | Allowed Minimum | Allowed Maximum | Default Status Alert |
|:---|:---:|:---:|:---:|:---:|
| Systolic Blood Pressure | mmHg | 40 | 300 | $> 140$ (Stage 2 HTN) / $< 90$ (Hypotension) |
| Diastolic Blood Pressure | mmHg | 30 | 200 | $> 90$ (HTN) / $< 60$ (Hypotension) |
| Heart Rate / Pulse | bpm | 20 | 260 | $> 100$ (Tachycardia) / $< 60$ (Bradycardia) |
| Respiratory Rate | breaths/min | 6 | 70 | $> 20$ (Tachypnea) / $< 12$ (Bradypnea) |
| Body Temperature | °C | 30.0 | 45.0 | $> 37.8$ (Fever) / $< 35.0$ (Hypothermia) |
| Oxygen Saturation ($SpO_2$) | % | 40 | 100 | $< 92$ (Hypoxia Warning) |
| Blood Glucose (Random) | mmol/L | 1.0 | 45.0 | $> 11.1$ (Hyperglycemia) / $< 4.0$ (Hypoglycemia) |

---

## 4. Clinical Notes & Diagnostic Documentation
- **Clinical Notes Structure**:
  - `CHIEF_COMPLAINT`: Patient primary complaint and duration.
  - `HISTORY_OF_PRESENT_ILLNESS`: Detailed chronological progression.
  - `EXAMINATION_FINDINGS`: Physical signs (auscultation, palpation, inspection).
  - `PLAN_AND_ADVICE`: Management plan, dietary restrictions, and follow-up timeline.
- **Diagnosis Classification**:
  - Supports ICD-10 codification alongside free-text clinical descriptions.
  - Categorization: `PRIMARY`, `SECONDARY`, `PROVISIONAL`, `DIFFERENTIAL`.
