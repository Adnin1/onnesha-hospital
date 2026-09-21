# Onnesha Hospital Management System (OHMS)
## Final Live Website Black-Box & Edge Verification Acceptance (2026)
**Document ID:** `DOC-ACCEPT-BLACKBOX-CONV13-2026`  
**Generated At:** 2026-09-22T00:59:15+06:00  
**Target Hosts:**  
- Production Edge: `https://onnesha-hospital.pages.dev` (`PASS`)
- Custom Apex Domain: `https://onneshahospital.com` (`BLOCKED` - Pending DNS nameserver delegation)
- Custom WWW Domain: `https://www.onneshahospital.com` (`BLOCKED` - Pending DNS nameserver delegation)

---

## 1. Live Domain Matrix & Verification

| Target Hostname | Protocol | HTTP Status | SSL/TLS Certificate | Server Header | Live Status | Rationale |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `https://onnesha-hospital.pages.dev` | HTTPS | `200 OK` | Valid Cloudflare TLS | `cloudflare` | `PASS` | Actively serving production static shell and client application. |
| `https://onneshahospital.com` | HTTPS | N/A | Pending Nameservers | N/A | `BLOCKED` | Awaiting owner domain nameserver delegation to Cloudflare Zone. |
| `https://www.onneshahospital.com` | HTTPS | N/A | Pending Nameservers | N/A | `BLOCKED` | Awaiting owner domain nameserver delegation to Cloudflare Zone. |

---

## 2. Public & Private Route Live Behavior

| Route | Live HTTP Status | Cache-Control Header | X-Robots-Tag | Content Safety / Privacy Leakage | Verdict |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `/` | `200 OK` | Edge Cached | Allowed (`index, follow`) | 0 PII; Clean HTML shell | `PASS` |
| `/about` | `200 OK` | Edge Cached | Allowed (`index, follow`) | 0 PII; Clean HTML shell | `PASS` |
| `/services` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Indicative reference tariffs only | `PASS` |
| `/doctors` | `200 OK` | Edge Cached | Allowed (`index, follow`) | BMDC & Room # public info only | `PASS` |
| `/appointment` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Client booking wizard; zero preloaded PII | `PASS` |
| `/check-token` | `200 OK` | Edge Cached | `noindex, nofollow` | Lookup form; zero unauthenticated PII | `PASS` |
| `/contact` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Rate-limited submission interface | `PASS` |
| `/privacy` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Legal compliance document | `PASS` |
| `/terms` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Legal compliance document | `PASS` |
| `/consent` | `200 OK` | Edge Cached | Allowed (`index, follow`) | Informational patient privacy guide | `PASS` |
| `/downloads/desktop` | `200 OK` | `no-cache, no-store` | Allowed (`index, follow`) | MSI/EXE SHA256 verified installers | `PASS` |
| `/login` | `200 OK` | `no-store, no-cache` | `noindex, nofollow` | Zero sensitive credentials | `PASS` |
| `/mfa` | `200 OK` | `no-store, no-cache` | `noindex, nofollow` | Zero token leakage | `PASS` |
| `/forgot-password` | `200 OK` | `no-store, no-cache` | `noindex, nofollow` | Zero account enumeration | `PASS` |
| `/reset-password` | `200 OK` | `no-store, no-cache` | `noindex, nofollow` | Zero token leakage | `PASS` |
| `/app/dashboard` | `200 OK` | `no-store, no-cache` | `noindex, nofollow, noarchive` | Unauthenticated shell contains 0 PHI | `PASS` |

---

## 3. Real Browser E2E Matrix (Playwright Chromium)

Executed across responsive viewport sizes (Mobile `360x740`, Desktop `1280x800`):

