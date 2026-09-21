# OHMS ERP: Live Website Quality, PII & Browser Acceptance (2026)

**Target Host:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
**Verification Date:** September 22, 2026
**Auditor Mode:** QA Lead, SEO Engineer & Accessibility Auditor
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`

---

## 1. Live Public Routes Verification

| Route | HTTP Status | Title Tag Present | Canonical Tag | Description |
|---|---|---|---|---|
| `/` | 200 | YES | YES (`https://onnesha-hospital.pages.dev`) | Comprehensive medical services, OPD booking, emergency desk |
| `/about` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/about`) | Mission, medical leadership, clinical excellence |
| `/services` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/services`) | Diagnostic and surgical service directory |
| `/doctors` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/doctors`) | Specialist doctor roster and department filter |
| `/appointment` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/appointment`) | Online OPD token booking flow |
| `/check-token` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/check-token`) | Live OPD token queue monitor |
| `/contact` | 200 | YES | YES (`https://onnesha-hospital.pages.dev/contact`) | Emergency hotlines, hospital address, inquiries |
| `/privacy` | 200 | YES | NO (noindex) | PDPA 2026 compliant patient privacy policy |
| `/terms` | 200 | YES | NO (noindex) | Hospital admission and service terms |
| `/consent` | 200 | YES | NO (noindex) | Medical procedure consent guidelines |
| `/downloads/desktop` | 200 | YES | NO (noindex) | Windows desktop client distribution |

---

## 2. Privacy & PII Leakage Audit

- **Public Network Traffic Interception:** All requests and JSON payloads inspected for medical record numbers, patient names, phone numbers, NID, and clinical notes.
- **Result:** **PASS (Zero PII Violations)**.

---

## 3. Service Worker & Cache Storage Audit

- **Cache Version:** `ohms-static-v3`
- **Cached Assets:** Precached static shell (`/`, `/manifest.json`, `/favicon.ico`) and compiled JS/CSS.
- **Sensitive Route Leaks:** **0 sensitive routes cached**.
- **Result:** **PASS**.
