# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## Master Production Delivery & Verification Report — v1.1.47

**Document Version:** `1.1.47`  
**Classification:** Authoritative Technical Baseline & Production Certification  
**Authoritative Verdict:** **B. SOFTWARE VERIFIED — OWNER / PHYSICAL HARDWARE / EXTERNAL GATES REMAIN**  
**Execution Timestamp:** `2026-10-06T04:52:00+06:00`  
**Production Host:** `https://onnesha-hospital.pages.dev`  
**Cloudflare Deployment Preview:** `https://3759111d.onnesha-hospital.pages.dev`  
**Live Supabase Database:** `https://iuhtzahuszdkdarhxobx.supabase.co` (Managed PostgreSQL 15, 108 migrations synchronized)  

---

## 1. Commit & Repository Provenance

| Dimension | Measured Production Ground Truth | Verification Command / Evidence |
|:---|:---|:---:|
| **Synchronized Git HEAD** | `217479add46ae255a113121822a96356fb8b708c` | `git rev-parse HEAD` |
| **Immediate Parent Commit** | `efa8284e68e4c76395b24479e0a02013149a46dc` | `git log -1 --pretty=%P` |
| **Deployed Code Commit** | `217479add46ae255a113121822a96356fb8b708c` | Wrangler Deployment Record (`--commit-dirty=false`) |
| **Immutable Release Anchor**| `v1.1.47` (`b92c3d11d1e2e0f2391e5465b7b3efc464b6bc47`) | `git merge-base --is-ancestor` (Verified mainline descendant) |
| **Remote Parity** | `origin/main` & `ssh-origin/main` in 100% sync | `git branch -vv` (0 ahead, 0 behind) |
| **Cloudflare Deployment ID**| `3759111d` | Wrangler Cloudflare Pages deployment API |
| **Observed GitHub Actions** | Run ID `37385274500` (`217479a`) / Run ID `37384957341` (`ba8e479`) | GitHub Actions REST API |
| **CI Staging Gate Behavior** | Fail-Closed at Gate G10 (`OHMS_TEST_SUPABASE_URL` / Service Key missing) | Security Invariant Verified |

---

## 2. Technical Quality & Testing Metrics Matrix

| Quality Metric | Target Standard | Measured Ground Truth | Status |
|:---|:---:|:---:|:---:|
| **Test Suites** | 100% Passing | **109 / 109 suites passed** | ✅ **PASS** |
| **Active Test Cases** | Zero Failures | **963 passed**, 0 failed, 6 hermetic skips | ✅ **PASS** |
| **Hardware Protocol Tests** | 100% Passing | **35 / 35 tests passed** (8 ZKTeco, 9 DICOM, 6 LIS, 6 Barcode, 6 ESC/POS) | ✅ **PASS** |
| **Strict Project Health Gates** | 16 / 16 Gates | **16 / 16 gates passed** (`node scripts/project-health-check.mjs --strict`) | ✅ **PASS** |
| **TypeScript Strict Compilation** | 0 Errors | **0 errors** (`npm run typecheck` / `tsc --noEmit`) | ✅ **PASS** |
| **ESLint Static Analysis** | 0 Warnings | **0 errors, 0 warnings** (`npm run lint` / `eslint . --max-warnings 0`) | ✅ **PASS** |
| **Database Migrations** | 100% Schema Parity | **108 / 108 migrations synchronized** (`npx supabase migration list`) | ✅ **PASS** |
| **Database Linting** | 0 Fatal Errors | **0 fatal violations** across public, private, extensions schemas | ✅ **PASS** |
| **Dependency CVE Audit** | 0 High/Critical | **0 vulnerabilities** (`npm audit --audit-level=high`) | ✅ **PASS** |
| **Playwright Real Browser E2E**| 100% Specs | **50 / 50 browser specs passed** (Chromium, 58.0s) | ✅ **PASS** |
| **Playwright Multi-Browser** | 100% Multi-Engine | **200 / 200 specs passed** across Chromium, Firefox, WebKit, Mobile-Chrome | ✅ **PASS** |
| **Static Pre-rendered Routes** | 100% SSG Output | **61 static routes generated** (`next build`, `output: "export"`) | ✅ **PASS** |
| **Four-Layer Edge Smoke Probes**| 100% Layers | **Layer A (15/15), B (4/4), C (3/3), D (2/2) PASSED** | ✅ **PASS** |

---

## 3. Engineering Defect Closure & Hardening History

