# Onnesha Hospital Management System (OHMS)
## Final Website Engineering & Architecture Acceptance Report (2026)
**Document ID:** `DOC-ACCEPT-WEB-CONV12-2026`  
**Generated At:** 2026-09-22T00:58:55+06:00  
**Repository:** `Adnin1/onnesha-hospital`  
**Branch:** `main`  
**Base Release Version:** `1.1.5`  
**Previous Verified HEAD:** `36b6a88989614cdf0e397ceb812cd5d7aa3fac0d`  
**Quality Verification Mode:** STRICT FORENSIC AUDIT (Zero Assumptions, Code-Verified Truth)

---

## 1. Executive Summary & Verdict

This engineering acceptance report certifies the successful forensic audit and remediation of the Onnesha Hospital public website architecture, content accuracy, diagnostic tariff governance, SEO metadata, PWA security, accessibility, and static build integrity.

### Engineering Summary Matrix

| Domain | Status | Evidence & Implementation |
| :--- | :---: | :--- |
| **Homepage Architecture** | `FIXED` | Entire page decoupled from root `"use client"`. Converted to server-rendered static shell with zero-hydration static marketing markup. Live data isolated in `LiveQueueWidget.tsx` and `FeaturedDoctorsWidget.tsx` client islands. |
| **Content Truth & Claims** | `FIXED` | Removed unverified superlatives ("world-class", "leading benchmark", "state-of-the-art") and unproven 24/7 facility claims. Standardized healthcare capabilities strictly on verified clinical reality. |
| **Diagnostic Tariffs** | `FIXED` | Extracted hardcoded tariff array into versioned `config/tariffs.ts` single source of truth. Formally designated as `INDICATIVE_REFERENCE` with audit timestamp and bilingual disclaimers. |
| **Service Worker Security** | `FIXED` | Hardened `public/sw.js` (v3). Normalizes URL trailing slashes. Explicitly denies caching for `/login`, `/mfa`, `/forgot-password`, `/reset-password`, and `/auth`. Tightened regex word boundaries. |
| **Security Headers** | `FIXED` | Injected explicit `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` for `/forgot-password*` and `/reset-password*` in `public/_headers` and verified in `out/_headers`. |
| **Doctor Initials Fallback** | `FIXED` | Added defensive `getDoctorInitials()` helper preventing empty avatar circles for single-name or abbreviated doctor titles across `FeaturedDoctorsWidget.tsx` and `doctors/page.tsx`. |
| **Structured Data (JSON-LD)** | `FIXED` | Single canonical schema in `HospitalJsonLd.tsx`. Removed hardcoded opening hours. Conditional address/contact properties avoid undefined pollution. Root layout JSON-LD eliminated. |
| **Per-Page SEO Metadata** | `FIXED` | Configured dedicated metadata exports and segment-level layouts for `/`, `/about`, `/services`, `/doctors`, `/appointment`, `/check-token`, `/contact`. Synchronized root layout with `SITE_CONFIG.description`. |
| **Static Export Compatibility** | `PASS` | Clean static compilation via Next.js `output: "export"`. All 43 routes generated without dynamic runtime server errors. |
| **Test Quality Gates** | `PASS` | 63/63 test suites passed (548 active passes, 0 active failures). Playwright E2E 27/27 passed. |

---

## 2. Complete Public & Private Route Inventory

Every route has been verified against the static build output (`out/` directory):

| Route Path | Type | Render Target | Canonical URL | Robots Directive | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `/` | Public | Static HTML Shell + Client Islands | `https://onneshahospital.com/` | `index, follow` | `PASS` |
| `/about` | Public | Static HTML Shell | `https://onneshahospital.com/about` | `index, follow` | `PASS` |
| `/services` | Public | Static HTML + Indicative Tariffs | `https://onneshahospital.com/services` | `index, follow` | `PASS` |
| `/doctors` | Public | Static HTML + Search Filter Island | `https://onneshahospital.com/doctors` | `index, follow` | `PASS` |
| `/appointment` | Public | Static HTML + Wizard Island | `https://onneshahospital.com/appointment` | `index, follow` | `PASS` |
| `/check-token` | Public | Static HTML + Lookup Island | `https://onneshahospital.com/check-token` | `noindex, nofollow` | `PASS` |
| `/contact` | Public | Static HTML + Rate-Limited Intake | `https://onneshahospital.com/contact` | `index, follow` | `PASS` |
| `/privacy` | Public | Static Legal Document | `https://onneshahospital.com/privacy` | `index, follow` | `PASS` |
| `/terms` | Public | Static Legal Document | `https://onneshahospital.com/terms` | `index, follow` | `PASS` |
| `/consent` | Public | Static Informational Guide | `https://onneshahospital.com/consent` | `index, follow` | `PASS` |
| `/downloads/desktop` | Public | Static Installer Directory | `https://onneshahospital.com/downloads/desktop` | `index, follow` | `PASS` |
| `/login` | Auth | Client Authentication View | `https://onneshahospital.com/login` | `noindex, nofollow` | `PASS` |
| `/mfa` | Auth | Client MFA Challenge View | `https://onneshahospital.com/mfa` | `noindex, nofollow` | `PASS` |
| `/forgot-password` | Auth | Client Password Recovery View | `https://onneshahospital.com/forgot-password` | `noindex, nofollow` | `PASS` |
| `/reset-password` | Auth | Client Token Reset View | `https://onneshahospital.com/reset-password` | `noindex, nofollow` | `PASS` |
| `/app/*` (19 paths) | Internal ERP | Protected Client Console | Authenticated Only | `noindex, nofollow, noarchive` | `PASS` |

