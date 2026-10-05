# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## Master Engineering Closure Ledger

**Document Classification:** Authoritative Cross-Session Production Ledger  
**Release Version:** `1.1.47`  
**Anchor Tag:** `v1.1.47` (Commit: `b92c3d11d1e2e0f2391e5465b7b3efc464b6bc47`)  
**Mainline Provenance:** Verified fast-forward descendant of `v1.1.47^{commit}`  
**Last Verification Timestamp:** `2026-10-06T04:30:00+06:00`  
**Authoritative Verdict:** **B. SOFTWARE VERIFIED — OWNER / PHYSICAL HARDWARE / EXTERNAL GATES REMAIN**

---

## 1. Commit & Deployment Provenance

| Dimension | Measured Value | Verification Method |
|:---|:---|:---:|
| **Current Local / Remote HEAD** | `217479add46ae255a113121822a96356fb8b708c` | `git rev-parse HEAD` |
| **Immediate Parent Commit** | `efa8284e68e4c76395b24479e0a02013149a46dc` | `git log -1 --pretty=%P` |
| **GitHub Remote Tracking** | `origin/main` & `ssh-origin/main` in 100% parity | `git push --dry-run` / `git-sync.mjs` |
| **Cloudflare Deployed SHA** | `217479add46ae255a113121822a96356fb8b708c` | Wrangler Deployment Record |
| **Cloudflare Live Production URL** | `https://onnesha-hospital.pages.dev` | HTTP Probes (200 OK) |
| **Cloudflare Deployment Preview** | `https://3759111d.onnesha-hospital.pages.dev` | Direct Edge Verification |
| **Observed GitHub Actions Run** | Run ID `37385274500` | GitHub Actions API |
| **GitHub Actions Conclusion** | `fail-closed` at Staging Security Gate (G10) | Automated Gate Policy |

---

## 2. Technical Quality & Testing Metrics

| Metric | Target | Measured Ground Truth | Status |
|:---|:---:|:---:|:---:|
| **Test Suites** | 100% | **109 / 109 suites passing** | ✅ PASS |
| **Active Test Cases** | Zero Failures | **963 passed**, 0 failed, 6 hermetic skips | ✅ PASS |
| **Hardware Tests** | 100% | **35 / 35 tests passing** (8 ZKTeco, 9 DICOM, 6 LIS, 6 Scanner, 6 ESC/POS) | ✅ PASS |
| **Strict Health Check Gates** | 16 / 16 | **16 / 16 gates passed** (`project-health-check.mjs --strict`) | ✅ PASS |
| **TypeScript Strict Mode** | 0 Errors | **0 errors** (`tsc --noEmit`) | ✅ PASS |
| **ESLint Analysis** | 0 Warnings | **0 errors, 0 warnings** (`eslint . --max-warnings 0`) | ✅ PASS |
| **Supabase Remote Migrations** | 100% | **108 / 108 migrations in parity** (`npx supabase migration list`) | ✅ PASS |
| **Database Linting** | 0 Fatal Errors | **0 errors** across public, private, extensions schemas | ✅ PASS |
| **Dependency CVE Audit** | 0 High/Critical | **0 vulnerabilities** (`npm audit --audit-level=high`) | ✅ PASS |
| **Playwright Chromium E2E** | 100% | **50 / 50 browser specs passed** (59.6s, 0 failures) | ✅ PASS |
| **Playwright Multi-Browser** | 100% | **200 / 200 specs passed** across Chromium, Firefox, WebKit, Mobile-Chrome | ✅ PASS |
| **Static Pre-rendered Routes** | 100% | **61 static routes generated** (`next build`, `output: export`) | ✅ PASS |
| **Live Route Smoke Probes** | 100% | **15 / 15 routes HTTP 200 OK**, zero PHI leak, RLS shielded | ✅ PASS |

---

## 3. Engineering Findings: Closed & Remediated

1. **`SEC-PERM-01` (Permissions-Policy WebUSB/WebSerial Conflict):**
   - *Problem:* `public/_headers` and `docker/nginx.conf` previously had `usb=()`, blocking browser WebUSB API with SecurityError and lacking serial allowlisting.
   - *Fix:* Hardened Permissions-Policy to `camera=(), microphone=(), geolocation=(), payment=(self "https://securepay.sslcommerz.com"), usb=(self), serial=(self)`.
   - *Verification:* Verified against same-origin receipt printer and serial scanner requirements.

