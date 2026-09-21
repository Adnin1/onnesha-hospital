# OHMS ERP: Final Production Activation & Infrastructure Report (2026)

**Target System:** Onnesha Hospital & Diagnostic Complex (OHMS ERP v1.1.5)
**Verification Date:** September 22, 2026
**Auditor Mode:** Principal Production & DevSecOps Engineer (Zero-Trust Standard)
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`
**Git Branch:** `main`

---

## 1. Executive Summary

| Subsystem | Scope | Status | Evidence / Notes |
|---|---|---|---|
| **Cloudflare Pages Live Edge** | Production build v1.1.5 | **PASS** | Deployed to `onnesha-hospital.pages.dev` (Deployment ID: `bd31383a`). 43 static routes generated and serving with full edge security headers. |
| **Edge Security Headers** | All 11 public & auth routes | **PASS** | HSTS (`max-age=31536000; includeSubDomains`), X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy, CSP, and sensitive route cache-busting verified via live HTTP probe. |
| **Real Browser Core Web Vitals** | Live Edge Playwright Measurement | **PASS** | Measured via browser `PerformanceObserver`: FCP = 60ms, True LCP = 60ms (Threshold $\le 2500$ms), CLS = 0.0016 (Threshold $< 0.1$), TTFB = 37ms, DOM elements = 407. |
| **Sensitive Route Caching** | Service Worker & Edge Cache | **PASS** | `/login`, `/mfa`, `/forgot-password`, `/reset-password`, `/app/*` strictly denied caching (`no-store, no-cache, must-revalidate`). Zero private URL leaks in CacheStorage. |
| **Public PII Privacy** | Live traffic inspection | **PASS** | Zero patient records, names, phone numbers, or NID projected across public network payloads. |
| **Canonical Domain** | `https://onnesha-hospital.pages.dev` | **PASS** | Unified canonical host across config, robots.txt, and sitemap.xml. |
| **Custom Apex Domain** | `onneshahospital.com` / `www` | **N/A** | Unpurchased custom domains unattached cleanly from Cloudflare Pages. Can be attached when acquired. |
| **GitHub Branch Protection** | `main` branch rules | **BLOCKED** | Repository uses SSH deploy key; requires repository owner to enable branch protection in GitHub UI Settings. |
| **Supabase Remote Migrations** | 55 Migrations | **PASS** | All 55 database migrations synchronized and applied to remote live database `iuhtzahuszdkdarhxobx` via `npx supabase db push`. |
| **Desktop Application Binaries** | WiX MSI & NSIS EXE | **PASS** | SHA256 hashes match `public/downloads/desktop/latest.json` with 100% cryptographic parity. |
| **Live Payment & SMS** | SSLCommerz / BulksmsBD | **BLOCKED** | Safe fail-closed architecture active; requires live production merchant credentials for active transactions. |

---

## 2. Infrastructure Verification Matrix

### A. Cloudflare Pages
- **Project Name:** `onnesha-hospital`
- **Current Live URL:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
- **Latest Deployment:** `https://bd31383a.onnesha-hospital.pages.dev`
- **Active Custom Domains:** None pending; canonical host `https://onnesha-hospital.pages.dev` active.

### B. Live Edge Response Headers (Observed Empirical HTTP Responses)
```http
HTTP/2 200
server: cloudflare
strict-transport-security: max-age=31536000; includeSubDomains
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=()
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.pages.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
cache-control (public): public, max-age=0, must-revalidate
cache-control (private/auth): no-store, no-cache, must-revalidate
x-robots-tag (/app/dashboard): noindex, nofollow, noarchive
```

---

## 3. Mandatory External Actions for Administrator

1. **GitHub Branch Protection:**
   - In GitHub Settings $\to$ Branches $\to$ Add rule for `main`:
     - Check: "Require status checks to pass before merging" $\to$ `Mandatory CI (Typecheck, Lint, Audit, Build, Assets, Test, Playwright)`
     - Check: "Block force pushes" and "Require pull request".
2. **Third-Party Gateways (When ready for live billing/SMS):**
   - Provide SSLCommerz Store ID and Secret in Supabase Vault / Edge Function secrets.
   - Provide BulksmsBD API Key in Supabase Vault / Edge Function secrets.