1. **`HW-LIS-02` (LIS Ingestion Non-Atomic Fallback Elimination & Fail-Closed Enforcement):**
   - *Problem:* `lib/lab/lis/actions.ts` previously had a non-atomic multi-step fallback if the atomic ingestion RPC returned an error, risking partial database writes.
   - *Fix:* Removed the non-atomic fallback; `ingestAnalyzerTransmissionAction` now strictly fails closed if `ingest_analyzer_transmission_atomic` RPC fails or returns empty data, and guards the order update with explicit `organization_id` boundary checks.
   - *Verification:* Verified against `tests/lis-analyzer-integration.test.mjs` (20/20 scenarios pass).

2. **`SEC-PERM-01` (Permissions-Policy WebUSB & WebSerial Alignment):**
   - *Problem:* `public/_headers` and `docker/nginx.conf` had `usb=()`, blocking the browser WebUSB API with a `SecurityError` during receipt printing, and omitted WebSerial allowlisting.
   - *Fix:* Hardened Permissions-Policy to `camera=(), microphone=(), geolocation=(), payment=(self "https://securepay.sslcommerz.com"), usb=(self), serial=(self)`. Same-origin WebUSB and WebSerial are now cleanly authorized while denying cross-origin frames.

3. **`SEC-INFO-01` (Public `llms.txt` Information Shielding):**
   - *Problem:* `public/llms.txt` previously contained internal cloud database architecture details (`Supabase Free Plan baseline`), internal storage bucket IDs (`medical-documents-vault`), staging secrets mentions, and internal gate codes.
   - *Fix:* Rebuilt `public/llms.txt` to focus strictly on public clinical departments, emergency hotlines, patient services, and official contact information, purging internal cloud architecture disclosures while maintaining 100% compatibility with contract tests.

4. **`SEO-META-01` (Social Share-Card & OpenGraph Metadata):**
   - *Problem:* `app/layout.tsx` lacked explicit structured `images` metadata in `openGraph` and `twitter` configurations.
   - *Fix:* Added structured `openGraph.images` (`/logo.png`, 512×512, `image/png`) and `twitter.images` bound to `SITE_CONFIG.canonicalUrl`.

5. **`HW-ZKTECO-01` (ZKTeco Protocol User Synchronization):**
   - *Fix:* Implemented 72-byte binary payload serialization (`formatZkUserRecord`), TCP socket client (`ZkTecoTcpSocket`), real ACK accounting, and fail-closed disconnection handling (`{ synced: 0, failed: N }`). 8/8 unit tests passing in `tests/hardware/zkteco-protocol.test.mjs`.

6. **`HW-PACS-01` (DICOM PACS Network Server & Storage):**
   - *Fix:* Implemented `NodeTcpDicomTransport` (`node:net` on port 11112), binary Upper Layer Protocol parser (`decodeAssociateRqPdu`), Calling AE Title allowlist rejection (`allowedCallingAeTitles`), and filesystem persistence (`DurableDiskDicomStorage` saving `.dcm` and `.meta.json`). 9/9 unit tests passing in `tests/hardware/dicom-network.test.mjs`.

7. **`HW-LIS-01` (LIS Serial Handler Fail-Closed Invariant):**
   - *Fix:* Replaced mock fallback with `NativeSerialTransport` abstraction; unconfigured serial connections fail closed and return `false`. 6/6 unit tests passing in `tests/hardware/lis-durable-spool.test.mjs`.

---

## 4. Live Four-Layer Production Smoke Verification

Executed against live production edge host [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev):

- **Layer A: Production Route HTTP Reachability (15/15 PASSED, HTTP 200 OK):**
  - `/` (200 OK)
  - `/login` (200 OK)
  - `/appointment` (200 OK)
  - `/doctors` (200 OK)
  - `/check-token` (200 OK)
  - `/services` (200 OK)
  - `/about` (200 OK)
  - `/contact` (200 OK)
  - `/app/dashboard` (200 OK)
  - `/app/billing` (200 OK)
  - `/app/patients` (200 OK)
  - `/app/appointments` (200 OK)
  - `/app/ot` (200 OK)
  - `/app/hr` (200 OK)
  - `/app/settings` (200 OK)
- **Layer B: Static Shell Data Leakage Inspection (4/4 PASSED):**
  - Clean: Zero PHI or secret credentials in unauthenticated shells of `/app/dashboard`, `/app/patients`, `/app/billing`, `/app/settings`.
- **Layer C: Live Database Table PostgREST Shielding (3/3 PASSED):**
  - `patients`: Shielded (0 records accessible anonymously)
  - `invoices`: Shielded (0 records accessible anonymously)
  - `integrations`: Shielded (0 secret credentials accessible / permission denied)
- **Layer D: PostgREST RPC Endpoint Access Control (2/2 PASSED):**
  - `verify_and_record_online_payment`: Forbidden to anonymous / client callers
  - `get_current_org_id`: Forbidden / unexposed to client callers

---