```
✓ [chromium] › accounting.spec.ts: Loads Chart of Accounts, Journal Entries, Trial Balance
✓ [chromium] › accounting.spec.ts: Loads Procurement requisitions and GRN records
✓ [chromium] › accounting.spec.ts: Loads Fixed Assets biomedical register
✓ [chromium] › appointment.spec.ts: Completes multi-step appointment wizard
✓ [chromium] › appointment.spec.ts: Loads staff live queue and booking console
✓ [chromium] › auth.spec.ts: Login form accepts credentials and validates input
✓ [chromium] › auth.spec.ts: Unauthenticated /app/dashboard redirects to login
✓ [chromium] › billing.spec.ts: Loads invoice directory and cashier modals
✓ [chromium] › billing.spec.ts: Loads daily reconciliation totals and void log
✓ [chromium] › doctor-roster.spec.ts: Renders doctor directory and schedule controls
✓ [chromium] › emergency.spec.ts: Renders emergency triage color-coded board
✓ [chromium] › hr.spec.ts: Loads employee directory and attendance roster
✓ [chromium] › ipd-bed.spec.ts: Loads active admissions and bed matrix
✓ [chromium] › ipd-bed.spec.ts: Loads occupancy grid and pricing controls
✓ [chromium] › lab.spec.ts: Diagnostic order intake and result entry console
✓ [chromium] › ot.spec.ts: Operation theatre surgery schedule & room bookings
✓ [chromium] › patient-opd.spec.ts: Patient directory search & creation modal
✓ [chromium] › patient-opd.spec.ts: OPD live queue & vitals intake interface
✓ [chromium] › pharmacy.spec.ts: Stock inventory & POS dispensing console
✓ [chromium] › public-website-accessibility-and-responsive.spec.ts: Mobile menu drawer
✓ [chromium] › public-website-accessibility-and-responsive.spec.ts: 360px overflow check
✓ [chromium] › public-website-accessibility-and-responsive.spec.ts: Doctor filters
✓ [chromium] › public-website-accessibility-and-responsive.spec.ts: Live token check
✓ [chromium] › public-website-accessibility-and-responsive.spec.ts: Contact form
✓ [chromium] › rbac.spec.ts: Strict AuthGuard redirects unauthenticated visitors
✓ [chromium] › reports-audit.spec.ts: Financial reporting summaries and audit filters
✓ [chromium] › reports-audit.spec.ts: Audit log forensic trail inspector

27/27 PASSED (16.4s execution time)
```

---

## 4. Black-Box SEO & Sitemap Verification

1. **Sitemap (`out/sitemap.xml`):**
   - Output exists: `True` (Verified via static build)
   - Total URLs indexed: 11 public URLs (All canonical, zero private `/app/*` or `/login` routes)
   - XML Schema: Complies with `http://www.sitemaps.org/schemas/sitemap/0.9`
   - URLs: Absolute `https://onneshahospital.com/` format

2. **Robots.txt (`public/robots.txt`):**
   - Public paths explicitly allowed: `/`, `/about`, `/services`, `/doctors`, `/appointment`, `/check-token`, `/contact`, `/privacy`, `/terms`, `/consent`, `/downloads/desktop`, `/llms.txt`
   - Internal paths strictly disallowed: `/app/`, `/login`, `/mfa`, `/forgot-password`, `/reset-password`
   - AI Crawlers: Explicit permissions provided for GPTBot, Google-Extended, PerplexityBot, ClaudeBot
   - Linked Sitemap: `https://onneshahospital.com/sitemap.xml`

---

## 5. Public PII & Data Leakage Black-Box Test

- **Network Requests Inspection:** Inspected all anonymous client network payloads.
- **Supabase PostgREST Shielding:**
  - `patients` table: 0 rows accessible to unauthenticated callers (`PASS`)
  - `invoices` table: 0 rows accessible to unauthenticated callers (`PASS`)
  - `organization_integrations` table: 0 credentials accessible (`PASS`)
  - `get_public_live_queue` RPC: Projects only `doctor_name`, `token_number`, `room_number`, `status`. No patient name or contact info (`PASS`).
- **Verdict:** ZERO PII LEAKAGE DETECTED.

---

## 6. Black-Box Acceptance Status

| Domain | Status | Note |
| :--- | :---: | :--- |
| **Edge Security Headers** | `PASS` | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy verified |
| **Public Route Reachability** | `PASS` | 15/15 public and app landing routes verified HTTP 200 |
| **Browser Compatibility** | `PASS` | Chromium tested; responsive viewports verified |
| **SEO & Canonical Integrity** | `PASS` | Unique titles, descriptions, canonicals, and sitemap verified |
| **PWA & Cache Isolation** | `PASS` | Sensitive routes strictly excluded from service worker cache |
| **Custom Domain Resolution** | `BLOCKED` | Domain registrar delegation to Cloudflare nameservers pending |
| **External Live Gate Activation**| `BLOCKED` | Staging secrets, Cloudflare token, SMS, Payment live credentials pending |
