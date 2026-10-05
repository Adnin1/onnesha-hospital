# OHMS PERMANENT ENGINEERING GOVERNANCE

**System:** Onnesha Hospital Management System (OHMS)  
**Classification:** Authoritative Engineering Governance & Operating Standards  
**Status:** ACTIVE & PERMANENT  
**Effective Date:** 2026-10-06  

---

## 1. Absolute Source-of-Truth Hierarchy

All engineering agents, contributors, and automated pipelines must observe the following strict order of precedence when resolving truth, assertions, and verification:

1. **Live Runtime State:** Live HTTP responses, active WebSocket connections, and real-time edge telemetry.
2. **Live GitHub State:** Remote branch HEAD (`origin/main`), GitHub Actions Check Runs API (`/check-runs`), and official GitHub Releases objects.
3. **Live Supabase State:** Remote database schema, active PostgreSQL extensions, migrations table, active RLS policies, and Security Definer functions.
4. **Live Cloudflare Deployment:** Active deployment ID, verified source commit SHA, and edge headers/redirects on `*.pages.dev`.
5. **Current Repository Files & Tests:** Clean git working tree, deterministic test suite outputs (`node:test`, Playwright).
6. **Current Engineering Ledgers:** `CURRENT_STATE.md`, `AUTONOMOUS_CLOSURE_LEDGER.md`.
7. **Historical Reports:** Artifacts and session logs (treated as telemetry, NEVER as forward proof).
8. **Memory & Assumptions:** Zero evidential weight.

---

## 2. Zero-False-Green Policy

1. **Empirical Evidence Invariant:**
   - A green UI state or status assertion must represent mathematical and physical truth.
   - A module (e.g. ZKTeco biometrics, DICOM PACS, LIS) must NEVER display `CONNECTED` or `ONLINE` unless physical packets have been exchanged with real on-site hardware.
   - When running without physical hardware, the UI and telemetry must truthfully display `STANDBY (Loopback Testbed Ready • Gate G7 Pending)` or `SIMULATION READY`.
2. **Credentials & Payments:**
   - Payment gateways (bKash, SSLCommerz, Nagad) must never show `LIVE` or record synthetic "paid" invoices in production without real merchant credentials and IPN validation.
3. **Desktop Artifact Provenance:**
   - A desktop binary must NEVER be marked `CI VERIFIED` or `CI BUILT` if it was only compiled on a local machine. It must be designated `built_locally_verified` and `PENDING_CI_BUILD` on public distribution portals until CI release jobs attach signed binaries.
4. **Accessibility Claims:**
   - Never claim "100% WCAG AA Certified". State truthfully: "Audited and verified against WCAG 2.2 AA criteria (landmarks, focus rings, 44x44px touch targets, zero raw dialogs)".

---

## 3. Database Migration & RLS Security Invariants

1. **Forward-Only Migrations:**
   - NEVER edit or mutate an existing, applied Supabase migration file.
   - Schema updates, fixes, and rollbacks must be implemented via new forward migrations (e.g. `YYYYMMDDHHMMSS_name.sql`).
2. **Row-Level Security (RLS):**
   - Every public table must have `ROW LEVEL SECURITY` explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
   - Every policy must enforce tenant isolation using `organization_id = get_current_org_id()`.
   - Never use `USING (true)` or `WITH CHECK (true)` on tenant-partitioned write paths.
3. **Security Definer Function Safety:**
   - Every `SECURITY DEFINER` PostgreSQL function must specify `SET search_path = ''` or explicit safe schema paths to prevent search_path hijacking attacks.
4. **Financial Double-Entry Invariant:**
   - All financial transactions and disbursements must adhere to double-entry accounting: Debits must strictly equal Credits.
   - Stock and inventory movements must use transaction locks to prevent negative inventory balances.

---

## 4. Next.js Static Export & Cloudflare Edge Invariants