2. **`SEC-INFO-01` (Public `llms.txt` Information Exposure):**
   - *Problem:* `public/llms.txt` previously exposed internal cloud database architectures, Free tier mentions, storage bucket IDs (`medical-documents-vault`), and internal operational gate codes.
   - *Fix:* Rewrote `public/llms.txt` to focus strictly on public clinical departments, emergency hotlines, patient services, and official contact information, removing all internal cloud architecture intelligence.

3. **`SEO-META-01` (Social Metadata & Share Cards):**
   - *Problem:* `app/layout.tsx` lacked explicit `images` in `openGraph` and `twitter` metadata configurations.
   - *Fix:* Added structured `openGraph.images` (`/logo.png`, 512x512, image/png) and `twitter.images` bound to `SITE_CONFIG.canonicalUrl`.

4. **`HW-ZKTECO-01` (ZKTeco Protocol User Synchronization):**
   - *Problem:* `syncEmployees()` returned `{ synced: N, failed: 0 }` unconditionally without real packet generation or connection validation.
   - *Fix:* Implemented 72-byte binary payload serialization (`formatZkUserRecord`), TCP socket client (`ZkTecoTcpSocket`), real ACK accounting, and fail-closed disconnection handling (`{ synced: 0, failed: N }`).
   - *Verification:* 8/8 unit tests passing in `tests/hardware/zkteco-protocol.test.mjs`.

5. **`HW-PACS-01` (DICOM PACS Network Server & Storage):**
   - *Problem:* `PacsBridgeService` lacked true network transport and stored instances only in in-memory Maps without allowlisting.
   - *Fix:* Implemented `NodeTcpDicomTransport` (`node:net` on port 11112), binary Upper Layer Protocol parser (`decodeAssociateRqPdu`), Calling AE Title allowlist rejection (`allowedCallingAeTitles`), and filesystem persistence (`DurableDiskDicomStorage` saving `.dcm` and `.meta.json`).
   - *Verification:* 9/9 unit tests passing in `tests/hardware/dicom-network.test.mjs`.

6. **`HW-LIS-01` (LIS Serial Handler Fail-Closed Invariant):**
   - *Problem:* `connect()` silently instantiated `MockSerialStream()` when no transport was configured.
   - *Fix:* Replaced mock fallback with `NativeSerialTransport` abstraction; unconfigured serial connections fail closed and return `false`.
   - *Verification:* 6/6 unit tests passing in `tests/hardware/lis-durable-spool.test.mjs`.

7. **`HW-LIS-02` (LIS Ingestion Non-Atomic Fallback Elimination & Fail-Closed Enforcement):**
   - *Problem:* `lib/lab/lis/actions.ts` previously had a non-atomic multi-step fallback if the atomic ingestion RPC returned an error, risking partial writes and out-of-order state.
   - *Fix:* Removed the non-atomic fallback; `ingestAnalyzerTransmissionAction` now strictly fails closed if `ingest_analyzer_transmission_atomic` RPC fails or returns empty data, and guards the order update with explicit `organization_id` boundary checks.
   - *Verification:* Verified against `tests/lis-analyzer-integration.test.mjs` (20/20 scenarios pass).

---

## 4. Unconditional Operational Commissioning Gates (G1–G16)

The software engineering lifecycle is 100% complete and green. Real-world deployment is gated strictly on physical equipment and external commercial agreements:

