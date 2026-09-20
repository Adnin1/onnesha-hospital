# Hospital Staff Operational Manual

> [!IMPORTANT]
> **STAFF OPERATIONAL ROLES:** This manual outlines the exact step-by-step responsibilities and workflows for hospital staff roles using the Onnesha Hospital Management System.

---

## 1. Receptionist & Registration Staff
- **Patient Intake:** Search for existing patient by phone number or full name. If not found, register new patient to generate `P-YYYYMM-XXXXX` identifier.
- **Appointment Booking:** Select doctor, appointment date, and department. System automatically checks doctor schedule and generates sequential token (`OPD-XXX`).
- **Check-in & Queue:** Mark arrived patients as `WAITING` on the digital queue board.

---

## 2. Doctors & Clinical Staff
- **Consultation Console:** View today's queue (`/app/opd`). Select patient to initiate encounter (`IN_CONSULTATION`).
- **Vitals & Notes:** Record physiological vitals (BP, Heart Rate, Temperature, SpO2, Weight) and clinical examination notes.
- **Digital Prescription:** Add medications (dosage, frequency, duration, instructions) and click **Finalize Prescription**.
- **Investigation Orders:** Order lab tests or imaging (X-Ray, USG, ECG) directly linked to the patient visit.

---

## 3. Laboratory & Pathology Technicians
- **Sample Collection:** View pending lab orders (`/app/lab`). Record sample collection time and barcode.
- **Result Entry:** Input test result values according to standard reference ranges.
- **Verification & Publish:** Pathologist validates result entries and publishes the final printable report.

---

## 4. Pharmacists & Dispensing Staff
- **Prescription Dispensing:** View finalized prescriptions (`/app/pharmacy`).
- **FEFO Batch Selection:** System highlights batches by nearest expiry date. Select valid non-expired batch.
- **POS Sale & Receipt:** System calculates total price, deducts stock from `medicine_batches`, records `stock_transactions`, and prints 80mm POS receipt.

---

## 5. Cashiers & Billing Staff
- **Invoice Generation:** View items linked to patient visit (consultation, lab orders, pharmacy, bed charges).
- **Payment Collection:** Collect payment via Cash, Card, bKash, Nagad, or SSLCommerz.
- **Discount & Voiding:** Apply discounts according to authorized policy limits. Voids require supervisory audit reason.

---

## 6. Nurses & IPD Ward Managers
- **Triage Intake:** Record emergency arrival triage level (`RED`, `YELLOW`, `GREEN`).
- **Bed & Cabin Allocation:** Select available bed from bed matrix (`/app/beds`). System updates bed state to `OCCUPIED`.
- **Bed Transfers & Discharge:** Execute bed transfer or initiate discharge workflow to release bed (`AVAILABLE`).
