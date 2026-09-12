# Phase 3: Emergency Department & Rapid Casualty Triage

## 1. Overview
The Emergency Department module handles critical acute presentations where immediate stabilization takes precedence over standard administrative intake. It provides rapid casualty registration, three-tier color-coded triage, and instant conversion of unidentified trauma patients into tracked medical charts.

---

## 2. Emergency Triage Classification System

OHMS implements a simplified, high-efficiency three-tier triage system optimized for rapid frontline casualty assessment:

| Triage Tier | Color Code | Target Response Time | Clinical Criteria | Example Presentations |
|:---|:---:|:---:|:---|:---|
| **RED** | `Immediate / Resus` | $< 2$ minutes | Life-threatening hemodynamic instability or airway compromise | Cardiac arrest, severe polytrauma, massive hemorrhage, anaphylaxis |
| **YELLOW** | `Urgent` | $< 15$ minutes | Severe illness/injury with potential for rapid decompensation | Acute chest pain, moderate asthma flare, open fractures, acute abdomen |
| **GREEN** | `Non-Urgent / Walking` | $< 60$ minutes | Clinically stable; minor trauma or ambulatory illness | Minor lacerations, sprains, localized rash, low-grade pyrexia |

---

## 3. Temporary / Unidentified Patient Workflow

In mass casualty incidents, road traffic accidents (RTAs), or when unconscious patients arrive without relatives:

1. **Zero-Friction Intake**:
   - Patient ID and phone are not immediately required.
   - The system automatically generates a temporary code: `TEMP-EMG-YYYYMMDD-XXXX`.
   - The patient is flagged as `is_temporary: true` with gender and approximate age estimated by the triage officer.
2. **Clinical Treatment Unblocked**:
   - Vitals, emergency meds, blood groupings, and trauma imaging can be logged immediately under the temporary identifier.
3. **Identity Resolution**:
   - Once family members arrive or biometric/NID identity is established, the Medical Records Officer executes a single-step patient merge or profile upgrade to assign an enterprise `P-YYYYMM-XXXXX` identifier without losing historical trauma records.
