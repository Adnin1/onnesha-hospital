# Onnesha Hospital Management System (OHMS)
## Final Live Production Activation Report (2026)
**Document ID:** `DOC-ACTIVATION-LIVE-2026`  
**Generated At:** 2026-09-22T15:00:00+06:00  
**Target Release:** `1.1.5`  
**Repository:** `Adnin1/onnesha-hospital`  
**Current Source SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  
**Short Git SHA:** `75188a8`  
**Live Deployed Host:** `https://onnesha-hospital.pages.dev`  
**Latest Deployment ID:** `14172efd`  
**Overall Activation Status:** `AMBER` (Software & Edge Deployment Complete / 5 External Owner Gates Documented)

---

## 1. Live Deployment & Host State

| Target Host | Live Protocol | HTTP Status | SSL/TLS State | Actual Deployed Version | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `https://onnesha-hospital.pages.dev` | HTTPS | `200 OK` | Valid Cloudflare Universal SSL | **v1.1.5 (Deployment 14172efd)** | `PASS` |
| `https://onneshahospital.com` | HTTPS | N/A | Pending Nameserver Delegation | N/A (DNS ECONNREFUSED) | `BLOCKED` |
| `https://www.onneshahospital.com` | HTTPS | N/A | Pending Nameserver Delegation | N/A (DNS ECONNREFUSED) | `BLOCKED` |

### Cloudflare Deployment Verification
- The repository source is at version `1.1.5` (commit `75188a8`).
- The live Cloudflare Pages edge is verified serving version `1.1.5` under deployment `14172efd`.
- All 43 static pages, `_headers`, and `_redirects` are active.
- `/home` successfully returns HTTP 301 redirect to `/`.

---

## 2. Actual Live Edge Headers Probed via HTTP

Measured directly from live edge `https://onnesha-hospital.pages.dev`:

```http
HTTP/2 200 OK
server: cloudflare
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.pages.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
strict-transport-security: max-age=31536000; includeSubDomains
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
cache-control (public pages): public, max-age=0, must-revalidate
cache-control (/app/dashboard): no-store, no-cache, must-revalidate
x-robots-tag (/login): noindex, nofollow
x-robots-tag (/app/dashboard): noindex, nofollow, noarchive
```

---

## 3. Real Empirical Performance Measurements (Core Web Vitals)

Measured via Chromium browser `PerformanceObserver` against live Cloudflare Pages edge (`https://onnesha-hospital.pages.dev`):

| Route | Measured LCP | Measured CLS | Production Target | Status |
| :--- | :---: | :---: | :---: | :---: |
| **`/` (Homepage)** | `500 ms` | `0.0225` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/doctors`** | `456 ms` | `0.0395` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/services`** | `504 ms` | `0.0000` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/appointment`** | `468 ms` | `0.0023` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/check-token`** | `452 ms` | `0.0000` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/contact`** | `488 ms` | `0.0000` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |
| **`/login`** | `292 ms` | `0.0000` | LCP $\le 2500\text{ms}$, CLS $\le 0.10$ | `PASS` |

---

## 4. Remaining External Owner Gates

1. **GitHub `main` Branch Protection:** Enable branch protection with required check `Mandatory CI (Typecheck, Lint, Audit, Build, Assets, Test, Playwright)`.
2. **Staging Live-Security Environment Secrets:** Populate `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` in GitHub repository secrets for staging live security tests.
3. **SSLCommerz Live Merchant Credentials:** Populate `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, and toggle `SSLCOMMERZ_IS_SANDBOX=false` in Supabase vault.
4. **SMS Gateway API Credentials:** Populate `SMS_API_KEY`, `SMS_API_ENDPOINT`, and `SMS_SENDER_ID` in Supabase vault.
5. **Physical DR Restore Verification:** Execute a non-production test restore drill in the Supabase Dashboard.
