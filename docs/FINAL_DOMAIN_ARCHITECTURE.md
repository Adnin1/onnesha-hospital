# Final Domain Architecture & Canonical Routing Specification

## Canonical Host & SSL Configuration
- **Canonical Production Host**: `https://onneshahospital.com`
- **Environment Variable Fallback**: `process.env.NEXT_PUBLIC_SITE_URL` || `"https://onneshahospital.com"`
- **SSL / TLS Policy**: Enforced via Cloudflare Universal SSL with HSTS (`max-age=31536000; includeSubDomains; preload`)
- **HTTPS Redirect**: HTTP requests automatically redirected to HTTPS 301
- **WWW Host Strategy**: `www.onneshahospital.com` redirected to canonical root `onneshahospital.com`

---

## Single-Origin Path Matrix

All hospital capabilities operate under the single canonical origin `https://onneshahospital.com`:

| Function | Canonical URL Path | Access Level | Notes |
|----------|-------------------|--------------|-------|
| **Public Website** | `https://onneshahospital.com/` | Public | Home, services, about, contact |
| **Doctors Directory** | `https://onneshahospital.com/doctors` | Public | Doctor search & profiles |
| **Online Appointment** | `https://onneshahospital.com/appointment` | Public | Patient online OPD booking |
| **Token Queue Check** | `https://onneshahospital.com/check-token` | Public | Live OPD token status check |
| **Staff Login** | `https://onneshahospital.com/login` | Staff | Auth portal (noindex) |
| **Hospital Web HMS** | `https://onneshahospital.com/app/*` | Authenticated | OPD, IPD, Emergency, Billing, Pharmacy, Lab, HR, Audit |
| **Desktop App Download** | `https://onneshahospital.com/downloads/desktop` | Public | Windows MSI installer download |
| **Desktop Update Metadata** | `https://onneshahospital.com/downloads/desktop/latest.json` | Public | Tauri 2 updater manifest |
| **Sitemap** | `https://onneshahospital.com/sitemap.xml` | Public | Search engine indexing |

---

## Technical Domain Synchronization

1. `app/layout.tsx`: `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://onneshahospital.com")`
2. `public/manifest.json`: `id: "/app/dashboard"`, `start_url: "/app/dashboard"`
3. `public/robots.txt`: `Sitemap: https://onneshahospital.com/sitemap.xml`
4. `src-tauri/tauri.conf.json`: Tauri 2 desktop client communicates with canonical production origin `https://onneshahospital.com`
