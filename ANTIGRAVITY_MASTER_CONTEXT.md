# ANTIGRAVITY MASTER CONTEXT & AUTONOMOUS RECONNAISSANCE PROTOCOL

**Authoritative Project:** Onnesha Hospital Management System (OHMS)  
**Repository:** `Adnin1/onnesha-hospital` (Git remotes: `origin` & `ssh-origin` -> `git@github.com:Adnin1/onnesha-hospital.git`)  
**Production Edge:** [`https://onnesha-hospital.pages.dev`](https://onnesha-hospital.pages.dev) (Cloudflare Pages Project: `onnesha-hospital`)  
**Database (Supabase Production Ref):** `iuhtzahuszdkdarhxobx` (PostgreSQL 15+, 136/136 Migrations Synchronized)  
**Current Certified Release:** `v1.1.75`  
**Primary Git Branch:** `main`  

---

## 1. System Architecture & Topology

- **Frontend / Client Tier:** Next.js (App Router, Static HTML Export `out/`), React 19, Tailwind CSS, Lucide Icons.
- **Edge CDN & Hosting:** Cloudflare Pages with global static edge caching, Service Worker offline fallback (`public/sw.js`), and strict HTTP security headers.
- **Backend & Database Tier:** Supabase PostgreSQL with 100% forward migrations (127 migrations), Row-Level Security (RLS) on all 67 domain tables, multi-tenant isolation via `organization_id`, and hardened `SECURITY DEFINER` RPCs.
- **Authentication & RBAC:** Supabase Auth (SSR Cookie/Bearer), 12 system roles (Receptionist, Doctor, Nurse, Pharmacist, Lab Technician, Radiologist, Billing Officer, Accountant, Ward Manager, Hospital Admin, Super Admin, System Auditor).
- **Desktop Client Tier:** Tauri 2 (Rust / Webview2 / MSVC), WiX MSI and NSIS executable installers (`src-tauri/`), Windows desktop manifest (`public/downloads/desktop/latest.json`).

---

## 2. Source-of-Truth Hierarchy (Rule 0.1)

In any Antigravity session, resolve facts strictly in this precedence order:
1. **LIVE GitHub Repository Refs:** `git rev-parse HEAD`, `origin/main`, `ssh-origin/main`, release tags (`git tag -l`), and GitHub Actions workflow runs.
2. **LIVE Supabase Runtime:** Remote migration history (`supabase_migrations.schema_migrations`), table schemas, RLS policies, and RPC definitions.
3. **LIVE Cloudflare Edge Runtime:** Production HTTP status, TLS certificates, service worker versions, and asset delivery at `https://onnesha-hospital.pages.dev`.
4. **Current Checked-Out Source Files & Local Tests:** `package.json`, `npm run typecheck`, `npm run test:certification`.
5. **Project Context Files:** `ANTIGRAVITY_MASTER_CONTEXT.md` and `docs/AUTONOMOUS_CLOSURE_LEDGER.md`.
6. **Historical Chat Transcripts / Old Summaries:** Telemetry only; never override live mathematical truth.

---

## 3. Strict Non-Destructive Git Rules (Rule 0.3)

- **Absolute Ban on Force Pushes:** Never execute `git push --force` or `git reset --hard` on published commits.
- **Tag Immutability:** Never overwrite, delete, or move historical release tags (`v1.1.4`, `v1.1.58` through `v1.1.70`).
- **Synchronized Remotes:** Always push commits and tags to both `origin` and `ssh-origin`.

---

## 4. Forward-Only Database Evolution

- **Zero Destructive Migrations:** Never drop live tables, recreate schemas destructively, or reset the remote Supabase database.
- **Parity Verification:** Remote migration count must exactly equal local migration files in `supabase/migrations/`.
- **SECURITY DEFINER Standards:**
  - `SET search_path = ''` or `SET search_path = public, pg_temp` must be explicitly declared on every stored procedure.
  - All database objects must be explicitly schema-qualified (`public.tablename`).
  - Strict caller authorization checks (`auth.uid()`, role, and tenant membership) inside procedure bodies.
  - Revoke default execution privileges from `PUBLIC` and grant only to `authenticated` or `service_role`.

---

## 5. Website Content Truth & Governance (Rule 15)

- **NAP Single Source of Truth:** `config/hospital.ts` is the authoritative source for hospital naming, contact numbers, and identifiers.
- **Physical Landmark Verification Boundary:** The physical address discrepancy between repository default ('Khandar / Sonali Bank') and directory citations ('Mofiz Paglar Mor / Sherpur Road') is an owner property deed verification boundary (Gate G14).
- **Conservative Structured Data:** `components/public/HospitalJsonLd.tsx` publishes verified locality (`Bogura`, `Rajshahi Division`, `BD`) and omits unconfirmed landmark street addresses from Schema.org JSON-LD to prevent indexing untruthful metadata.
- **Logo Integrity:** Verified logo at `/logo.png` (HTTP 200 OK, 14,295 bytes).

---

## 6. Zero False-Green CI/CD Semantics

GitHub Actions workflow (`.github/workflows/ci.yml`) is architected with explicit gates that never falsify success:
1. **Mandatory CI Gate:** Always executes typecheck, lint, security vulnerability audit, static export, asset crawl, 123 test suites (1,112 active passes), and 4-browser Playwright matrix (Chromium, Firefox, Mobile Chrome, WebKit).
2. **Live Staging Security Gate (G10):** Clearly outputs `EXECUTED_AND_PASSED` when staging secrets exist, or `NOT_EXECUTED_EXTERNAL_OWNER_REQUIRED` when unconfigured. Never claims pass when skipped.
3. **Production Deployment Gate:** Outputs `DEPLOYED` on automated CI deployment, or `BLOCKED_OWNER_CREDENTIALS_REQUIRED` when GitHub secrets are unprovisioned (workstation deployment maintained via authenticated Wrangler CLI).
4. **Desktop Build Gate:** Outputs `BUILT_AND_ARTIFACT_VERIFIED` when built in CI, or `BLOCKED_OWNER_CONFIGURATION` when awaiting secrets.
5. **Release Gate:** Publishes GitHub Release with release notes and manifest on tag events even when desktop compilation waits on owner secrets.

---

## 7. External Owner Gates Ledger (G1–G16)

Operational prerequisites that require hospital owner intervention and cannot be solved with software automation:
- **G1:** Live Payment Gateway Credentials (bKash, SSLCommerz, Nagad merchant accounts)
- **G2:** Bulk SMS Provider Gateway API Key
- **G3:** WhatsApp Business Cloud API Key
- **G4:** Hospital SMTP Email Credentials
- **G5:** Physical 80mm ESC/POS Thermal Receipt Printers
- **G6:** Physical 2D Handheld USB/Bluetooth Barcode Scanners
- **G7:** Physical ZKTeco Biometric Clocking Devices on LAN
- **G8:** Physical DICOM PACS Modality AE Title Routing
- **G9:** Physical LIS Laboratory Analyzers (Serial/TCP interfaces)
- **G10:** GitHub Actions Repository Secrets for Staging (`OHMS_TEST_*`)
- **G11:** Supabase Pro Point-in-Time Recovery (PITR) Subscription
- **G12:** Physical Android Smart TV Queue Displays
- **G13:** Hospital Superintendent Clinical UAT Sign-Off
- **G14:** DGHS Statutory Licensing and BMDC Medical Council Compliance Filings
- **G15:** Windows Authenticode EV Code Signing Certificate & Hardware Token
- **G16:** Hospital Custom Domain DNS CNAME Cutover

---

## 8. Fast Future-Session Resume Protocol

Any subsequent Antigravity session MUST follow this 60-second protocol instead of re-auditing from scratch:
1. Read `ANTIGRAVITY_MASTER_CONTEXT.md` and `docs/AUTONOMOUS_CLOSURE_LEDGER.md`.
2. Run `git status -s`, `git rev-parse HEAD`, and `git describe --tags`.
3. Check remote migration count against local migrations (`127 / 127`).
4. Check live edge health at `https://onnesha-hospital.pages.dev`.
5. Check if any owner gates (G1–G16) have been resolved.
6. Proceed directly to the requested task with zero redundant investigation.