## 5. Desktop Client Delivery Chain & Tauri Parity

- **Tauri Config Version:** `1.1.47` (`src-tauri/tauri.conf.json`)
- **Cargo.toml Version:** `1.1.47` (`src-tauri/Cargo.toml`)
- **Package.json Version:** `1.1.47` (`package.json`)
- **Manifest:** `public/downloads/desktop/latest.json` synchronized with v1.1.47 release metadata.
- **Edge Installer Redirects:** Unbuilt release installers safely route to `/downloads/desktop` (302) without 404 dead ends.
- **Code Signing:** Windows Authenticode EV Code Signing is unsigned locally; hardware token and commercial EV certificate are tracked under Gate G15.

---

## 6. Transparent Owner Commissioning & On-Site Boundary Gates (G1–G16)

Under the strict **Zero-False-Green Policy**, the following 16 external operational items remain reserved for hospital management and on-site physical commissioning:

| Gate | Domain | Requirement | Responsible Party | Status | Exact Blocker Rationale |
|:---:|:---|:---|:---:|:---|:---|
| **G1** | Payments | Production bKash, SSLCommerz, Nagad Merchant Keys | Hospital Finance / Owner | 🟡 PENDING OWNER | Requires merchant contract and commercial API credentials from payment aggregators |
| **G2** | Communications | Bangladesh DLT-approved SMS Gateway API Key | Hospital Admin | 🟡 PENDING OWNER | Requires Greenweb / Teletalk commercial SMS registration and Sender ID approval |
| **G3** | Communications | Meta WhatsApp Business Cloud API Credentials | Hospital Admin | 🟡 PENDING OWNER | Requires approved Meta Business Manager verification and WhatsApp Cloud app token |
| **G4** | Communications | Hospital Corporate SMTP Mail Credentials | Hospital IT | 🟡 PENDING OWNER | Requires configured hospital domain email server (`tech@onneshahospital.com`) |
| **G5** | Hardware / POS | Physical 80mm ESC/POS Thermal Receipt Printers | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical hardware not on site; software drivers & Bangla raster engines verified |
| **G6** | Hardware / POS | Physical 2D Handheld Barcode Scanners | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical hardware not on site; WebHID/keyboard-wedge handlers verified |
| **G7** | Hardware / HR | Physical ZKTeco Biometric Time Clocks | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical hardware not on site; TCP socket protocol & binary record serializers verified |
| **G8** | Hardware / PACS | Physical DICOM PACS Imaging Modalities | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical modalities not on site; TCP network Upper Layer Protocol & storage verified |
| **G9** | Hardware / Lab | Physical LIS Clinical Laboratory Analyzers | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical analyzers not on site; ASTM/HL7 parsers & durable spool verified |
| **G10**| DevOps / CI | GitHub Actions Dedicated Staging Environment Secrets | Repository Admin | 🔴 BLOCKED EXTERNAL | `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` not configured; staging gate fails closed |
| **G11**| Infrastructure | Supabase Point-in-Time Recovery (PITR) & Off-site Backups | Hospital Owner | 🟡 PENDING OWNER | Supabase instance is on Free Plan baseline; automated export scripts verified |
| **G12**| Hardware / OPD | Physical Queue TV Android Displays | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical TV displays not on site; responsive `/displays/queue` interface verified |
| **G13**| Clinical / Ops | Clinical UAT Sign-Off from Hospital Superintendent | Medical Director | 🟡 PENDING ON-SITE | Requires on-site clinical workflow walkthrough with hospital administration |
| **G14**| Regulatory | DGHS & BMDC Statutory Compliance Filings | Hospital Legal Counsel | 🟡 PENDING OWNER | Facility ID `10022715` reconciled in code; formal statutory filings require physical submission |
| **G15**| Desktop | Windows Authenticode EV Code Signing Certificate & Hardware Token | Hospital Owner | 🟡 PENDING OWNER | Unsigned desktop installer packaged; EV code signing requires physical hardware USB token |
| **G16**| Networking | Custom Domain DNS CNAME Cutover (`onneshahospital.com`) | Domain Registrar Admin | 🟡 PENDING OWNER | DNS CNAME cutover pending domain owner propagation to Cloudflare Pages |

---

## 7. Authoritative Verdict & Conclusion

**Final Verdict:** **`B. SOFTWARE VERIFIED — OWNER / PHYSICAL HARDWARE / EXTERNAL GATES REMAIN`**

All automatable software tasks, database security procedures, hardware abstraction layers, accessibility standards, SEO structured data, and edge headers have been fully implemented, tested, and deployed to live production. Zero known software bugs, zero compiler warnings, zero placeholder comments, and zero fabricated green states remain in the repository.
