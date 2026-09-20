# Hospital Operational Workflow Specification

> [!IMPORTANT]
> **END-TO-END PATIENT LIFECYCLE:** This document defines the operational workflows and database state transitions across OPD, Emergency, IPD, Laboratory, Pharmacy, and Billing/Finance in Onnesha Hospital.

---

## 1. Outpatient Department (OPD) & Consultation Workflow

```
[Patient Registration / Search] 
            │
            ▼
[Appointment / Walk-in Booking] ──► (Generates Token in `token_counters` & `appointments`)
            │
            ▼
[Reception / Nurse Check-in] ──► (Status: WAITING)
            │
            ▼
[Queue Calling / Chamber Entrance] ──► (Status: IN_CHAMBER / IN_CONSULTATION)
            │
            ▼
[Doctor Consultation & Vitals] ──► (Records Vitals, Clinical Notes, Diagnosis)
            │
            ├───► [Digital Prescription] ──► (Saved to `prescriptions`)
            │
            └───► [Investigation Orders] ──► (Saved to `diagnostic_orders`)
                        │
                        ▼
            [Lab / Pharmacy / Billing]
```

---

## 2. Inpatient Department (IPD) & Bed Admission Workflow

```
[Emergency / OPD Referral] ──► [IPD Admission Request]
                                      │
                                      ▼
                        [Assign Ward / Bed / Cabin]
                        (Atomically changes Bed status: AVAILABLE ➔ OCCUPIED)
                                      │
                                      ▼
                        [Daily Clinical Rounds & Orders]
                                      │
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
            [Medication & Lab Orders]     [Bed Transfer / OT Procedure]
                        │                           │
                        └─────────────┬─────────────┘
                                      ▼
                        [Discharge Order & Summary]
                                      │
                                      ▼
                        [Final Invoice & Payment]
                        (Atomically releases Bed: OCCUPIED ➔ AVAILABLE)
```

---

## 3. Laboratory & Diagnostics Workflow

```
[Doctor Investigation Order] ──► [Lab Order Entry (PAID / PENDING)]
                                          │
                                          ▼
                             [Sample Collection (Specimen)]
                                          │
                                          ▼
                             [Laboratory Processing & Testing]
                                          │
                                          ▼
                             [Result Entry & Verification]
                                          │
                                          ▼
                             [Publish & Print Report]
```

---

## 4. Pharmacy & Inventory Workflow (FEFO Enforcement)

```
[Supplier Purchase / Stock Receipt] ──► (Creates Batch with Expiry Date & Stock Quantity)
                                              │
                                              ▼
                             [Doctor Prescription / POS Sale]
                                              │
                                              ▼
                             [FEFO Batch Selection & Stock Check]
                             (Rejects expired batches; prevents negative stock)
                                              │
                                              ▼
                             [Sale Completion & Receipt Print]
                             (Deducts quantity from `medicine_batches` & logs `stock_transactions`)
```
