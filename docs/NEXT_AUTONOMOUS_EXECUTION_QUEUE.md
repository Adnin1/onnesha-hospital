# OHMS Next Autonomous Execution Queue

**Document Purpose:** Durable continuation queue for subsequent Antigravity engineering sessions. Allows immediate resumption without redundant re-auditing.  
**Baseline Release:** `v1.1.25` (Commit `444eccdf75e93bee90054fd8a73cdd110efd9245`)  
**Canonical Host:** `https://onnesha-hospital.pages.dev`  

---

## 1. Immediate Technical Queue

| Item | Area | Current Status | Action Required |
|:---|:---|:---:|:---|
| **CSP Directive Verification** | Security Headers | ✅ COMPLETED | Removed `api.resend.com` from `public/_headers` and `docker/nginx.conf` |
| **Atomic Master Data RPC** | Database Actions | ✅ COMPLETED | Eliminated direct-table fallback in `lib/hospital/actions.ts` |
| **Google Dynamic Sitemap** | SEO / Search | ✅ COMPLETED | Configured dynamic build-time `buildLastModified` in `app/sitemap.ts` |
| **Manifest Version Alignment** | Versioning | ✅ COMPLETED | Synchronized version `1.1.25` across all 6 manifests |
| **Discrepancy Reconciliation** | Documentation | ✅ COMPLETED | Aligned test runner count to 95 suites / 840 passes in certification docs |
| **CI Staging Secret Injection** | GitHub Actions | 🟡 BLOCKED (External) | Owner must inject `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` |
| **Tauri Windows MSI Artifact** | Desktop Release | 🟡 BLOCKED (CI Dependency)| Automated compilation triggers upon green staging gate in CI |

---

## 2. External Owner Action Queue

The following items are outside repository software code jurisdiction and require real-world external credentials, hardware, or administrative actions:

### A. Commercial API Credentials
- [ ] **SSLCommerz Live Merchant:** Set `SSLCOMMERZ_STORE_ID` & `SSLCOMMERZ_STORE_PASSWORD` in Supabase `organization_integrations`.
- [ ] **bKash MFS Merchant:** Set `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`.
- [ ] **Nagad MFS Merchant:** Set `NAGAD_MERCHANT_ID`, `NAGAD_PUBLIC_KEY`, `NAGAD_PRIVATE_KEY`.
- [ ] **Bangladesh SMS Gateway:** Set `SMS_GATEWAY_API_KEY` (SSL Wireless / Greenweb) for patient notifications.
- [ ] **WhatsApp Business API:** Configure Meta Business Manager phone number ID and bearer token.
- [ ] **Transactional Email Provider:** Set `RESEND_API_KEY` and verify sending domain DNS records.

### B. Physical Infrastructure & Hardware
- [ ] **Reception POS Thermal Printers:** Plug 80mm USB thermal receipt printers into billing workstations.
- [ ] **Consultant Prescription Laser Printers:** Connect A4 laser printers in doctor chambers.
- [ ] **Diagnostic Laboratory LIS Bridge:** Connect RS-232 serial to USB converters between laboratory analyzers (Mindray/Sysmex) and the local Windows bridge workstation running `tools/lis-bridge/`.

### C. Clinical & Administrative Governance
- [ ] **Doctor BMDC Verification:** Input official BMDC registration numbers for all rostered physicians.
- [ ] **Management Tariff Approval:** Formal sign-off on OPD consultation, IPD bed charges, and pathology/radiology fee schedules.
- [ ] **DGHS Licensing:** Display official Directorate General of Health Services facility license number.
- [ ] **Hospital Staff UAT:** Complete on-site user acceptance drill covering patient registration, consultation, lab ordering, and invoice settlement.
- [ ] **Database PITR Drill:** Execute test restore drill on a secondary staging database to benchmark RTO/RPO.
- [ ] **Cloudflare Custom Apex Domain:** Delegate `onneshahospital.com` nameservers to Cloudflare Zone if migrating off `onnesha-hospital.pages.dev`.

---

## 3. Post-Go-Live Operational Queue

1. **Uptime & Error Telemetry:** Monitor Cloudflare Web Analytics and edge HTTP status rates.
2. **Database Capacity & Connection Pooling:** Monitor Supabase active connections and pool exhaustion under peak morning OPD hours.
3. **Automated Weekly Backups:** Verify Supabase managed daily backups and PITR log retention.
4. **Core Web Vitals Monitoring:** Track real-user metrics (p75 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1) via Cloudflare Web Analytics.
5. **Staff Access & Key Rotation:** Implement 90-day credential rotation for database service keys and gateway API tokens.
6. **Quarterly Disaster Recovery Simulation:** Scheduled table restoration drill in accordance with hospital business continuity policy.
