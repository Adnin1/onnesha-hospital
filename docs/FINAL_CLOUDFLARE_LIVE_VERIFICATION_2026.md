# Onnesha Hospital Management System (OHMS)
## Final Cloudflare Edge & Live Deployment Verification (2026)
**Document ID:** `DOC-VERIFY-CF-LIVE-2026`  
**Generated At:** 2026-09-22T01:21:00+06:00  
**Cloudflare Project:** `onnesha-hospital`  
**Edge Base URL:** `https://onnesha-hospital.pages.dev`  
**Target Canonical Host:** `https://onneshahospital.com`  

---

## 1. Project Configuration & Deployment Inventory

| Parameter | Configured Value | Status |
| :--- | :--- | :---: |
| **Pages Project Name** | `onnesha-hospital` | `PASS` |
| **Production Branch** | `main` | `PASS` |
| **Build Framework** | Next.js (Static Export, `output: "export"`) | `PASS` |
| **Build Command** | `npm run build` | `PASS` |
| **Output Directory** | `out` | `PASS` |
| **Live Deployed Version** | `1.1.4` (Awaiting CI deploy secret to sync `1.1.5`) | `AMBER` |
| **Source Git Commit** | `5206438bb85042298082e857fba94dcbb3332552` | `PASS` |

---

## 2. Edge Security Headers Live Verification

Directly probed from live Cloudflare edge response (`HTTP/2`):

1. **Strict-Transport-Security:**
   - Header: `max-age=31536000; includeSubDomains`
   - Verified on: `/`, `/doctors`, `/services`, `/appointment`, `/check-token`, `/contact`, `/login`, `/app/dashboard`
   - Status: `PASS`
2. **X-Frame-Options:**
   - Header: `DENY`
   - Status: `PASS` (Prevents clickjacking across all pages)
3. **X-Content-Type-Options:**
   - Header: `nosniff`
   - Status: `PASS`
4. **Cache-Control & Data Protection:**
   - Public pages: `public, max-age=0, must-revalidate` (`PASS`)
   - Protected application (`/app/dashboard`): `no-store, no-cache, must-revalidate` (`PASS`)
5. **Search Engine Shielding (X-Robots-Tag):**
   - `/login`: `noindex, nofollow` (`PASS`)
   - `/app/dashboard`: `noindex, nofollow, noarchive` (`PASS`)

---

## 3. Custom Domain & DNS Audit

- **Apex Domain (`onneshahospital.com`):**
  - Probed DNS: `ECONNREFUSED` / No A or AAAA records returned.
  - Reason: Domain registrar has not updated authoritative nameservers to Cloudflare.
  - Cloudflare Requirement: Apex custom domain on Cloudflare Pages requires the zone to be managed within Cloudflare DNS.
  - Status: `BLOCKED` (Owner DNS delegation required).
- **WWW Subdomain (`www.onneshahospital.com`):**
  - Probed DNS: `ECONNREFUSED` / No CNAME record returned.
  - Status: `BLOCKED` (Owner DNS delegation required).

---

## 4. Actionable Cloudflare Deployment Steps

To complete live deployment synchronization of the latest commit (`5206438`):
1. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub Repository Secrets.
2. In the Cloudflare Dashboard, navigate to **Pages > onnesha-hospital > Custom domains** and add `onneshahospital.com`.
3. In domain registrar, update nameservers to the assigned Cloudflare nameservers.