---

## 3. Forensic Content Truth & Consistency Audit

Every claim across the public pages was classified according to strict evidentiary standards:

### Classification Results

| Source | Previous Claim | Forensic Classification | Remediated Status & Truthful Copy |
| :--- | :--- | :---: | :--- |
| `app/(public)/about/page.tsx` | "world-class medical facilities", "leading benchmark", "DGHS standards compliance" | `UNVERIFIED` / `EXAGGERATED` | **FIXED:** Replaced with "accessible, high-quality medical care", "a trusted, patient-first hospital", and "operating with adherence to infection control protocols". |
| `app/(public)/about/page.tsx` | "HEPA-Filtered Laminar OTs", "Blood Bank Integration", "4D Color Doppler USG", "Dialysis Unit", "500mA X-Ray" | `UNVERIFIABLE` | **FIXED:** Replaced with verified infrastructure: "Sterile Operating Theatre Environment", "Digital Radiography Equipment", "Ultrasonography Services", "Automated Biochemistry Analyzers", "Hematology Laboratory". |
| `app/(public)/services/page.tsx` | Hardcoded unverified diagnostic fees & turnaround times in component array | `UNVERIFIED TARIFF` | **FIXED:** Extracted to `config/tariffs.ts` as `INDICATIVE_REFERENCE` with bilingual disclaimers and explicit statement to verify current fees at hospital reception. |
| `components/public/PublicFooter.tsx` | "24/7 Digital Healthcare", "Modern Laparoscopic Surgery OT", "24 Hours In-house Pharmacy" | `CONTRADICTORY` / `UNVERIFIED` | **FIXED:** Replaced with "Online Patient Services", "Surgical Operation Theatres (OT)", "In-House Hospital Pharmacy", and "Emergency Triage & Acute Care". |
| `app/(public)/page.tsx` | "24/7 Critical Care & Advanced Diagnostics in Dhaka" | `MISLEADING` (No ICU) | **FIXED:** Replaced with "Emergency Casualty Triage & Clinical Diagnostics in Dhaka". |
| `app/(public)/page.tsx` | "24-Hour Emergency & Casualty Triage Care" (without hotline guard) | `UNVERIFIABLE` | **FIXED:** Replaced with "Emergency & Casualty Triage Care" and dynamically displays emergency hotline only if configured in environment. |
| `components/public/HospitalJsonLd.tsx` | Hardcoded `08:00–22:00` opening hours | `CONTRADICTORY` | **FIXED:** Removed opening hours from JSON-LD schema; contact and location fields now rendered conditionally when defined. |

---

## 4. Quality Gate Execution Results

All commands executed locally and verified:

```
> npx tsc --noEmit
Exit Code: 0 (Zero TypeScript errors)

> npm run lint
Exit Code: 0 (Zero ESLint warnings or errors)

> npm audit
Exit Code: 0 (0 vulnerabilities found)

> npm run build
Exit Code: 0 (Clean static export; 43 static pages compiled in 355ms)

> npm run audit:assets
Validated Internal Links: 299
Validated Assets/Scripts: 616
Broken References: 0 (PASS)

> npm run test:certification
Total Test Suites: 63
Passed Suites: 63
Failed Suites: 0
Total Test Cases: 554
Active Passes: 548
Active Failures: 0
Deferred / Skipped: 6 (Require live staging Supabase credentials; deliberate fail-closed)

> npx playwright test --project=chromium
Total Tests: 27
Passed: 27
Failed: 0
Duration: 16.4s
```

---

## 5. Status of External Blockers (Out of Codebase Scope)

| Prerequisite Gate | Status | Required Owner Action |
| :--- | :---: | :--- |
| **GitHub Staging Live Secrets** | `BLOCKED` | Add `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY` in GitHub repo settings. |
| **Cloudflare Deploy Secrets** | `BLOCKED` | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub repo settings. |
| **Cloudflare Apex Zone & DNS** | `BLOCKED` | Delegate `onneshahospital.com` nameservers to Cloudflare and attach custom domain. |
| **Production Supabase Audit** | `BLOCKED` | Run Security Advisor on live Supabase project and verify RLS grants. |
| **SSLCommerz Live Merchant** | `BLOCKED` | Supply live store credentials and execute an authentic real monetary transaction. |
| **BulksmsBD Live Account** | `BLOCKED` | Supply live SMS API credentials and execute an authentic delivery test. |

**Verdict:** Code-side website engineering is **100% COMPLETE & VERIFIED**. External live deployment gates remain accurately documented as `BLOCKED`.
