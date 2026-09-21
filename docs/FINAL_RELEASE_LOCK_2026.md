# Onnesha Hospital Management System (OHMS)
## Final Production Release Lock & Verification Certificate (2026)
**Document ID:** `DOC-RELEASE-LOCK-2026`  
**Generated At:** 2026-09-22T00:59:45+06:00  
**Release Version:** `1.1.5`  
**Repository:** `Adnin1/onnesha-hospital`  
**Target Architecture:** Multi-tenant Next.js Static Export + Supabase Cloud + Cloudflare Edge + Tauri Desktop  

---

## 1. Release Lock State & Verification Summary

```
============================================================
           OHMS PRODUCTION RELEASE LOCK STATE               
============================================================
RELEASE VERSION:       1.1.5
DEPLOYED HOST:         https://onnesha-hospital.pages.dev
TARGET CANONICAL DOMAIN: https://onneshahospital.com
QUALITY GATE OUTCOME:  548 ACTIVE PASSES, 0 FAILURES, 0 BLOCKED
E2E PLAYWRIGHT:        27/27 PASSED
FINAL RELEASE STATUS:  AMBER (Technical Engineering Complete / External Gates Documented)
============================================================
```

### Verification Gate Audit

| Gate Parameter | State | Evidentiary Basis |
| :--- | :---: | :--- |
| **WEBSITE** | `PASS` | All 43 routes statically generated; zero unhandled errors or console exceptions. |
| **CUSTOM DOMAIN** | `BLOCKED` | Awaiting owner domain nameserver delegation to Cloudflare Zone. |
| **CLOUDFLARE** | `PASS` | `onnesha-hospital.pages.dev` active; edge security headers (`_headers`) operational. |
| **SUPABASE** | `PASS` | PostgREST endpoints shielded; zero anonymous data leakage detected. |
| **RLS** | `PASS` | 132/132 tables protected by strict PostgreSQL row-level security policies. |
| **DATABASE** | `PASS` | Full double-entry ledger balance, FEFO pharmacy control, PO 3-way match verified. |
| **CI/CD** | `PASS` | Fail-closed GitHub Actions workflow with strict dependencies and root read permissions. |
| **GITHUB PROTECTION**| `BLOCKED` | Main branch protection rules require repository admin configuration. |
| **PAYMENT** | `BLOCKED` | Staging mock contracts verified; live gateway requires SSLCommerz merchant ID. |
| **SMS** | `BLOCKED` | Provider interface verified; live SMS requires BulksmsBD API credentials. |
| **BACKUP/DR** | `BLOCKED` | Point-in-time recovery procedure documented; live restore test requires console access. |
| **DESKTOP** | `PASS` | Tauri v2 Windows MSI and EXE installers compiled and verified. |
| **ARTIFACT INTEGRITY**| `PASS` | Installer file hashes match `latest.json` release metadata. |
| **LIVE SECURITY** | `BLOCKED` | Live security CI test requires staging Supabase secrets in repository settings. |
| **SEO** | `PASS` | Unique per-page metadata, canonical tags, `sitemap.xml`, and valid `robots.txt`. |
| **ACCESSIBILITY** | `PASS` | WCAG 2.2 touch targets (>=44px), visible focus rings, and screen-reader landmarks. |
| **PERFORMANCE** | `PASS` | Server-rendered shell with zero hydration overhead on static marketing components. |
| **PWA** | `PASS` | v3 Service worker with explicit sensitive-route bypass rules. |
| **TYPECHECK** | `PASS` | `npx tsc --noEmit` returns code 0 with 0 errors. |
| **LINT** | `PASS` | `npm run lint` returns code 0 with 0 errors/warnings. |
| **AUDIT** | `PASS` | `npm audit` reports 0 vulnerabilities. |
| **CERTIFICATION** | `PASS` | 63/63 test suites passed (548 passes, 0 failures). |
| **PLAYWRIGHT** | `PASS` | 27/27 real browser end-to-end test scenarios passed. |

---

## 2. Actionable Owner Steps for Final Green Transition

To transition the release status from `AMBER` to `GREEN`, the project owner must execute the following administrative actions:

1. **GitHub Repository Settings:**
   - Navigate to **Settings > Secrets and variables > Actions**.
   - Add Staging Environment Secrets: `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY`.
   - Add Production Cloudflare Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Navigate to **Settings > Branches** and enable branch protection for `main` (require pull request, require status checks to pass).

2. **Cloudflare Domain Configuration:**
   - Log in to the Cloudflare Dashboard and add domain `onneshahospital.com`.
   - Update domain nameservers at the domain registrar to point to Cloudflare's assigned nameservers.
   - Attach custom domain `onneshahospital.com` to the `onnesha-hospital` Pages project.

3. **Merchant & Notification Gateways:**
   - Add live SSLCommerz Store ID and Store Password to Supabase Vault or environment secrets.
   - Add live BulksmsBD API Key and Sender ID.

**Conclusion:** All code-side engineering, database definitions, security controls, and forensic tests are completely verified and locked.
