# Functional HMS Gap Audit & Operational Classification

> [!IMPORTANT]
> **OPERATIONAL GAP AUDIT:** This document presents a functional gap analysis of the Onnesha Hospital Management System. Each module is evaluated against real database persistence, CRUD standards, state transitions, and hospital operational workflows.

---

## 1. Module Functional Status Matrix

| Module / Entity | Operational Status | Classification | Gap Analysis & Operational Remediation |
| :--- | :--- | :--- | :--- |
| **Patient Management** | Functional | **A. Fully functional** | Supports `patients` table CRUD, deterministic `P-YYYYMM-XXXXX` numbering, duplicate phone/NID checks, and 360° clinical timeline. |
| **Appointments & Booking** | Functional | **A. Fully functional** | Public + Staff booking connected to `appointments` table. Status transitions: `BOOKED` → `WAITING` → `IN_CHAMBER` → `COMPLETED` → `CANCELLED`. |
| **Doctor Roster & Schedules** | Functional | **A. Fully functional** | `doctor_schedules` table with `DRAFT` and `PUBLISHED` states. Slot duration, max patient limits, and off-day management. |
| **OPD Token & Queue Board** | Functional | **A. Fully functional** | `token_counters` and `waiting_queue` tables. Sequence generation, call next patient, status transitions (`WAITING`, `CALLED`, `IN_CONSULTATION`, `COMPLETED`, `SKIPPED`). |
| **OPD Consultation & Vitals** | Functional | **A. Fully functional** | Clinical encounter recording, vitals physiological sanity bounds, chief complaint, examination notes, and investigation orders. |
| **Digital Prescriptions** | Functional | **A. Fully functional** | `prescriptions` and `prescription_items` tables. Dosage, frequency, duration, instructions, and pharmacy dispensing integration. |
| **Emergency 24/7 Triage** | Functional | **A. Fully functional** | Emergency intake with `RED`, `YELLOW`, `GREEN` priority triage, unknown patient intake, vitals, observation, and emergency admission. |
| **IPD Admission & Bed Matrix** | Functional | **A. Fully functional** | `beds` and `patient_visits` tables. Atomic bed allocation (`AVAILABLE` → `OCCUPIED` → `RELEASED`), bed transfers, daily rounds, and discharge summaries. |
| **Operation Theatre (OT)** | Functional | **A. Fully functional** | OT scheduling, surgeon/anesthetist assignment, pre-op/post-op status tracking, and procedure billing charges. |
| **Laboratory & Pathology** | Functional | **A. Fully functional** | `diagnostic_orders`, `sample_collections`, `diagnostic_results`. Workflow: Order → Sample Collection → Processing → Result Entry → Validation → Report Publish. |
| **Pharmacy POS & Stock Ledger** | Functional | **A. Fully functional** | `medicines`, `medicine_batches`, `stock_transactions`. FEFO batch selection, expiry check, zero negative stock enforcement, POS sales, and receipt printing. |
| **Billing Engine & Payments** | Functional | **A. Fully functional** | `invoices`, `invoice_items`, `payments`, `refunds`. Server-calculated subtotals, discounts with authorization thresholds, refunds, and void audits. |
| **HR & Employee Roster** | Functional | **A. Fully functional** | `profiles`, `user_roles`, `departments`. Staff master, role assignments, department transfers, and attendance records. |
| **Biometric Attendance** | Architecture Ready | **EXTERNAL CONFIG REQUIRED** | Software architecture ready for biometric device bridge; marked as requiring hardware bridge connection. |
| **Reports & Analytics** | Functional | **A. Fully functional** | Patient, OPD, IPD census, bed occupancy, pharmacy sales, lab volume, billing, collection, and due reports derived from live DB. |
| **System Settings** | Functional | **A. Fully functional** | Hospital metadata, department management, fee tariffs, discount policies, and notification configurations. |
| **PostgreSQL Audit Vault** | Functional | **A. Fully functional** | `audit_logs` table recording actor, entity, operation, timestamp, and forensic before/after state diffs. |

---

## 2. Operational Workflow Summary

All 17 primary hospital operational modules persist to the same Supabase PostgreSQL database (`https://iuhtzahuszdkdarhxobx.supabase.co`) with Row Level Security (RLS) enforcement and RBAC permission guards.
