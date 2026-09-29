# Onnesha Hospital Management System (OHMS) — Final Operational Commissioning Status

**Document Version:** `v1.1.19-OPERATIONAL-GATES`  
**Execution Timestamp:** `2026-09-30T03:45:00+06:00`  
**Authoritative Host:** `https://onnesha-hospital.pages.dev`  
**Current Governance State:** `SOFTWARE COMPLETE — 14 OWNER GATES PENDING PHYSICAL ACTION`  

---

## 1. Separation of Concerns Directive

Under the **Autonomous Engineering Swarm Constitution**, zero false greens are permitted:
> **`Software Complete ≠ Hospital Operationally Ready`**

Every software line, database migration, automated test, build export, and live security smoke layer is **100% Code-Complete and Certified Green**.  
The following 14 items require external physical hardware, bank merchant onboarding, staff training, or legal regulatory documentation that cannot be simulated or fabricated.

---

## 2. 14 Itemized Owner Gate Register

| Gate ID | Area / Gate Description | Responsible Owner | Status | Required Real-World Evidence | Blocking Scope |
|:---|:---|:---|:---:|:---|:---|
| **OWNER_GATE_01** | Real Hospital Contact & Identity | Hospital Management | `PENDING` | Real reception phone, emergency hotline, ambulance mobile, and official email verified via test calls. | Public Contact & Emergency Dispatch |
| **OWNER_GATE_02** | Real Doctor Roster & Chamber Schedules | Medical Director | `PENDING` | Approved specialist list with real consultation fees, room assignments, and practicing weekdays. | Real OPD Token Allocation |
| **OWNER_GATE_03** | BMDC Doctor Credential Verification | Hospital HR / Admin | `PENDING` | Independent BMDC registration verification records archived in administrative files. | Clinical Practice Governance |
| **OWNER_GATE_04** | Final Approved Diagnostic Tariffs | Finance & Billing Head | `PENDING` | Signed diagnostic investigation price schedule with effective date (currently `INDICATIVE_REFERENCE`). | Formal Diagnostic Invoicing |
| **OWNER_GATE_05** | Isolated Staging Credentials | DevOps / IT Admin | `PENDING` | `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` added to GitHub Action Secrets. | Automated GitHub CI Live Security Gate |
| **OWNER_GATE_06** | Live bKash & Nagad Merchant Credentials | Hospital Owner / Bank | `PENDING` | Production AppKey, AppSecret, Username, Password, and Private Key from merchant onboarding. | Live Mobile Financial Online Payments |
| **OWNER_GATE_07** | SSLCommerz Production Store Keys | Hospital Owner / Bank | `PENDING` | Production `STORE_ID` and `STORE_PASSWD` from SSLCommerz merchant activation. | Live Card/NetBanking Gateway |
| **OWNER_GATE_08** | SMS & WhatsApp Provider Activation | IT Admin / Telecom | `PENDING` | Production SSL Wireless/Greenweb SMS API Key and Meta WhatsApp Cloud API credentials configured. | Real-Time Patient SMS/WhatsApp Delivery |
| **OWNER_GATE_09** | Physical Thermal Printer & USB Scanner | IT Technician | `PENDING` | 80mm POS thermal receipt printer and USB barcode scanner connected to reception/cashier workstations. | Physical Hardcopy Serial & Slip Printing |
| **OWNER_GATE_10** | Hospital Staff Training & End-to-End UAT | Department Supervisors | `PENDING` | Receptionists, nurses, cashiers, and lab technicians complete supervised patient journey simulation. | Day-to-Day Clinical Operations |
| **OWNER_GATE_11** | Database Disaster Recovery Drill | Lead DBA / SRE | `PENDING` | Point-in-Time-Recovery (PITR) restore drill executed on a staging database with verified RTO/RPO metrics. | Database Outage Recovery |
| **OWNER_GATE_12** | Storage Object Independent DR Sync | Lead DBA / SRE | `PENDING` | S3 dual-track backup script scheduled to sync `medical-documents-vault` bucket to offline storage. | Inpatient Diagnostic Scan Archival |
| **OWNER_GATE_13** | Supabase Production Dashboard Operations | Cloud Admin | `PENDING` | Review Security Advisor, confirm 0 critical alerts, enforce SSL, and configure production SMTP. | Platform Operational Hardening |
| **OWNER_GATE_14** | DGHS Licensing & Regulatory Sign-Off | Hospital Board / Legal | `PENDING` | Directorate General of Health Services (DGHS) clinic/hospital operating license number recorded. | Legal Commercial Hospital Launch |

---

## 3. Deferred Future Workstreams

1. **Custom Apex Domain (`https://onneshahospital.com`):**
   - **Status:** `DEFERRED`
   - **Rationale:** The canonical production host is locked at `https://onnesha-hospital.pages.dev`. Activating a custom apex domain requires DNS delegation and Cloudflare Universal SSL validation by the domain owner.
2. **Direct Lab Analyzer / LIS Middleware (HL7 / ASTM):**
   - **Status:** `DEFERRED (FUTURE SCOPE)`
   - **Rationale:** The current architecture supports structured manual entry and CSV bulk intake with pathologist sign-off verification. Direct serial/bidirectional analyzer middleware requires dedicated on-prem agent software and physical instrument connectivity.

---

## 4. Operational Sign-Off Protocol

To transition system status from **`SOFTWARE COMPLETE`** to **`FULLY OPERATIONALLY READY`**, the hospital management must:
1. Complete the physical installation of printers and scanners on hospital client workstations (Gate 09).
2. Input approved doctor schedules, chamber fees, and emergency telephone numbers (Gates 01, 02, 04).
3. Secure live merchant credentials from bKash, Nagad, and SSLCommerz (Gates 06, 07, 08).
4. Conduct supervised staff UAT training across reception, cashier, and pathology desks (Gate 10).
