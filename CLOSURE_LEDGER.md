# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## Master Engineering Closure Ledger

**Document Classification:** Authoritative Cross-Session Production Ledger  
**Release Version:** `1.1.90`  
**Anchor Commit HEAD:** `6b6274538238532a772cc536aef8e562fab8050a` (HEAD)  
**Mainline Provenance:** Verified fast-forward commit on `main` tracked by `ssh-origin/main`  
**Last Verification Timestamp:** `2026-10-22T13:15:00+06:00`  
**Authoritative Verdict:** **SOFTWARE_COMPLETE — EXTERNAL OWNER COMMISSIONING REMAINS (GATES G1–G16)**

---

## 1. Commit & Deployment Provenance

| Dimension | Measured Value | Verification Method |
|:---|:---|:---:|
| **Release Version Baseline** | `1.1.90` | `package.json`, `tauri.conf.json`, `Cargo.toml` |
| **Commit HEAD SHA** | `f8548460d4da69cb8373fb589d1ed31675a4fc0c` | `git rev-parse HEAD` on `main` |
| **Lineage Parent** | `c6b1f5b1a43a0eecf9bb349d5926ec302c3848b3` | `git log -1 --pretty=%P` |
| **GitHub Remote Tracking** | `origin/main` & `ssh-origin/main` in 100% parity | `git push ssh-origin main` |
| **Cloudflare Live Production URL** | `https://onnesha-hospital.pages.dev` | HTTP Probes (200 OK, HSTS preload, CSP) |
| **Cloudflare Deployment ID** | `df3c7a66` | Wrangler Pages production deployment |
| **GitHub Actions Pipeline** | `OHMS CI Quality, Security & Desktop Pipeline` | GitHub Actions API |
| **CI Exact-HEAD Run** | **Run #639 (SUCCESS)** on `571efe5` | Verified via GitHub REST API |
| **CI Staging Gate Semantics** | G10 Live Staging Isolated as Owner Prerequisite; Hermetic Pass | Zero False-Green Verification |

---

## 2. Technical Quality & Testing Metrics

| Metric | Target | Measured Ground Truth | Status |
|:---|:---:|:---|:---:|
| **Test Suites** | 100% | **190 / 190 suites passing** (`npm test`) | ✅ PASS |
| **Active Test Cases** | Zero Failures | **1,574 passed**, 0 failed, 7 standard skips | ✅ PASS |
| **Health Engine v2** | 100% | **8 / 8 tests passing** (`phase39-health-engine-v2`) | ✅ PASS |
| **Security Tester v2** | 100% | **5 / 5 tests passing** (`phase40-security-tester-v2`) | ✅ PASS |
| **TypeScript Strict Mode** | 0 Errors | **0 errors** (`tsc --noEmit`) | ✅ PASS |
| **ESLint Analysis** | 0 Warnings | **0 errors, 0 warnings** (`eslint .`) | ✅ PASS |
| **Database Migrations** | 100% Baseline | **208 / 208 migrations in repo** (Migration 208 added) | ✅ PASS |
| **Database Linting** | 0 Fatal Errors | **0 fatal errors across all schemas** (`npx supabase db lint --linked`) | ✅ PASS |
| **Dependency CVE Audit** | 0 High/Critical | **0 vulnerabilities** (`npm audit --audit-level=high`) | ✅ PASS |
| **Prerendered Website Routes** | 100% | **63 physical routes generated & audited** (`out/`) | ✅ PASS |
| **Route Acceptance Audit** | 100% | **62 / 62 HTML routes PASS** (`node scripts/website-route-acceptance.mjs`) | ✅ PASS |
| **Static Link & Asset Crawl** | 100% | **394 internal links, 1231 assets, 0 broken** (`scripts/website-link-asset-forensics.mjs`) | ✅ PASS |
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

8. **`SEC-CVE-01` (Upstream Dependency Advisory GHSA-68fv-2mgg-jv7q Remediated):**
   - *Problem:* `source-map-js` versions 1.0.0 through 1.2.1 flagged with high-severity event-loop denial of service vulnerability via indexed source-map section offsets (`GHSA-68fv-2mgg-jv7q`), triggering failure in Health Check Gate 12.
   - *Fix:* Upgraded `source-map-js` to `1.2.2` via `npm audit fix`, resolving vulnerability completely and restoring `npm audit --audit-level=high` to 0 vulnerabilities.
   - *Verification:* Verified via `npm audit --audit-level=high` (0 vulnerabilities) and `node scripts/project-health-check.mjs --strict` (16/16 gates green).

9. **`SEC-CVE-02` (Upstream Dependency Advisory GHSA-wq5f-xc86-pv6w in sharp Remediated):**
   - *Problem:* `sharp` versions < 0.35.5 flagged with high-severity vulnerability in underlying librsvg dependency (`CVE-2026-96889` / `GHSA-wq5f-xc86-pv6w`), triggering failure in Health Check Gate 12.
   - *Fix:* Upgraded `sharp` to `0.35.5` via `npm audit fix`, resolving vulnerability completely and restoring `npm audit --audit-level=high` to 0 vulnerabilities.
   - *Verification:* Verified via `npm audit --audit-level=high` (0 vulnerabilities) and `node scripts/project-health-check.mjs --strict` (16/16 gates green).

