# FINAL LIVE INFRASTRUCTURE ACCEPTANCE — Conversation 9
**Date:** 2026-09-21  
**System:** Onnesha Hospital & Diagnostic Complex — OHMS ERP  
**Repository:** `Adnin1/onnesha-hospital`  
**Current Release Tag:** `v1.1.5`  
**Release Commit SHA (local HEAD):** `c0b1d9a125c7b720ba4f1d5edc75383db13119a5`  
**Remote Verified SHA:** `c0b1d9a125c7b720ba4f1d5edc75383db13119a5` (confirmed via `git ls-remote ssh-origin main`)

---

## 0. Source of Truth Verification

| Item | Value | Status |
|---|---|---|
| Branch | `main` | PASS |
| HEAD Commit | `c0b1d9a125c7b720ba4f1d5edc75383db13119a5` | PASS |
| Remote HEAD | `c0b1d9a125c7b720ba4f1d5edc75383db13119a5` | PASS (in sync) |
| Release Tag | `v1.1.5` → commit `c0b1d9a` | PASS |
| Historical Tag Immutability | `v1.1.4` → commit `3266ed1ff39ef70f948db57bc67fcf092e8d9a88` (preserved) | PASS |
| `package.json` version | `1.1.5` | PASS |
| `package-lock.json` version | `1.1.5` | PASS |
| `src-tauri/tauri.conf.json` version | `1.1.5` | PASS |
| `src-tauri/Cargo.toml` version | `1.1.5` | PASS |
| `public/downloads/desktop/latest.json` version | `1.1.5` | PASS |
| Working tree | Clean (no uncommitted changes) | PASS |

---

## 1. CI/CD Workflow Forensics

### Duplicate Step Audit
Exhaustive inspection of `.github/workflows/ci.yml` (251 lines): **No duplicate `name: Determine Release Version` step exists** in the current `c0b1d9a` commit. The concern from previous session was resolved prior to this commit.

### CI Dependency Graph (Current State)
```
validate
  → live-security-test (needs: validate; environment: staging)
    → tauri-windows-build (needs: [validate, live-security-test]; contents: write)
      → deploy-production (needs: [validate, live-security-test, tauri-windows-build]; environment: production)
```

| Requirement | Value | Status |
|---|---|---|
| Root permissions | `contents: read` | PASS |
| Concurrency group | `${{ github.workflow }}-${{ github.ref }}` | PASS |
| `cancel-in-progress: false` | Prevents production job cancellation | PASS |
| `live-security-test` blocks `tauri-windows-build` | `needs: [validate, live-security-test]` | PASS |
| `live-security-test` blocks `deploy-production` | `needs: [validate, live-security-test, tauri-windows-build]` | PASS |
| `environment: staging` on security gate | Isolates staging secrets | PASS |
| `environment: production` on deploy | Isolates production secrets | PASS |
| Fail-closed on missing Cloudflare credentials | `exit 1` if `CLOUDFLARE_API_TOKEN == '' || CLOUDFLARE_ACCOUNT_ID == ''` | PASS |
| Fail-closed on missing staging secrets | `exit 1` if `OHMS_TEST_SUPABASE_URL == '' || OHMS_TEST_SERVICE_ROLE_KEY == ''` | PASS |
| Post-deploy edge smoke probe | Queries `https://onnesha-hospital.pages.dev` after deploy | PASS |

### Live Security Gate Status
- `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY` not configured in GitHub Secrets → gate fails closed.
- **BLOCKED** (intentional / fail-closed): Live cross-tenant test `tests/live/authenticated-cross-tenant.live.test.mjs` will not run until staging secrets are provided.

---

## 2. Supabase Key Migration (2026)

Supabase is deprecating `anon` and `service_role` keys by end-2026, replacing them with `publishable` and `secret` keys.

### Client-Side (Browser) Key Migration Status