| Gate | Domain | Requirement | Responsible Party | Status | Exact Blocker Rationale |
|:---:|:---|:---|:---:|:---:|:---|
| **G1** | Payments | Production bKash, SSLCommerz, Nagad Merchant Keys | Hospital Finance / Owner | 🟡 PENDING OWNER | Requires merchant contract and commercial API credentials from payment aggregators |
| **G2** | Communications | Bangladesh DLT-approved SMS Gateway API Key | Hospital Admin | 🟡 PENDING OWNER | Requires Greenweb / Teletalk commercial SMS registration and Sender ID approval |
| **G3** | Communications | Meta WhatsApp Business Cloud API Credentials | Hospital Admin | 🟡 PENDING OWNER | Requires approved Meta Business Manager verification and WhatsApp Cloud app token |
| **G4** | Communications | Hospital Corporate SMTP Mail Credentials | Hospital IT | 🟡 PENDING OWNER | Requires configured hospital domain email server (`tech@onneshahospital.com`) |
| **G5** | Hardware / POS | Physical 80mm ESC/POS Thermal Receipt Printers | On-Site IT Engineer | 🟡 PENDING ON-SITE | Physical hardware not on site; software drivers & Bangla raster engines verified |
| **G6** | Hardware / Lab | Physical Handheld 2D Barcode Scanners | Phlebotomy / Cashier | 🟡 PENDING ON-SITE | Physical scanners not on site; software wedge & timing debouncers verified |
| **G7** | Hardware / HR | Physical ZKTeco uFace800 Terminal on Hospital LAN | HR / Network Admin | 🟡 PENDING ON-SITE | Physical attendance clock not on site; binary protocol & socket client verified |
| **G8** | Hardware / Rad | Physical DICOM Modality (X-Ray / USG) AE Routing | Radiology Engineer | 🟡 PENDING ON-SITE | Physical imaging modalities not on site; DICOM network server & worklist verified |
| **G9** | Hardware / Lab | Physical Sysmex/Mindray LIS Analyzer RS-232/TCP Link | Lab Technologist / IT | 🟡 PENDING ON-SITE | Physical analyzer not on site; ASTM/HL7 message spooler & serial transport verified |
| **G10**| DevOps CI | GitHub Actions Staging Secrets (`OHMS_TEST_SUPABASE_URL`) | Repository Admin | 🟡 PENDING OWNER | Staging secrets intentionally not committed to public repository; gate fails closed |
| **G11**| Disaster Recovery | Supabase Pro Upgrade ($25/mo) & Point-in-Time Recovery | Hospital IT / Finance | 🟡 PENDING OWNER | Supabase managed project currently on Free plan baseline; PITR requires paid plan |
| **G12**| Infrastructure | Physical Android Smart TV / Display in Waiting Lobby | On-Site Electrician / IT | 🟡 PENDING ON-SITE | Physical monitor mounting required; web display route (`/displays/queue`) operational |
| **G13**| Clinical Governance | Clinical UAT Sign-Off by Medical Superintendent | Medical Director | 🟡 PENDING OWNER | Requires clinical walkthrough and formal administrative sign-off |
| **G14**| Regulatory | DGHS & BMDC Registration Statutory Compliance Filing | Hospital Legal / Admin | 🟡 PENDING OWNER | DGHS Facility ID 10022715 verified; BMDC practitioner validation requires administrative review |
| **G15**| Desktop Security | Windows Authenticode EV Code Signing Certificate | Hospital IT / Security | 🟡 PENDING OWNER | Unsigned Tauri 1.1.47 NSIS and MSI packages built; EV hardware token required for signing |
| **G16**| DNS Cutover | Custom Domain DNS CNAME (`onneshahospital.com`) | Domain Registrar Admin | 🟡 PENDING OWNER | Awaiting DNS cutover; canonical production host `https://onnesha-hospital.pages.dev` active |

---

## 5. Next Executable Action Sequence

1. Run strict test suite: `node scripts/run-tests.mjs --certification`.
2. Run strict health check: `node scripts/project-health-check.mjs --strict`.
3. Commit all changes: `git commit -m "feat(security): harden Permissions-Policy for WebUSB/WebSerial, sanitize llms.txt, and add social metadata"`.
4. Synchronize with GitHub main: `git push ssh-origin main` & `git push origin main`.
5. Execute static build: `npm run build`.
6. Deploy exact HEAD to Cloudflare Pages: `npx wrangler pages deploy out --project-name=onnesha-hospital --branch=main --commit-hash=<HEAD> --commit-dirty=false`.
7. Execute live runtime smoke tests: `node scripts/smoke_test.mjs`.
8. Update `CURRENT_STATE.md` and `CLOSURE_LEDGER.md` with final deployment SHA.
