# Onnesha Hospital Management System (OHMS) — Final Operational Commissioning Status

**Document Version:** `v1.1.65-OPERATIONAL-GATES`  
**Execution Timestamp:** `2026-10-08T20:00:00+06:00`  
**Authoritative Host:** `https://onnesha-hospital.pages.dev`  
**Current Governance State:** `SOFTWARE COMPLETE — 16 OWNER GATES PENDING PHYSICAL ACTION (G1–G16)`  

---

## 1. Separation of Concerns Directive

Under the **Autonomous Engineering Swarm Constitution**, zero false greens are permitted:
> **`Software Complete ≠ Hospital Operationally Ready`**

Every software line, database migration, automated test, build export, and live security smoke layer is **100% Code-Complete and Certified Green**.  
The following 16 items require external physical hardware, bank merchant onboarding, staff training, code signing hardware, or legal regulatory documentation that cannot be simulated or fabricated.

---

## 2. 16 Itemized Canonical Owner Gate Register (G1–G16)

| Gate ID | Area / Gate Description | Responsible Owner | Status | Required Real-World Evidence | Blocking Scope |
|:---|:---|:---|:---:|:---|:---|
| **G1** | Live Payment Gateway Keys (bKash, Nagad, SSLCommerz) | Hospital Owner / Bank | `PENDING` | Production AppKey, AppSecret, Username, Password, and Private Key from merchant onboarding. | Live Mobile & Card Online Payments |
| **G2** | Bulk SMS Provider API Key | IT Admin / Telecom | `PENDING` | Production SSL Wireless/Greenweb SMS API Key configured in production vault. | Real-Time Patient SMS Delivery |
| **G3** | WhatsApp Business Cloud API Key | IT Admin / Meta | `PENDING` | Meta WhatsApp Cloud API credentials and approved message templates configured. | WhatsApp Prescription & Token Alerts |
| **G4** | Hospital SMTP Mail Credentials | IT Admin / Mailhost | `PENDING` | Production hospital SMTP credentials configured in Supabase Auth & alerting settings. | Email Verification & Formal Receipts |
| **G5** | Physical 80mm ESC/POS Thermal Receipt Printers | IT Technician | `PENDING` | 80mm POS thermal receipt printers connected to reception/cashier workstations. | Physical Hardcopy Serial & Slip Printing |
| **G6** | Physical 2D Handheld Barcode Scanners | IT Technician | `PENDING` | USB/Bluetooth 2D barcode scanners calibrated at patient triage and billing desks. | Quick Patient & Episode Retrieval |
| **G7** | Physical ZKTeco Biometric Terminals | IT Technician / HR | `PENDING` | Biometric fingerprint/facial attendance terminals connected to hospital local network. | Biometric Staff Attendance Sync |
| **G8** | Physical DICOM PACS Modalities (C-STORE binding) | Radiology / PACS Admin | `PENDING` | Physical CT/MRI/X-Ray modalities bound to DICOM C-STORE network endpoint. | Diagnostic Imaging Direct Archival |
| **G9** | Physical LIS Analyzers (Serial/TCP interfaces) | Pathology / Lab Tech | `PENDING` | Physical hematology/biochemistry analyzers connected via serial/TCP cable. | Direct Machine Result Transmission |
| **G10** | GitHub Actions Staging Secrets | DevOps / IT Admin | `PENDING` | `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` added to GitHub Action Secrets. | Automated GitHub CI Live Security Gate |
| **G11** | Supabase Point-in-Time Recovery (PITR) & Backups | Cloud Admin / DBA | `PENDING` | Supabase Pro plan PITR retention subscription active and daily off-site snapshots verified. | Production Disaster Recovery SLA |
| **G12** | Physical Queue TV Android Displays | Facilities / Admin | `PENDING` | Wall-mounted Android Smart TVs displaying `/displays/queue` in OPD waiting halls. | Physical Queue Token Visibility |
| **G13** | Clinical UAT Sign-Off from Hospital Superintendent | Medical Director | `PENDING` | Formal acceptance sign-off on clinical workflows, intake wizard, and triage paths. | Clinical Operations Launch |
| **G14** | DGHS & BMDC Statutory Compliance Filings | Hospital Legal / Admin | `PENDING` | Directorate General of Health Services (DGHS) operating license and BMDC roster filings. | Legal Commercial Hospital Launch |
| **G15** | Windows Authenticode EV Code Signing Certificate | Security / IT Admin | `PENDING` | Extended Validation (EV) hardware token used to sign Tauri desktop installer. | Windows SmartScreen Zero-Warning Install |
| **G16** | Custom Domain DNS CNAME Cutover | Domain Owner | `DEFERRED` | Custom domain DNS records routed to Cloudflare Pages (canonical is `pages.dev`). | Custom Domain Access |

---

## 3. Deferred Future Workstreams & Completed Capabilities

1. **Custom Apex Domain (`https://onneshahospital.com`):**
   - **Status:** `DEFERRED`
   - **Rationale:** The canonical production host is locked at `https://onnesha-hospital.pages.dev`. Activating a custom apex domain requires DNS delegation and Cloudflare Universal SSL validation by the domain owner.
2. **Direct Lab Analyzer / LIS Middleware (ASTM E1381/E1394 & HL7 v2.x):**
   - **Status:** `IMPLEMENTED & DELIVERED (v1.1.22)`
   - **Verification:** Completed in full. Includes ASTM 1394 and HL7 v2.5.1 parser engine, bi-directional host query worklist handler, automated result ingestion, panic value alerts, `lab_analyzers` & `lab_analyzer_transmissions` tables (Migration 95), and interactive LIS Modal console (`components/lab/LisAnalyzerModal.tsx`). Verified via `tests/lis-analyzer-integration.test.mjs` (10/10 passing).

---

## 4. Operational Sign-Off Protocol

To transition system status from **`SOFTWARE COMPLETE`** to **`FULLY OPERATIONALLY READY`**, the hospital management must:
1. Complete the physical installation of printers and scanners on hospital client workstations (Gate 09).
2. Input approved doctor schedules, chamber fees, and emergency telephone numbers (Gates 01, 02, 04).
3. Secure live merchant credentials from bKash, Nagad, and SSLCommerz (Gates 06, 07, 08).
4. Conduct supervised staff UAT training across reception, cashier, and pathology desks (Gate 10).
