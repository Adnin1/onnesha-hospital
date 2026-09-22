# OHMS ERP: Independent Final Production Certification & Release Lock (2026)

**Target System:** Onnesha Hospital & Diagnostic Complex (OHMS ERP v1.1.5)  
**Verification Date:** September 22, 2026  
**Auditor Mode:** Independent Principal Release Auditor & Final Certification Authority  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  
**Short Git Commit:** `75188a8`  
**Git Branch:** `main` (Synchronized with `ssh-origin/main`)  
**Production Host:** `https://onnesha-hospital.pages.dev`  
**Active Edge Deployment:** `https://14172efd.onnesha-hospital.pages.dev`  
**Database Cluster:** Supabase PostgreSQL 17.6.1 (`iuhtzahuszdkdarhxobx`)  

---

## 1. Master Release Classification Matrix

| Dimension | Scope / Target | Result | Status |
|---|---|---|---|
| **Source Integrity** | Git `main` branch clean working tree | Zero unstaged changes; SHA: `75188a8` | **PASS** |
| **Code Quality** | TypeScript strict mode (`npm run typecheck`) | 0 compilation errors across 43 pages | **PASS** |
| **Lint & Style** | ESLint (`npx eslint . --max-warnings 0`) | 0 errors, 0 warnings | **PASS** |
| **High Vulnerabilities** | NPM Audit (`npm audit --audit-level=high`) | 0 vulnerabilities found | **PASS** |
| **Certification Suites** | Test Runner (`npm run test:certification`) | **65 / 65 test suites (563 active passes, 0 fail, 0 blocked)** | **PASS** |
| **Static Build** | Next.js export (`npm run build`) | 43 / 43 pages generated | **PASS** |
| **Asset Forensics** | Static link crawler (`npm run audit:assets`) | 41 HTML pages, 299 internal links, 616 assets: 0 broken | **PASS** |
| **Browser E2E** | Playwright Chromium (`tests/browser/*.spec.ts`) | **27 / 27 passed** (22.1s) | **PASS** |
| **Cloudflare Pages** | Live edge at `onnesha-hospital.pages.dev` | Active deployment `14172efd` serving HTTP 200 on all routes | **PASS** |
| **Edge Security Headers** | HSTS, CSP, X-Frame-Options, Referrer-Policy | Verified live HTTP 200 on all endpoints; `X-Frame-Options: DENY` | **PASS** |
| **Measured Performance** | Live Chrome PerformanceObserver on edge | CLS: 0.0000 - 0.0395 across all core routes, LCP: 292ms - 504ms | **PASS** |
| **Database Migrations** | Supabase remote sync (`iuhtzahuszdkdarhxobx`) | **57 / 57 migrations applied & verified** | **PASS** |
| **Database Integrity** | Migration 57: Strict cumulative 3-way match & concurrency | 0-line fallback eliminated; cumulative consumption enforced | **PASS** |
| **RLS Security** | Tenant isolation and role restrictions across tables | Enforced on all public tables via `private.get_current_org_id()` | **PASS** |
| **PII & Privacy** | Public traffic and CacheStorage inspection | 0 PII leaks, 0 private cache leaks | **PASS** |
| **Desktop Installers** | WiX MSI & NSIS EXE cryptographic hashes | Exact match with `latest.json` | **PASS** |
| **Production Domain** | Canonical host `https://onnesha-hospital.pages.dev` | Active live edge, SSL, HSTS, sub-500ms LCP | **PASS** |
| **Custom Apex Domain** | Future domain (`onneshahospital.com`) | Decoupled cleanly until domain is acquired and DNS delegated | **N/A** |
| **Branch Protection** | GitHub `main` branch protection rules | Requires repository owner UI configuration | **BLOCKED** |
| **Staging Live Security** | CI isolated staging credentials | Requires owner injection of `OHMS_TEST_SUPABASE_URL` | **BLOCKED** |
| **Live Payments** | SSLCommerz production gateway | Fails closed until live merchant account credentials configured | **BLOCKED** |
| **Live SMS** | Telecom aggregator gateway API | Fails closed until live API credentials & sender mask configured | **BLOCKED** |
| **Backup Restore Proof**| Non-production physical PITR restore dry-run | Continuous WAL-G active; physical drill requires owner console action | **BLOCKED** |

---

## 2. Release Classification

**OVERALL RELEASE STATUS: AMBER (PRODUCTION-READY SYSTEM / AWAITING 5 EXTERNAL OWNER ACTIVATIONS)**

- **Code & Repository State:** 100% CLEAN, SECURE, CERTIFIED, AND HARDENED.
- **Production Host:** Active and serving on `https://onnesha-hospital.pages.dev`.
- **Critical Technical Defects:** 0.
- **External Non-Code Dependencies:**
  1. GitHub repository branch protection settings on `main` (Require check: `Mandatory CI (Typecheck, Lint, Audit, Build, Assets, Test, Playwright)`).
  2. Isolated staging database credentials (`OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SERVICE_ROLE_KEY`) for live-security CI step.
  3. Live merchant gateway credentials for SSLCommerz (`SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`).
  4. Live SMS credentials and sender mask (`SMS_API_KEY`, `SMS_API_ENDPOINT`, `SMS_SENDER_ID`).
  5. Physical PITR restore dry-run on staging Supabase instance via Cloud Console.
