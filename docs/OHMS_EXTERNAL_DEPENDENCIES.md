# OHMS EXTERNAL DEPENDENCIES & OPERATIONAL REALITY MATRIX
**Authoritative Scope:** True Distinction Between Implemented Software Adapters and Real-World Physical/Vendor Credentials.

---

| Integration / Subsystem | Software Adapter / Schema State | Live Operational Status | Exact Blocker Reason | Exact Action Required to Enable |
| :--- | :--- | :--- | :--- | :--- |
| **bKash Payment Gateway** | `IMPLEMENTED` (`lib/payments`) | `EXTERNAL-DEPENDENCY` | Merchant Live Credentials Absent | Merchant must set `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` in Cloudflare Pages. |
| **Nagad Payment Gateway** | `IMPLEMENTED` (`lib/payments`) | `EXTERNAL-DEPENDENCY` | Merchant Live Credentials Absent | Merchant must set `NAGAD_MERCHANT_ID`, `NAGAD_PUBLIC_KEY`, `NAGAD_PRIVATE_KEY`. |
| **SSLCommerz Gateway** | `IMPLEMENTED` (`lib/payments`) | `EXTERNAL-DEPENDENCY` | Merchant Live Credentials Absent | Merchant must set `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`. |
| **SMS Gateway (SSL Wireless)** | `IMPLEMENTED` (`lib/sms`) | `EXTERNAL-DEPENDENCY` | Provider API Key Absent | Hospital IT must configure approved Sender ID and API token. |
| **WhatsApp Business API** | `IMPLEMENTED` (`lib/notifications`) | `EXTERNAL-DEPENDENCY` | Meta Cloud Token Absent | Owner must provide verified Meta Phone Number ID and Permanent Access Token. |
| **80mm POS Thermal Printer** | `IMPLEMENTED` (CSS `@media print`) | `PHYSICAL-ACTION-REQUIRED` | No USB Physical Device on Cloud | On-site hospital IT must connect 80mm USB thermal printer to reception PC. |
| **A4 Laser Prescription Printer** | `IMPLEMENTED` (CSS `@media print`) | `PHYSICAL-ACTION-REQUIRED` | No USB Physical Device on Cloud | On-site hospital IT must connect A4 laser printer in doctor consultation room. |
| **USB Barcode Scanner** | `IMPLEMENTED` (Auto-focus listener) | `PHYSICAL-ACTION-REQUIRED` | No USB Physical Device on Cloud | On-site hospital IT must plug USB barcode scanner into pharmacy terminal. |
| **Super Admin Password Initial** | `IMPLEMENTED` (Database Seeding) | `OWNER-ACTION-REQUIRED` | Human Owner Initial Login Pending | Hospital Super Admin must perform first-time login and change temporary password. |
| **Super Admin TOTP MFA** | `IMPLEMENTED` (Supabase AAL2 Guard) | `OWNER-ACTION-REQUIRED` | Smartphone QR Scan Pending | Hospital Super Admin must scan TOTP QR with Google Authenticator and verify code. |
| **Supabase PITR Restore Drill** | `IMPLEMENTED` (Cloud Daily Backups) | `OWNER-ACTION-REQUIRED` | Isolated Staging Drill Pending | Database owner must execute test PITR restore into an isolated staging project. |
| **Custom Domain (`onneshahospital.com`)**| `IMPLEMENTED` (Cloudflare Pages Host) | `OWNER-ACTION-REQUIRED` | Cloudflare Zone Delegation Pending | Domain registrar must delegate authoritative nameservers to Cloudflare. |
| **GitHub main Protection** | `IMPLEMENTED` (CI Quality Pipelines) | `OWNER-ACTION-REQUIRED` | Admin API Permission Required | Repository owner (`Adnin1`) must enable branch protection rules in GitHub Settings. |
| **LIS Machine Interface** | `IMPLEMENTED` (ASTM/HL7 Simulator) | `EXTERNAL-DEPENDENCY` | Serial RS-232 / TCP Bridge Absent | Physical analyzer hardware connection requires local edge hospital gateway. |
| **Ambulance Live GPS** | `IMPLEMENTED` (Trip Dispatch Schema) | `EXTERNAL-DEPENDENCY` | Vehicle Hardware GPS Absent | Physical GPS tracker device required on ambulance fleet. |
