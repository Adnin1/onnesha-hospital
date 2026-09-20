# Onnesha Hospital Management System — Production User Acceptance (UAT) Checklist

This document provides a manual UAT verification checklist for hospital staff roles operating the system without developer or database intervention.

---

## 📋 Role-Based Staff UAT Checklist

### 1. Receptionist Role
- [x] Register new patient (`fullName`, `phone`, `gender`, `dob`, `bloodGroup`) -> Patient Code `P-YYYYMM-XXXXX` issued.
- [x] Search existing patient by phone number or code.
- [x] Book OPD appointment or create walk-in visit.
- [x] Generate token and print OPD ticket for patient.

### 2. Doctor Role
- [x] View current OPD queue and select next patient.
- [x] Record physiological vitals (BP, Pulse, Temp, SpO2, Weight) with sanity bounds enforcement.
- [x] Enter Chief Complaints, Examination Findings, and Diagnosis.
- [x] Add lab test orders (Hematology, Biochemistry, Radiology).
- [x] Compose Digital Prescription (Drug, Dose, Route, Frequency, Duration, Instructions).
- [x] Finalize consultation -> Prescription prints A4 format and populates Pharmacy queue.

### 3. Lab Technician Role
- [x] Open Lab Queue and locate doctor order.
- [x] Collect sample and assign barcode Sample ID.
- [x] Input test result values and reference intervals.
- [x] Finalize & Publish result -> Report updates Patient EMR and Doctor view.

### 4. Pharmacist Role
- [x] Enter medicine stock purchase, batch number, expiry date, and unit pricing.
- [x] Open prescription dispense queue or POS direct sale.
- [x] Select batch (FEFO rule automatically applied).
- [x] Deduct stock quantity and generate 80mm thermal sales receipt.

### 5. Ward Nurse Role
- [x] Intake emergency casualty patient or IPD admission.
- [x] Perform Triage priority ranking (RED / YELLOW / GREEN).
- [x] Assign available bed/cabin -> Bed Matrix updates status to `OCCUPIED`.
- [x] Perform bed transfer -> Atomically releases old bed and occupies new bed.
- [x] Execute discharge -> Bed status returns to `AVAILABLE/CLEANING`.

### 6. Cashier Role
- [x] Search invoice by patient code or invoice number.
- [x] Review itemized charges (OPD, Bed, Lab, Pharmacy, OT).
- [x] Apply authorized discount with reason.
- [x] Collect payment (Cash, Card, Mobile Banking) -> Due balance updates and receipt prints.

### 7. System Admin Role
- [x] Add new specialist doctor profile and assign department/room/fee.
- [x] Create and publish doctor schedule roster.
- [x] Configure hospital profile, test price list, bed tariffs, and discount policies.
- [x] Inspect Forensic Audit Log for Before/After diffs on all sensitive transactions.
