# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## PRODUCTION CERTIFICATION & RUNTIME AUDIT REPORT

**Document ID:** `DOC-OHMS-CERT-20260916-V3`  
**Generated At:** `2026-09-16T20:07:00+06:00`  
**Repository:** `Adnin1/onnesha-hospital`  
**Commit (HEAD):** `b85a6bb04a64c2f568a08bdd9f1ae50b73fcd138`  
**Branch:** `main` (Synchronized with `origin/main`)  
**Production URL:** https://onnesha-hospital.pages.dev  
**Cloudflare Deployment Revision:** `1d40ee30.onnesha-hospital.pages.dev`  
**Supabase Remote Project:** `iuhtzahuszdkdarhxobx`  
**Canonical Organization UUID:** `a0000000-0000-0000-0000-000000000001`  

---

### Source Truth (Installed Package Stack)

- **Next.js:** `16.3.5` (Static HTML export configured)
- **React / React-DOM:** `19.2.8`
- **Supabase JS SDK:** `@supabase/supabase-js` `^2.116.0`, `@supabase/ssr` `^0.12.7`
- **Supabase CLI:** `2.117.0`
- **Node.js Environment:** `v24.18.0` (NPM: `12.0.1`)
- **Desktop Subsystem:** Tauri `2.0.0`
- **E2E Automation:** `@playwright/test` `^1.63.0`
- **Styling:** `tailwindcss` `^4`

---

### Strict Evidence-Based Quality & Operational Gates

| Domain | Strict Status | Evidence Classification & Details |
|---|---|---|
| **TypeScript Compilation** | **SOURCE VERIFIED** | `tsc --noEmit`: 0 errors |
| **ESLint Static Analysis** | **SOURCE VERIFIED** | `eslint . --quiet`: 0 errors, 0 warnings |
| **Unit & Integration Suite** | **SOURCE VERIFIED** | 325 / 325 tests passed across 36 suites |
| **Browser E2E Automation** | **SOURCE VERIFIED** | 19 / 19 Playwright tests passed in local headless Chromium |
| **Desktop Application (Tauri 2)** | **CONFIG VERIFIED** | `npm run desktop:check`: Config, Cargo.toml & capabilities valid |
| **Static Production Build** | **SOURCE VERIFIED** | 40 / 40 static pages exported into `/out` |
| **Cloudflare Edge Hosting** | **LIVE VERIFIED** | HTTP 200 OK, valid response payload on https://onnesha-hospital.pages.dev |
| **Security Headers (Deployed)** | **CONFIG VERIFIED** | `_headers` rules: HSTS, X-Frame-Options, X-Content-Type-Options |
| **Secret Hygiene Scan** | **SOURCE VERIFIED** | 0 hardcoded secrets in source, client bundles, or scripts |
| **Supabase CLI Authentication** | **BLOCKED** | `LegacyPlatformAuthRequiredError` (Access token required) |
| **Remote Migration Reconciliation**| **BLOCKED** | Cannot run `supabase migration list` without CLI authentication |
| **Remote Database Migration Sync** | **BLOCKED** | Migrations 022–030 pending push to `iuhtzahuszdkdarhxobx` |
| **Live Schema & doctor_schedules** | **BLOCKED** | `PGRST205` - Table not yet present in remote schema cache |
| **Live PostgREST Cache Invalidation**| **BLOCKED** | Awaiting schema reload signal post-migration |
| **Canonical Org Unique Index** | **BLOCKED** | Migration 030 partial unique index pending remote DB execution |
| **Live 10-Way Concurrency Lock** | **BLOCKED** | Real simultaneous race test requires live DB migration 028 |
| **Live RLS Behavioral Tests** | **BLOCKED** | Behavioral allow/deny tests require live linked database session |
| **Live RBAC Behavioral Tests** | **BLOCKED** | Role permission enforcement requires live database session |
| **Live Payment Invariants** | **SOURCE VERIFIED** | HMAC-SHA256 & ledger invariants verified in code; live gateway unverified |
| **Operational Backups / PITR** | **CONFIG VERIFIED** | Managed via Supabase project plan; live project inspection blocked by auth |
| **Service Availability SLA** | **CONFIG VERIFIED** | Edge CDN distribution active; provider SLA claimed, zero downtime not guaranteed |

---

### Final Certification Verdict

**VERDICT:** `BLOCKED — NOT PRODUCTION READY`

**Blocking Prerequisite:**  
Supabase CLI is not authenticated in this execution environment (`LegacyPlatformAuthRequiredError`).  
Per the strict evidence protocol, all source code, automated test suites, browser E2E, and production edge deployment gates are **SOURCE VERIFIED** / **CONFIG VERIFIED**, but **NO LIVE DATABASE GATE IS CERTIFIED** until the operator authenticates the CLI and migrations are pushed to remote project `iuhtzahuszdkdarhxobx`.

### Exact Operator Next Step (Terminal Commands)

```powershell
cd "C:\Users\mahin khan\.gemini\antigravity\scratch\onnesha-hospital"
npx supabase login
npx supabase link --project-ref iuhtzahuszdkdarhxobx
npx supabase migration list
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

PostgREST Schema Reload (Supabase SQL Editor / CLI):
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