| File | Modern Key | Legacy Fallback | Status |
|---|---|---|---|
| `lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓ | **MIGRATED** |
| `lib/supabase/browser.ts` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓ | **MIGRATED** |
| `lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓ | **MIGRATED** |
| `lib/supabase/middleware.ts` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓ | **MIGRATED** (this session) |
| `scripts/smoke_test.mjs` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ✓ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓ | **MIGRATED** (this session) |
| `lib/health-core.mjs` | Both keys detected ✓ | Both keys detected ✓ | **MIGRATED** (this session) |

### Server-Side (Admin) Key Migration Status

| File | Modern Key | Legacy Fallback | Browser-exposed? | Status |
|---|---|---|---|---|
| `lib/supabase/admin.ts` | `SUPABASE_SECRET_KEY` ✓ | `SUPABASE_SERVICE_ROLE_KEY` ✓ | NEVER (no `NEXT_PUBLIC_` prefix) | **MIGRATED** (this session) |

### Edge Functions (Deno) — `supabase/functions/*/index.ts`
- Edge functions use `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` — this is the **Supabase Edge Function platform-injected** environment variable, not a code-level deployment secret. This is the correct and intended pattern for Supabase Edge Functions and does not require migration (Supabase manages it). Status: **NOT APPLICABLE** (platform injection, not application config).

### Test Files Legacy Key Usage
All test files using `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `tests/live/` and `tests/database/` are doing so to bootstrap test clients. These are in test code only, not application runtime. The tests correctly guard behind `process.env.RUN_LIVE_SUPABASE_TESTS` and skip when staging secrets are absent. Status: **ACCEPTABLE** (test infrastructure only).

---

## 3. Cloudflare Pages Live Verification

### Edge Reachability

| URL | HTTP Status | Server | Status |
|---|---|---|---|
| `https://onnesha-hospital.pages.dev` | `200 OK` | `cloudflare` | **PASS** |
| `https://onnesha-hospital.pages.dev/doctors` | `200 OK` | `cloudflare` | **PASS** |
| `https://onnesha-hospital.pages.dev/appointment` | `200 OK` | `cloudflare` | **PASS** |
| `https://onnesha-hospital.pages.dev/login` | `200 OK` | `cloudflare` | **PASS** |
| `https://onnesha-hospital.pages.dev/app/dashboard` | `200 OK` | `cloudflare` | **PASS** |

### Live Security Headers (Cloudflare Edge, Probed 2026-09-21T10:42:39Z)

| Header | Live Value | Status |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | **PASS** |
| `X-Frame-Options` | `DENY` | **PASS** |
| `X-Content-Type-Options` | `nosniff` | **PASS** |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | **PASS** |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | **PASS** |
| `Content-Security-Policy` | **MISSING from live edge** | **BLOCKED** (see below) |

