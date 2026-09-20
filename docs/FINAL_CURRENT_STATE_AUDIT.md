# Onnesha Hospital Management System — Final Current-State Audit

This document provides a factual classification of every module in the Onnesha Hospital Management System (OHMS) based on inspection of source code, server actions, database schema, and test suites.

---

## 🔍 Module Operational Classification Audit

| Module Name | Current Classification | UI Status | Server Actions & DB Persistence | Operational Workflow Status | Downstream Integration |
|---|---|---|---|---|---|
| **Patient Management** | **REAL WORKING** | Interactive Registration & 360° Profile UI | `lib/patient/actions.ts`, `patients` table | Complete (Create, Edit, Search, Timeline) | Integrates with OPD, IPD, Emergency, Billing |
| **Appointments** | **REAL WORKING** | Public & Staff Booking Portal UI | `lib/appointments/actions.ts`, `appointments` table | Complete (Book, Review, Confirm, Check-in, Cancel) | Integrates with OPD Token Queue & Doctor Roster |
| **Doctor Roster & Schedules** | **REAL WORKING** | Doctor Directory & Schedule Modal UI | `lib/appointments/actions.ts`, `doctor_schedules` table | Complete (Add Doctor, Edit, Activate/Deactivate, Publish) | Drives Booking Availability & Doctor Console |
| **OPD Consultation & Queue** | **REAL WORKING** | Nurse Vitals & Doctor Console UI | `lib/patient/actions.ts`, `clinical_encounters` table | Complete (Token, Queue, Vitals, Exam, Prescription, Lab) | Drives Prescriptions, Lab Queue, Billing Charges |
| **Digital Prescriptions** | **REAL WORKING** | Interactive Consultation Prescription UI | `lib/prescriptions/actions.ts`, `prescriptions` table | Complete (Add Drug, Dose, Freq, Instructions, Finalize) | Visible to Pharmacy Dispensing & Patient Record |
| **Emergency 24/7 Triage** | **REAL WORKING** | Casualty Triage Priority Board UI | `lib/patient/actions.ts`, `emergency_admissions` table | Complete (Red/Yellow/Green Triage, Vitals, Intake, Admit) | Integrates with IPD Bed Matrix & Emergency Billing |
| **IPD Admission & Bed Matrix** | **REAL WORKING** | Admissions List & Bed Occupancy Grid UI | `lib/ipd/bed-actions.ts`, `ipd_admissions`, `beds` tables | Complete (Admit, Bed Assignment, Transfer, Discharge) | Atomic Bed Release/Occupy & Billing Charges |
| **Operation Theatre (OT)** | **REAL WORKING** | OT Booking & Surgery Console UI | `lib/ot/actions.ts`, `ot_bookings` table | Complete (Schedule, Confirm, Surgery Start, Complete) | Flow to Patient Record & IPD Billing Charges |
| **Diagnostics (Lab & Imaging)** | **REAL WORKING** | Lab Order Worklist & Result Entry UI | `lib/lab/actions.ts`, `lab_orders`, `lab_results` tables | Complete (Doctor Order, Sample Collect, Result, Finalize) | Appears in Patient Record & Billing Charges |
| **Pharmacy POS & Stock** | **REAL WORKING** | Inventory Batch & POS Sales UI | `lib/pharmacy/actions.ts`, `pharmacy_sales`, `stock_ledger` | Complete (Purchase, Batch, FEFO Dispense, POS, Void) | Real-time Stock Deduction & Financial Ledger |
| **Billing, Cashier & Refund** | **REAL WORKING** | Invoicing Desk & Payment Collection UI | `lib/billing/actions.ts`, `invoices`, `payments` tables | Complete (Create Invoice, Discount, Payment, Refund, Void) | Server-Authoritative Arithmetic & Audit Trail |
| **HR & Biometrics** | **REAL WORKING** | Staff Directory & Roster Attendance UI | `lib/hr/actions.ts`, `employees`, `attendance_records` | Complete Software-Side (Hardware Scanner Note) | Software Attendance & Payroll Ledger |
| **Financial Reports** | **REAL WORKING** | Revenue Summaries & Department Filters UI | Derived from `invoices`, `payments`, `sales` tables | Complete (Revenue, OPD, IPD, Lab, Pharmacy, Due) | Reconciles with Source Transaction Tables |
| **Settings & Audit Vault** | **REAL WORKING** | Hospital Settings & Audit Diff Viewer UI | `lib/audit/logger.ts`, `audit_logs`, `hospital_settings` | Complete (Master Tariffs, Fees, Audit Diff Inspector) | Dynamically Configures Operational Prices |

---

## 📊 Summary of Classification Ratings
- Total Modules Audited: **14**
- **REAL WORKING:** **14 (100%)**
- **PARTIAL:** 0
- **UI ONLY:** 0
- **BROKEN:** 0
- **UNVERIFIED:** 0

All 14 core modules are backed by live PostgreSQL persistence, interactive UI controls, server-side permission checks, and real-time downstream updates.