1. **Static Export Preservation:**
   - Next.js must build with `output: 'export'` without server-side runtime dependencies (no request-bound Route Handlers, no dynamic cookies, no Server Actions requiring node runtime).
   - Dynamic routing must provide static paths via `generateStaticParams()` or client-side hash/query navigation.
2. **Cloudflare Headers & Redirects:**
   - `public/_headers` must strictly enforce:
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `Content-Security-Policy`: Must NOT contain `unsafe-eval`.
     - `Permissions-Policy`: Restricts camera, microphone, geolocation to `()`, and scopes payment, usb, and serial to `self` as required by clinical hardware interfaces.
   - `public/_redirects` must be kept free of redirect chains and infinite loops.
3. **Deployment Guarantee:**
   - Cloudflare Pages deployments must be executed with `--commit-dirty=false` from a clean git working tree matching remote `main`.

---

## 5. Desktop Application (Tauri) Provenance Chain

1. **Release Provenance Chain:**
   ```
   Source Git SHA -> Version Sync -> Tauri Build -> Hash Generation (SHA-256) -> GitHub Release Asset -> latest.json Manifest -> Public Download Page
   ```
2. **Version Synchronization:**
   - `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` versions must always remain 100% synchronized.
3. **Binary Git Hygiene:**
   - Binaries (`*.exe`, `*.msi`, `*.app`, `*.deb`) must NEVER be committed to the Git repository. They are built and stored in release targets and published to GitHub Releases.

---

## 6. External & Operational Commissioning Gates (G1–G16)

The software organization recognizes a strict boundary between automatable software engineering and physical/commercial owner boundaries:

- **G1: Payment Gateway Credentials** (bKash, SSLCommerz, Nagad live merchant keys)
- **G2: SMS Gateway Credentials** (Bulk SMS provider API keys)
- **G3: WhatsApp Business Cloud API** (Meta WhatsApp Business token & phone ID)
- **G4: SMTP Server Configuration** (Hospital email server / SendGrid credentials)
- **G5: Physical Thermal Receipt Printers** (On-site USB/Serial 80mm ESC/POS hardware)
- **G6: Physical 2D Barcode Scanners** (On-site handheld USB/Bluetooth hardware)
- **G7: Physical ZKTeco Biometric Terminals** (On-site LAN IP routing & hardware terminals)
- **G8: Physical DICOM PACS Modalities** (Hospital CT/X-Ray PACS modality endpoints)
- **G9: Physical LIS Analyzers** (On-site laboratory analyzer serial/TCP connections)
- **G10: GitHub Staging Secrets** (`OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SERVICE_ROLE_KEY`)
- **G11: Supabase Backup & PITR** (Supabase Pro Point-in-Time Recovery infrastructure)
- **G12: Physical Queue TV Displays** (Waiting room Android TV / HDMI display units)
- **G13: Clinical UAT Sign-Off** (Hospital Superintendent and clinical director sign-off)
- **G14: Statutory Compliance Sign-Off** (DGHS Facility 10022715 & BMDC regulatory filings)
- **G15: Authenticode EV Code Signing** (Hardware token / HSM for Windows EXE/MSI signing)
- **G16: Custom Domain DNS Cutover** (Owner DNS A/CNAME record cutover to Cloudflare)

---

## 7. Mandatory Verification Toolchain

Before committing or releasing any modification, the following verification commands must pass:

```bash
# 1. Type Safety
npm run typecheck

# 2. Code Quality
npm run lint

# 3. Security Audit
npm audit --audit-level=high

# 4. Strict Quality Gates (16 Gates)
node scripts/project-health-check.mjs --strict

# 5. Core Test Suite (109 Suites)
npm run test:certification

# 6. Hardware Abstraction Suites (28 Tests)
node --test tests/hardware/*.test.mjs

# 7. Static Build & Asset Forensics
npm run build
npm run audit:routes
npm run audit:assets

# 8. Real Browser Multi-Engine E2E (52 Specs across 4 Engines)
npx playwright test
```