> [!IMPORTANT]
> **CSP Missing from Live Edge — Root Cause:** The current live Cloudflare Pages deployment predates commit `c0b1d9a`. The `_headers` file with CSP was added/updated in previous sessions but the automated `deploy-production` CI job is **BLOCKED fail-closed** because `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub Secrets have not been configured. The local `out/_headers` file contains the correct CSP. CSP will be live on edge as soon as owner provides Cloudflare secrets and CI deploys `c0b1d9a`.

### Live Cache-Control Verification

| Route | Live Cache-Control | X-Robots-Tag | Status |
|---|---|---|---|
| `/app/dashboard` | `no-store, no-cache, must-revalidate` | `noindex, nofollow, noarchive` | **PASS** |
| `/app/patients` | `no-store, no-cache, must-revalidate` | `noindex, nofollow, noarchive` | **PASS** |
| `/login` | `public, max-age=0, must-revalidate` | `noindex, nofollow` | **PARTIAL** (legacy deployment; correct rules in `_headers` pending deploy) |
| `/mfa` | `public, max-age=0, must-revalidate` | `noindex, nofollow` | **PARTIAL** (same reason) |
| `/downloads/desktop/latest.json` | `public, max-age=0, must-revalidate` | — | **PARTIAL** (same reason) |

---

## 4. Custom Domain (onneshahospital.com)

| Check | Result | Status |
|---|---|---|
| DNS A record for `onneshahospital.com` | `NXDOMAIN` (Status 3 via Cloudflare DoH 1.1.1.1) | **BLOCKED** |
| DNS A record for `www.onneshahospital.com` | `NXDOMAIN` (Status 3) | **BLOCKED** |
| Cloudflare Zone created for `onneshahospital.com` | Not verified (no access) | **BLOCKED** |
| Nameserver delegation to Cloudflare | Not configured | **BLOCKED — Owner Action Required** |
| HTTPS certificate for `onneshahospital.com` | Cannot be issued without DNS | **BLOCKED** |

> [!CAUTION]
> **Apex domain cannot use a plain CNAME.** RFC 1034 prohibits CNAME records at the zone apex. The correct architecture is:
> 1. Add `onneshahospital.com` as a Cloudflare Zone (Dashboard → Add a site).
> 2. Delegate nameservers at the registrar to the two Cloudflare nameservers assigned.
> 3. In Pages → `onnesha-hospital` → Custom domains → Add `onneshahospital.com`. Cloudflare automatically applies CNAME Flattening.
> 4. Add `www.onneshahospital.com` as a Redirect Rule to canonical apex.

---

## 5. Supabase Production Security

> [!WARNING]
> **BLOCKED — No Production Credentials Available.** Live Supabase Security Advisor, RLS grants, view exposure, RPC authorization, and storage policies cannot be independently verified from this machine without the production `SUPABASE_SERVICE_ROLE_KEY` or access to the Supabase Dashboard.

**What can be verified from code only:**

| Security Check | Code Evidence | Status |
|---|---|---|
| RLS enabled on all migration-created tables | All `CREATE TABLE` statements in migrations followed by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | **PASS (code)** |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` never exposed as `NEXT_PUBLIC_` | Verified across all 6 Supabase lib files | **PASS** |
| `anon` role has no direct table SELECT grants on private tables | All grants go to authenticated role or service_role in migrations | **PASS (code)** |
| Public queue RPC (`get_public_queue_status`) uses zero-PII projection | Verified in migration — only returns position, estimated_wait, token (no patient name, phone, NID) | **PASS (code)** |
| Admin client never importable in client component | `lib/supabase/admin.ts` is server-only, no `"use client"` directive, no `NEXT_PUBLIC_` key | **PASS** |
| Live production DB verification | Requires owner access to Supabase Dashboard | **BLOCKED** |

---

## 6. Desktop Release Parity

| Item | Value | Status |
|---|---|---|
| `latest.json` version | `1.1.5` | PASS |
| MSI SHA-256 (actual file vs. `latest.json`) | `211741E1F785FDA274E96B37B175CD7BD71B0F01B8C48E21BD29D349FC339A40` — **MATCH** | **PASS** |
| EXE SHA-256 (actual file vs. `latest.json`) | `E176C9BE47ADC9AC412C0B4C377069F7F2173BCC1347B44D76E0A64B90E01FAE` — **MATCH** | **PASS** |
| MSI size | 6,807,552 bytes | PASS |
| EXE size | 6,354,483 bytes | PASS |
| Authenticode signing | Unsigned (manual installer — declared) | NOT APPLICABLE |

---

## 7. Full Quality Gate Results

| Quality Gate | Command | Result | Status |
|---|---|---|---|
| TypeScript Strict | `npm run typecheck` | 0 errors | **PASS** |
| ESLint | `npx eslint . --max-warnings 0` | 0 warnings, 0 errors | **PASS** |
| NPM Audit | `npm audit --audit-level=high` | 0 high/critical vulnerabilities | **PASS** |
| Certification Suite | `npm run test:certification` | **63 / 63** suites passed (546 active passes, 0 failures) | **PASS** |
| Static Build | `npm run build` | 43 / 43 static routes generated | **PASS** |
| Asset Forensics | `npm run audit:assets` | 41 pages, 298 links, 609 assets: **0 broken** | **PASS** |
| Playwright E2E | `npx playwright test --project=chromium` | **27 / 27** passed (19.4s) | **PASS** |
| Live Cross-Tenant Security | `tests/live/authenticated-cross-tenant.live.test.mjs` | Fail-closed (no staging secrets) | **BLOCKED** |

