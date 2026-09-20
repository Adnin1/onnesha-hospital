# Onnesha Hospital Management System — Daily Operational Staff Runbook

This guide details how real hospital staff operate the Onnesha Hospital Management System in daily clinical and administrative workflows without developer intervention.

---

## 👩‍💼 1. Receptionist Workflow
1. **Patient Registration:**
   - Navigate to `/app/patients`.
   - Click **"Add Patient"**.
   - Fill in full name, mobile number (11-digit BD format `01xxxxxxxxx`), gender, DOB, and blood group.
   - Click **"Save"**. System assigns atomic identifier `P-YYYYMM-XXXXX`.
2. **Appointment & Walk-in Queue:**
   - Search patient by phone or code.
   - Click **"Start Visit"** or **"Create Appointment"**.
   - Select doctor and time slot. Click **"Generate Token"**.
   - Issue printed OPD ticket to patient.

---

## 🩺 2. Doctor Consultation Workflow
1. Navigate to `/app/opd`.
2. Open patient from current queue.
3. Click **"Start Consultation"**.
4. Record vitals (BP, Pulse, Temp, SpO2, Weight), Chief Complaints, Examination, and Diagnosis.
5. Add lab test orders or imaging orders if required.
6. Click **"Add Medication"** to write Digital Prescription.
7. Click **"Finalize Consultation"**.
   - Prescription becomes printable (A4).
   - Lab orders populate Lab Queue automatically.
   - Prescription populates Pharmacy Dispense Queue.

---

## 🔬 3. Lab Technician Workflow
1. Navigate to `/app/lab`.
2. Select pending order created by doctor.
3. Click **"Collect Sample"** and enter Sample ID barcode.
4. Input test results and reference ranges.
5. Click **"Finalize & Publish"**.
   - Report becomes printable with digital signature.
   - Doctor and Patient 360° EMR update automatically.

---

## 💊 4. Pharmacist & POS Workflow
1. **Stock Entry:**
   - Navigate to `/app/pharmacy`.
   - Add purchase invoice, batch number, expiry date, and unit prices.
2. **Dispensing & Sale:**
   - Open prescription or walk-in POS.
   - Select medicine and batch (FEFO rule automatically applied).
   - System checks stock quantity and prevents negative stock.
   - Click **"Complete Sale"**. Stock decreases in real-time. Print 80mm thermal receipt.

---

## 🏥 5. IPD Admission & Nurse Workflow
1. Navigate to `/app/ipd` or `/app/patients`.
2. Click **"Admit Patient"**.
3. Select Ward, Doctor, and Bed/Cabin.
4. Bed status in Bed Matrix (`/app/beds`) atomically changes from `AVAILABLE` to `OCCUPIED`.
5. For bed transfer: select new bed. System atomically releases old bed and occupies new bed.
6. Upon discharge: click **"Discharge Patient"**. Bed returns to `AVAILABLE/CLEANING`.

---

## 💳 6. Cashier Billing Workflow
1. Navigate to `/app/billing`.
2. Search patient or invoice number.
3. System automatically calculates charges (OPD fee, bed charge, lab test, pharmacy sale, OT charge).
4. Apply authorized discount if eligible.
5. Select payment method (Cash, Card, bKash, Nagad).
6. Click **"Collect Payment"**. Receipt prints automatically and due balance updates.

---

## ⚙️ 7. System Admin Master Data Workflow
1. Navigate to `/app/doctors` to add doctors or publish rosters.
2. Navigate to `/app/settings` to update hospital profile, test price lists, bed tariffs, and receipt headers.
3. Navigate to `/app/settings` -> Audit Logs to view forensic Before/After diffs for all system changes.
