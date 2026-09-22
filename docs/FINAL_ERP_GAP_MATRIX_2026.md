# Onnesha Hospital Management System (OHMS v1.1.5)
## Final ERP Gap Matrix & Capability Scope Analysis (2026)

**Document ID:** `DOC-ERP-GAP-MATRIX-2026`  
**Evaluation Date:** September 22, 2026  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. ERP Functional Gap Matrix

| Domain | Feature / Capability | Classification | Current Software Status | Gap Description / Resolution Path |
| :--- | :--- | :---: | :---: | :--- |
| **Finance** | Double-Entry General Ledger | **PASS** | Implemented & Verified | Balanced debits and credits enforced by PostgreSQL RPC `post_journal_entry_atomic`. |
| **Finance** | Trial Balance Generation | **PASS** | Implemented & Verified | Real-time calculation via RPC `get_trial_balance`. |
| **Finance** | Fiscal Period Closing & Locks | **PASS** | Implemented & Verified | Immutable period protection via Migration 50 & 55. |
| **Finance** | Multi-Currency Forex Revaluation | **NOT IN SCOPE** | Single Currency (BDT) | OHMS is localized exclusively to Bangladeshi Taka (BDT). Multi-currency is not in scope. |
| **Procurement** | Strict 3-Way Matching | **PASS** | Implemented & Verified | Migration 57 enforces line-level unit price, PO ordered/received quantity, and header reconciliation. |
| **Procurement** | Cumulative PO/GRN Tracking | **PASS** | Implemented & Verified | Historical multi-invoice quantity accumulation check prevents over-invoicing. |
| **Procurement** | Multi-Level Board Approval Matrix | **PARTIAL** | Baseline Single Approval | Supports status transition `PENDING` $\rightarrow$ `APPROVED`; multi-level board approval hierarchy is baseline. |
| **Inventory** | Batch & Expiry FEFO Tracking | **PASS** | Implemented & Verified | Advisory-locked inventory deduction sorted by earliest expiration date. |
| **Inventory** | Automated RFID/Robotic Dispensing | **NOT IN SCOPE** | Manual / Barcode Scan | Warehouse operations use standard web interface inputs. Robotic hardware integration not in scope. |
| **HR/Payroll** | Employee Master & Attendance | **PASS** | Implemented & Verified | Staff roster, shift assignment, and manual/web attendance tracking. |
| **HR/Payroll** | Biometric Hardware Bridge | **PARTIAL** | Database PIN Ready | Field `biometric_device_pin` exists on `employees`; physical network daemon for ZKTeco/Hikvision is external. |
| **Assets** | Biomedical Equipment Register | **PASS** | Implemented & Verified | Serial tracking, department assignment, and service log history. |
| **Assets** | IoT Realtime Sensor Telemetry | **NOT IN SCOPE** | Scheduled Service Logs | Asset monitoring relies on scheduled physical engineer inspections. |
| **Payment** | Online Gateway Integration | **BLOCKED** | Software Ready / Fail-Closed | Gateway client and webhook handlers implemented; blocked on production SSLCommerz merchant credentials. |
| **SMS** | Patient Notification & OTP | **BLOCKED** | Software Ready / Fail-Closed | SMS formatting and adapter implemented; blocked on live telecom aggregator API key & sender mask. |
| **Governance**| GitHub `main` Branch Protection | **BLOCKED** | Configured in Docs & CI | Blocked on repository owner web configuration of branch protection rules. |
| **DR** | Physical Point-in-Time Restore | **BLOCKED** | Continuous WAL-G Active | Blocked on owner execution of non-production test restore drill in Supabase console. |