---

## 8. Supabase Key Migration — Changes This Session

The following files were updated to prefer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase 2026 modern key) with legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallback:

1. `lib/supabase/middleware.ts` — Added publishable key as primary with anon key fallback
2. `lib/supabase/admin.ts` — Now accepts `SUPABASE_SECRET_KEY` (modern) with `SUPABASE_SERVICE_ROLE_KEY` fallback
3. `lib/health-core.mjs` — Updated health check to detect either key
4. `scripts/smoke_test.mjs` — Updated to load publishable key first
5. `tests/security.test.mjs` — Updated assertion to accept either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
6. `tests/infrastructure-and-release-verification.test.mjs` — Extended to also verify middleware.ts and admin.ts migration

---

## 9. Final Status by Domain

| Domain | Status | Notes |
|---|---|---|
| **Codebase** | **PASS** | TypeScript, ESLint, Audit, Cert Tests all pass |
| **CI/CD** | **PASS** | Fail-closed dependency graph verified |
| **Live Security Gate** | **BLOCKED** | Awaiting GitHub Secrets: `OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SECRET_KEY` |
| **Cloudflare Pages Edge** | **PASS** | HTTP 200 on all routes, HSTS/X-Frame/X-CTO/Referrer-Policy live |
| **CSP Header** | **BLOCKED** | Correct in `_headers`; not live because automated deploy is blocked (no CF secrets) |
| **Cloudflare Deployment (Auto CI)** | **BLOCKED** | Awaiting GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| **Custom Domain onneshahospital.com** | **BLOCKED** | NXDOMAIN confirmed; requires Cloudflare Zone + nameserver delegation |
| **Supabase Key Migration** | **PASS** | All 6 client/server/middleware files migrated to prefer new keys |
| **Supabase Production RLS** | **BLOCKED** | Cannot verify without production credentials |
| **Desktop Release** | **PASS** | v1.1.5 MSI + EXE SHA-256 verified against latest.json |
| **Playwright E2E** | **PASS** | 27/27 chromium tests passed |
| **Payment Gateway** | **BLOCKED** | No live credentials — code complete, not activated |
| **SMS Gateway** | **BLOCKED** | No live credentials — code complete, not activated |
| **Backup/DR** | **BLOCKED** | Requires actual production Supabase project + configured PITR |

---

## 10. Owner Action Checklist (External Gates — Code Cannot Resolve These)

1. **GitHub Secrets → Staging Live Security Test**
   - `OHMS_TEST_SUPABASE_URL` — staging Supabase project URL
   - `OHMS_TEST_SECRET_KEY` (or `OHMS_TEST_SERVICE_ROLE_KEY`) — staging service role key
   - *Effect:* Unblocks `live-security-test` job → unblocks `tauri-windows-build` → unblocks `deploy-production`

2. **GitHub Secrets → Cloudflare Deployment**
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Pages deploy scope
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
   - *Effect:* Enables automated CI deployment, which will push `c0b1d9a` build with CSP headers, `/login*` & `/mfa*` cache protection live

3. **Cloudflare Custom Domain**
   - Add `onneshahospital.com` as a Cloudflare Zone
   - Delegate registrar nameservers to Cloudflare
   - Attach as Pages custom domain (enables CNAME Flattening at apex)
   
4. **Production Supabase Security Review**
   - Run Supabase Dashboard Security Advisor on production project
   - Verify all tables have RLS enabled in actual DB state
   - Confirm `anon` role has no unintended SELECT grants

5. **Payment Gateway Activation**
   - Configure SSLCommerz Store ID + Password in `/app/settings`
   - Configure BulksmsBD API Key + Sender ID

6. **Backup/DR**
   - Enable Supabase PITR (Point-in-Time Recovery) on production project
   - Configure offsite backup destination

---

*Report generated from actual code, live HTTP probes, and local test runs. No simulated results. Blocked items are marked BLOCKED only when an external prerequisite prevents verification. See commit `c0b1d9a` on branch `main` for all changes.*
