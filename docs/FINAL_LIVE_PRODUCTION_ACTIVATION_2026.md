# Onnesha Hospital Management System (OHMS)
## Final Live Production Activation Report (2026)
**Document ID:** `DOC-ACTIVATION-LIVE-2026`  
**Generated At:** 2026-09-22T01:20:45+06:00  
**Target Release:** `1.1.5`  
**Repository:** `Adnin1/onnesha-hospital`  
**Current Source SHA:** `5206438bb85042298082e857fba94dcbb3332552`  
**Live Deployed Host:** `https://onnesha-hospital.pages.dev`  
**Overall Activation Status:** `AMBER` (Code Complete / Live Gateway Gates Documented)

---

## 1. Live Deployment & Host State

| Target Host | Live Protocol | HTTP Status | SSL/TLS State | Actual Deployed Version | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `https://onnesha-hospital.pages.dev` | HTTPS | `200 OK` | Valid Cloudflare Universal SSL | v1.1.4 (v1.1.5 staged in git) | `PASS` |
| `https://onneshahospital.com` | HTTPS | N/A | Pending Nameserver Delegation | N/A (DNS ECONNREFUSED) | `BLOCKED` |
| `https://www.onneshahospital.com` | HTTPS | N/A | Pending Nameserver Delegation | N/A (DNS ECONNREFUSED) | `BLOCKED` |

### Cloudflare Deployment Gate Finding
- The repository source is at version `1.1.5` (commit `5206438`).
- The live Cloudflare Pages edge is currently serving version `1.1.4`.
- **Root Cause:** The GitHub Actions `deploy-production` job requires repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Because these secrets are not yet populated in the GitHub repository settings, the automated deployment pipeline halts fail-closed before pushing the new build.
- **Action Required:** The repository owner must configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions Secrets.

---

## 2. Actual Live Edge Headers Probed via HTTP

Measured directly from live edge `https://onnesha-hospital.pages.dev`:

```http
HTTP/2 200 OK
server: cloudflare
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

## 3. Real Performance Measurements (Core Web Vitals)

Measured via Chromium browser automation against live edge:

| Metric | Measured Value | Production Target | Status |
| :--- | :---: | :---: | :---: |
| **First Contentful Paint (FCP)** | `208 ms` | $\le 1000\text{ ms}$ | `PASS` |
| **Largest Contentful Paint (LCP)** | `328 ms` | $\le 2500\text{ ms}$ | `PASS` |
| **DOM Content Loaded** | `194 ms` | $\le 1500\text{ ms}$ | `PASS` |
| **Total Page Load Duration** | `217 ms` | $\le 3000\text{ ms}$ | `PASS` |
| **DOM Element Count** | `396 elements` | $\le 1500\text{ elements}$ | `PASS` |
| **Total Resource Requests** | `30 requests` | $\le 50\text{ requests}$ | `PASS` |
| **Total JavaScript Transferred** | `218 KB` | $\le 500\text{ KB}$ | `PASS` |
| **Total CSS Transferred** | `16 KB` | $\le 50\text{ KB}$ | `PASS` |

---

## 4. Live Gateway & Service Activation Status

| Service Area | Provider | Verification Method | Status | Owner Action Required |
| :--- | :--- | :--- | :---: | :--- |
| **Custom Domain** | Cloudflare DNS | DNS A/AAAA query | `BLOCKED` | Update domain registrar nameservers to Cloudflare. |
| **CI Staging Live Security** | Supabase Staging | `test:live-security` | `BLOCKED` | Add `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY` in GitHub Secrets. |
| **CI Cloudflare Deployment** | Cloudflare API | `wrangler pages deploy` | `BLOCKED` | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets. |
| **Online Payments** | SSLCommerz | Staging contract tests | `BLOCKED` | Configure live Merchant Store ID & Store Password. |
| **SMS Notifications** | BulksmsBD | API schema validation | `BLOCKED` | Configure live BulksmsBD API Key & Sender ID. |
| **Database PITR Restore** | Supabase Cloud | Recovery Runbook | `BLOCKED` | Execute test restore in isolated non-production project. |