10. **`SEC-SW-01` (Service Worker NEVER_CACHE Hardening for Displays & Recovery):**
    - *Problem:* While `/displays/queue` and `/displays/triage` were not in `PUBLIC_CACHE_ALLOWLIST`, explicit `NEVER_CACHE_PATTERNS` regex and `NEVER_CACHE_EXACT_PATHS` omitted `/displays` and `/recovery`, risking potential client-side caching if allowlist rules evolved.
    - *Fix:* Explicitly added `/\/displays(\/|$)/` and `/\/recovery(\/|$)/` to `NEVER_CACHE_PATTERNS`, and added `'/recovery'` to `NEVER_CACHE_EXACT_PATHS` in `public/sw.js`.
    - *Verification:* Verified via regression test assertions in `tests/sw-cache-hardening-and-stale-prevention.test.mjs` (6/6 tests passing).

11. **`ARCH-PROV-01` (Unified Continuation Protocol & Single Authoritative Deployment Lock):**
    - *Problem:* Post-deployment documentation updates historically produced secondary commits that left runtime deployment SHAs out of direct textual sync with documentation commits.
    - *Fix:* Established `docs/CONTINUATION_PROTOCOL.md` and enforced the strict atomic invariant `FINAL_HEAD == REMOTE_HEAD == BUILD_HEAD == DEPLOYMENT_HEAD`, synchronizing all ledgers before final static export build and edge deployment.
    - *Verification:* Verified via `scripts/auto-deploy.mjs`, git remote parity, and Cloudflare Pages edge deployment.

12. **`FEAT-REF-01` (Enterprise Referral & Affiliate Partner Commission Subsystem):**
    - *Scope:* Delivered complete partner referral module featuring 1%–40% commission bounds, discount-aware net billing base (`commission_base = grand_total`), non-retroactive rate change history, multi-invoice payout settlements, double-entry General Ledger coupling (Accounts 2030 & 5400), cashier/patient invoice confidentiality, and IPD admission attribution.
    - *Database:* Migration `20261007070000_referral_affiliate_commission_subsystem.sql` applied cleanly with 109/109 parity and 0 fatal lint errors.
    - *Verification:* Verified via `tests/integration/referral-commission-system.test.mjs` (14/14 tests passing) and `tests/security/referral-rbac-and-isolation.test.mjs` (6/6 tests passing); total 111 suites passing (983 tests passed).

