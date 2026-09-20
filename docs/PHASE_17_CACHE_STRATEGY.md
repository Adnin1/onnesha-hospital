# Phase 17 — Cache Strategy

## Cache Matrix

| Resource | Strategy | Cache Control | Notes |
|----------|----------|---------------|-------|
| **Public website pages** (`/`, `/doctors`, `/services`, `/contact`, `/about`) | Cache-first | `public, max-age=3600` | Safe to cache, rebuild on deploy |
| **Static assets** (`/_next/static/*`, CSS, JS, fonts) | Cache-first | Long-lived | Hashed filenames ensure freshness |
| **PWA icons, manifest** | Cache-first | `public, max-age=86400` | Rarely changes |
| **Hospital app pages** (`/app/*`) | No cache | `no-store, no-cache` | Already enforced via `_headers` |
| **Patient records** | NEVER cache | — | PHI — always live |
| **Prescriptions, diagnoses, clinical notes** | NEVER cache | — | PHI — always live |
| **Invoices, payments, billing** | NEVER cache | — | Financial — always live |
| **Lab/diagnostic results** | NEVER cache | — | PHI — always live |
| **Pharmacy stock, purchases** | NEVER cache | — | Financial — always live |
| **HR, payroll, attendance** | NEVER cache | — | PII — always live |
| **Audit logs** | NEVER cache | — | Forensic integrity |
| **Notification/webhook data** | NEVER cache | — | Transactional |
| **Supabase API responses** | NEVER cache | — | All DB queries go network-first |
| **Appointment availability, token queue, bed occupancy** | ALWAYS live | — | Real-time sensitive |

## Service Worker Rules

1. **Static assets**: Cache-first, stored in versioned `ohms-static-v1` cache
2. **HTML pages**: Network-first with cache fallback for offline shell
3. **Supabase/API**: Always network-only, never cached
4. **Sensitive paths**: Pattern-matched and excluded from all caching

## Security Rules

- Service worker NEVER stores PHI, PII, or financial data
- No IndexedDB usage for clinical records
- No localStorage/sessionStorage for sensitive data (verified: 0 usage)
- Cache cleared on service worker version update
