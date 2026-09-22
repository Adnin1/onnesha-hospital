# Onnesha Hospital Management System (OHMS)
## Final Cloudflare Edge & Live Deployment Verification (2026)
**Document ID:** `DOC-VERIFY-CF-LIVE-2026`  
**Generated At:** 2026-09-22T15:00:00+06:00  
**Cloudflare Project:** `onnesha-hospital`  
**Edge Base URL & Canonical Host:** `https://onnesha-hospital.pages.dev`  
**Latest Deployment ID:** `14172efd`  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. Project Configuration & Deployment Inventory

| Parameter | Configured Value | Status |
| :--- | :--- | :---: |
| **Pages Project Name** | `onnesha-hospital` | `PASS` |
| **Production Branch** | `main` | `PASS` |
| **Build Framework** | Next.js (Static Export, `output: "export"`) | `PASS` |
| **Build Command** | `npm run build` | `PASS` |
| **Output Directory** | `out` | `PASS` |
| **Live Deployed Version** | `1.1.5` (Deployment `14172efd` live on edge) | `PASS` |
| **Source Git Commit** | `75188a8d2db316fdcbfa63e905a69c16064a4a3b` | `PASS` |

---

## 2. Edge Security Headers Live Verification

Directly probed from live Cloudflare edge response (`HTTP/2`):

1. **Content-Security-Policy:**
   - Value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.pages.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
   - `'unsafe-eval'` is blocked. Unpurchased domains removed from `connect-src`.
   - Status: `PASS`
2. **Strict-Transport-Security:**
   - Header: `max-age=31536000; includeSubDomains`
   - Verified on: `/`, `/doctors`, `/services`, `/appointment`, `/check-token`, `/contact`, `/login`, `/app/dashboard`
   - Status: `PASS`
3. **X-Frame-Options:**
   - Header: `DENY`
   - Status: `PASS` (Prevents clickjacking across all pages)
4. **X-Content-Type-Options:**
   - Header: `nosniff`
   - Status: `PASS`
5. **Referrer-Policy:**
   - Header: `strict-origin-when-cross-origin`
   - Status: `PASS`
6. **Cache-Control & Data Protection:**
   - Public pages: `public, max-age=0, must-revalidate` (`PASS`)
   - Protected application (`/app/dashboard`): `no-store, no-cache, must-revalidate` (`PASS`)
7. **Search Engine Shielding (X-Robots-Tag):**
   - `/login`: `noindex, nofollow` (`PASS`)
   - `/app/dashboard`: `noindex, nofollow, noarchive` (`PASS`)

---

## 3. Canonical Routing & Redirects

- `_redirects` file deployed to Cloudflare Pages edge.
- Probed: `https://onnesha-hospital.pages.dev/home` returns HTTP `301 Moved Permanently` to `/`.
- Status: `PASS`

---

## 4. Custom Domain & DNS Status

- **Canonical Production Host:** `https://onnesha-hospital.pages.dev` (Active, HTTPS 200, SSL verified).
- **Future Custom Apex Domain (`onneshahospital.com`):** Pending owner acquisition and nameserver delegation to Cloudflare Zone. Cleanly decoupled so current production operations on `pages.dev` are unaffected.