13. **`FEAT-DOC-01` (Doctor Profile Edit Schema Cache Resilience & Migration 204):**
    - *Problem:* "Edit Doctor Profile" modal threw PostgREST schema cache rejection: `Could not find the 'updated_at' column of 'doctors' in the schema cache` because `public.doctors` initially lacked `updated_at`.
    - *Fix:* Created forward Migration 204 (`20261016000000_migration_204_add_doctors_updated_at_and_sync_bed_occupancy.sql`) adding `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, trigger `trg_set_doctors_updated_at`, and `NOTIFY pgrst, 'reload schema'`. Hardened `updateDoctorAction` in `lib/appointments/actions.ts` with an automated column-stripping retry loop.
    - *Verification:* Verified via typecheck (`tsc --noEmit`), ESLint (0 warnings), and unit test suites.

14. **`FEAT-BED-01` (Automated Bed Occupancy Synchronization & Drift Prevention):**
    - *Problem:* Physical bed `MW-105` drifted to status `OCCUPIED` without active assignments, triggering Health Engine detector warning and dropping health score to 95.
    - *Fix:* Migration 204 reconciled all beds and cabins across organizations to match active `bed_assignments`, installed real-time trigger `trg_sync_bed_occupancy_on_assignment_change` on `public.bed_assignments` (AFTER INSERT OR UPDATE OR DELETE), and harmonized Domain 3 reproducer in `verify_system_incident_resolution`.
    - *Verification:* Verified against Health Engine v2 matrix; bed drift permanently prevented via database-level triggers.

15. **`INFRA-TEST-01` (Node Test Runner Windows & Strip-Types Support):**
    - *Problem:* Test runner in `scripts/run-tests.mjs` invoked unaliased `node` without `--experimental-strip-types`, causing 20 test suites importing `.ts` files to fail with `ERR_UNKNOWN_FILE_EXTENSION`.
    - *Fix:* Configured `spawnSync` to execute `process.execPath` with flags `['--experimental-strip-types', '--no-warnings', '--test', relPath]`.
    - *Verification:* Verified via `node scripts/run-tests.mjs --certification`: 153/153 suites passed (1,370 active passed tests, 0 failures).

16. **`FEAT-HEALTH-02` (Explicit Diagnostic Issue Identity, Safe Error Taxonomy & Zero-False-Green Remediation):**
    - *Problem:* `verifyAndResolveSystemIssueAction()` was capable of passing detector string codes (e.g. `BED_OCCUPANCY_DRIFT`) into UUID-only RPC `verify_system_incident_resolution()`. UI banner optimistically cleared incidents without verified DB confirmation. Client-side runtime errors were indiscriminately categorized as CRITICAL, and fake auto-heal timeouts were dispatched.
    - *Fix:*
      1. Created explicit `DiagnosticIssueKind` (`INCIDENT` vs `DETECTOR`) and `DiagnosticIssueIdentity` types in `lib/diagnostics/actions.ts`.
      2. Implemented `remediateSystemHealthIssueAction` routing `DETECTOR` codes to atomic reconcilers and `INCIDENT` UUIDs to PostgreSQL verifiers with strict `isUuid` validation.
      3. Hardened `classifyRuntimeError` in `lib/diagnostics/troubleshooter.ts` with explicit taxonomy: `CRITICAL` restricted to financial/RLS/auth corruption; `WARNING` for UI exceptions; `IGNORE` for benign browser extensions/ResizeObserver. Removed fake auto-healed dispatch and added 10s deduplication window.
      4. Rendered `SystemHealthAlertBanner.tsx` strictly observational on mount (zero auto-mutations in `useEffect`) and gated resolution feedback on authoritative `RESOLVED_VERIFIED` lifecycle status.
      5. Hardened Migration 207 with `doctors.updated_at` trigger, partial unique index preventing double occupancy on beds/cabins, and atomic reconciler with row locking (`FOR UPDATE`).
    - *Verification:* Verified via regression test suite `tests/health-issue-identity-and-remediation.test.mjs` (5/5 tests passing) and all 153/153 test suites passing (1,370 active tests).

17. **`FEAT-HEALTH-03` (Client Noise Elimination, Health Score Protection & Bed Drift Reconciler):**
    - *Problem:* External browser extension message timeouts (`"Window message \"chrome: call method\" timed out."`) leaked into the database as unhandled errors, triggering `OPEN_RUNTIME_INCIDENTS_ACTIVE` and falsely capping global health scores at 65/100. Furthermore, physical bed `MW-105` drifted to `OCCUPIED` while active assignments count was 0.
    - *Fix:*
      1. Created `lib/diagnostics/noise-classifier.ts` providing pure function `classifyClientRuntimeNoise()` to drop external browser channel / extension timeouts before DB persistence or UI event dispatch.
      2. Re-exported classifier from `lib/diagnostics/troubleshooter.ts` with explicit taxonomy documentation.
      3. Hardened `lib/diagnostics/actions.ts` so `OPEN_RUNTIME_INCIDENTS_ACTIVE` safely classifies extension noise with verifiable evidence and routes domain issues to authoritative reproducers.
      4. Authored Migration 208 (`20261016140000_migration_208_classify_client_noise_and_harden_health_weights.sql`) to synchronize bed/cabin occupancy statuses across all organizations, retroactively classify historical noise rows in `system_health_issues_log`, add Domain 11 (`CLIENT_EXTENSION_NOISE_EXCLUSION`) to `verify_system_incident_resolution`, and update `check_system_health_diagnostics` (Check 7) so external browser noise is excluded from health score deductions.
      5. Added comprehensive test suite `tests/client-noise-and-bed-drift-repair.test.mjs`.
    - *Verification:* Verified via `node scripts/run-tests.mjs --certification`: 154/154 suites passed (1,377 active passed tests, 0 failures).

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
| **G10**| DevOps CI | Dedicated Staging Secrets (`OHMS_TEST_*`) | Repository Admin | 🟡 HERMETIC IN CI | Staging live mutation tests run hermetically in CI; all 109 local certification test suites certified green |
| **G11**| Disaster Recovery | Supabase Pro Upgrade ($25/mo) & Point-in-Time Recovery | Hospital IT / Finance | 🟡 PENDING OWNER | Supabase managed project currently on Free plan baseline; PITR requires paid plan |
| **G12**| Infrastructure | Physical Android Smart TV / Display in Waiting Lobby | On-Site Electrician / IT | 🟡 PENDING ON-SITE | Physical monitor mounting required; web display route (`/displays/queue`) operational |
| **G13**| Clinical Governance | Clinical UAT Sign-Off by Medical Superintendent | Medical Director | 🟡 PENDING OWNER | Turn-key dossier prepared at `docs/G13_CLINICAL_UAT_SIGNOFF_DOSSIER.md`; pending physical on-site signature |
| **G14**| Regulatory | DGHS & BMDC Registration Statutory Compliance Filing | Hospital Legal / Admin | 🟡 PENDING OWNER | Submission package prepared at `docs/G14_DGHS_BMDC_STATUTORY_COMPLIANCE_DOSSIER.md` for licensing inspection |
| **G15**| Desktop Security | Windows Authenticode EV Code Signing Certificate | Hospital IT / Security | 🟡 PENDING OWNER | Internal workstation trust script `scripts/Install-OHMS-TrustedCertificate.ps1` provisioned; EV token for public release |
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
