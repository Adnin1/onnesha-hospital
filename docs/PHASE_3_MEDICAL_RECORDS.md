# Phase 3: Patient 360° Electronic Medical Records (EMR)

## 1. Overview
The Patient 360° EMR is a consolidated, chronological, single-pane view of all clinical, diagnostic, and administrative interactions a patient has had across all hospital departments (OPD, IPD, Emergency, Surgery, Lab, Pharmacy, and Billing).

---

## 2. Architecture of the 360° Timeline

The timeline aggregates data from diverse tables into a unified chronological sequence:

```typescript
export interface TimelineEvent {
  id: string;
  timestamp: string;
  eventType: 
    | "REGISTRATION" 
    | "VISIT_CREATED" 
    | "VITALS_RECORDED" 
    | "DIAGNOSIS_ADDED" 
    | "CLINICAL_NOTE" 
    | "ALLERGY_LOGGED" 
    | "ALERT_CREATED" 
    | "TRANSFER" 
    | "DISCHARGE_SUMMARY" 
    | "DOCUMENT_UPLOADED";
  title: string;
  description: string;
  actorName?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  metadata?: Record<string, unknown>;
}
```

### 2.1 Aggregated Data Streams
1. **Patient Registration**: Initial enrollment timestamp, branch, and registering officer.
2. **Clinical Visits**: OPD check-ins, IPD admissions, and Emergency casualty presentations.
3. **Vital Signs**: Historical trend logs with blood pressure, heart rate, temperature, and $SpO_2$.
4. **Allergies & High-Risk Alerts**: Drug allergies, latex sensitivity, bleeding diathesis, fall risk, resuscitation status (DNR).
5. **Diagnoses**: ICD-10 coded and free-text provisional and confirmed medical conditions.
6. **Clinical Notes**: Doctors' progress notes, nursing shift logs, OT surgical notes.
7. **Discharge Summaries**: Attending consultant sign-off summaries.

---

## 3. Official Printable Medical Record Layout
The Patient 360 view includes standardized print stylesheets (`@media print`):
- Features `HospitalPrintHeader` with official hospital logo, tenant name, phone, address, and document title.
- Suppresses web UI elements (`no-print` on sidebar, action buttons, tab bars).
- Formats patient demographics in a structured clinical header block suitable for medicolegal documentation and external specialist referral.
- Footed with page numbering and date-time stamp generated via BDT timezone.
