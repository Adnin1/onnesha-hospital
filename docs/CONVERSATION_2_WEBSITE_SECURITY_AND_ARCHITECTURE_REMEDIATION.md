# Conversation 2: Website Architecture, Public Security & Data Integrity Remediation Report

**Date:** 2026-09-21  
**Target Release:** v1.1.4  
**Repository:** `Adnin1/onnesha-hospital`  
**Execution Phase:** Conversation 2 Remediation & Forensic Verification  

---

## 1. Executive Summary & Architecture Confirmation

Following the forensic baseline audit ([`docs/CONVERSATION_2_WEBSITE_FORENSIC_BASELINE.md`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/docs/CONVERSATION_2_WEBSITE_FORENSIC_BASELINE.md)), this remediation stream addressed critical data privacy, architectural reality, public API security, statutory legal compliance, and static asset defects across the public-facing Onnesha Hospital web application.

### Architectural Reality: Option A Enforced
- **Hosting Model:** Next.js static HTML export (`output: "export"`) deployed directly to Cloudflare Pages CDN (`out/`).
- **Middleware Boundary:** As documented in Next.js 16 static export specifications, edge/server middleware (`proxy.ts`) does not execute on static CDN hosts.
- **Security Boundary:** Client-side route transition guards (`AuthGuard`) provide smooth user-experience navigation. Authoritative authorization, multi-tenant isolation, and data protection are enforced exclusively at the database layer via PostgreSQL Row-Level Security (RLS) policies and `SECURITY DEFINER SET search_path = ''` RPC routines.

---

## 2. Key Remediation Implementations

### A. Zero-PII Public Live Queue Projection
- **Identified Defect:** Anonymous visitors previously queried the raw `appointments` table with `patients(name)`. Client-side code attempted to mask patient names (`Patient: A*** K***`), allowing raw patient names and identifiers to be intercepted in browser network inspection.
- **Remediation:** 
  - Authored Migration 54 ([`supabase/migrations/20260921070000_secure_public_waiting_queue_and_contact_intake.sql`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/supabase/migrations/20260921070000_secure_public_waiting_queue_and_contact_intake.sql)).
  - Implemented `public.get_public_live_queue(p_org_id UUID)` with `SECURITY DEFINER SET search_path = ''`.
  - The RPC strictly projects only non-sensitive queue tokens: `doctor_name`, `room_number`, `token_number`, `status`, and `called_at`.
  - Zero patient names, phone numbers, or patient IDs are selected or returned over the network.
  - Hardened [`lib/public/actions.ts`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/lib/public/actions.ts) to invoke this RPC, and updated [`app/(public)/check-token/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/check-token/page.tsx) and [`app/(public)/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/page.tsx) to remove `Patient:` labels entirely.

### B. Hardened Public Contact Inquiry Intake
- **Identified Defect:** The contact form allowed unrestricted anonymous submissions with no length bounds or anti-abuse protections.
- **Remediation:**
  - In Migration 54, created `public.submit_public_contact_inquiry(...)` with `SECURITY DEFINER SET search_path = ''`.
  - Added anti-abuse rate-limiting: Maximum 5 submissions per phone number per trailing hour.
  - Added database constraints `chk_contact_inquiry_name_len` and `chk_contact_inquiry_message_len`.
  - Normalized Bangladeshi phone numbers (`013-019`).
  - Added strict HTML `maxLength` boundaries in [`app/(public)/contact/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/contact/page.tsx): name (120), phone (15), email (150), subject (150), message (2000).

### C. Online Appointment Booking Hardening
- **Identified Defect:** Hardcoded default values (Age `30`, Gender `MALE`), blocking browser `alert()` modal on errors, and misleading claims of simulated SMS dispatch.
- **Remediation:**
  - In [`app/(public)/appointment/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/appointment/page.tsx):
    - Initial age initialized to blank `""`; initial gender initialized to unselected `""` with explicit selection required.
    - Replaced browser `alert()` with accessible inline `bookingError` notification banner.
    - Replaced simulated SMS dispatched text with honest confirmation notice regarding SMS delivery upon hospital desk processing.
  - In [`lib/public/actions.ts`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/lib/public/actions.ts):
    - Pre-validates patient name (2-120 chars), age (0-125), notes (max 500), and validates that appointment dates cannot be in the past.

### D. Missing Static Assets & Service Worker Repair
- **Identified Defect:** `public/favicon.ico`, `public/logo.png`, `public/icons/icon-192.png`, and `public/icons/icon-512.png` were missing, causing 404s. `public/sw.js` was attempting to pre-cache `/favicon.ico`, resulting in silent Service Worker installation rejections.
- **Remediation:**
  - Authored [`scripts/generate-web-assets.mjs`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/scripts/generate-web-assets.mjs) using `sharp`.
  - Generated valid assets:
    - `public/favicon.ico` (multi-resolution 16/32/48 ICO)
    - `public/logo.png` (high-res brand emblem)
    - `public/icons/icon-192.png` and `public/icons/icon-512.png` (PWA application icons)
  - Updated [`public/manifest.json`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/public/manifest.json) to set `"start_url": "/"` and register PNG/ICO icon references.
  - Service worker pre-cache now succeeds with HTTP 200.

### E. Robots, Sitemap & Structured Data Consistency
- **Identified Defect:** `public/robots.txt` referenced nonexistent `/departments` and `/diagnostic` routes. `app/sitemap.ts` recomputed timestamps on every build with `new Date()`. `HospitalJsonLd.tsx` pointed to a 404 logo and listed nonexistent ICU/NICU facilities.
- **Remediation:**
  - `public/robots.txt`: Removed nonexistent routes; affirmed indexable public routes and disallowed internal `/app/` routes.
  - `app/sitemap.ts`: Switched to stable release timestamp (`2026-09-21T00:00:00.000Z`).
  - `components/public/HospitalJsonLd.tsx`: Linked valid `/logo.png` and scoped services to Outpatient Consultation, Emergency Triage, and Diagnostic Pathology.

### F. Statutory Legal & Privacy Alignment (BD PDPA 2026)
- **Identified Defect:** Privacy policy incorrectly mapped the statutory sections of the Bangladesh Personal Data Protection Act 2026 (e.g. falsely claiming Section 18 is "Right to Access", when Section 18 is Data Retention). Also listed a fictional email address `dpo@onneshahospital.com`. The consent page was misleadingly titled "Portal" implying live toggles.
- **Remediation:**
  - [`app/(public)/privacy/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/privacy/page.tsx): Corrected statutory section mapping:
    - Section 11: Right to Access
    - Section 12: Right to Rectification
    - Section 13: Consent Withdrawal
    - Section 17: Security Obligations
    - Section 18: Data Retention Limitations
    - Section 20: Incident & Breach Notification
  - Removed fictional `dpo@onneshahospital.com`; designated authentic hospital administration desk with DPO contact role.
  - [`app/(public)/consent/page.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/app/%28public%29/consent/page.tsx): Framed as informative guidance on data processing categories under Section 13.

### G. Content Integrity & Truth in Advertising
- **Identified Defect:** Unverified marketing claims including "256-bit TLS and RLS এনক্রিপশন" (RLS is an access control mechanism, not an encryption cipher), uncertified "DGHS-standard", and fictional ICU/HEPA OT facilities.
- **Remediation:**
  - Removed erroneous encryption descriptions across `about`, `services`, and home page.
  - Removed uncertified claims; maintained accurate descriptions of outpatient, diagnostic, and emergency triage services.
  - [`components/app/HospitalHeader.tsx`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/components/app/HospitalHeader.tsx): Replaced misleading "System Notifications" with truthful "Recent System Activity" audit trail display without fake unread badges.

### H. Security Headers Hardening
- **Identified Defect:** `public/_headers` included `'unsafe-eval'` in Content-Security-Policy.
- **Remediation:**
  - Removed `'unsafe-eval'` from CSP.
  - Added explicit no-cache directives for desktop update metadata (`/downloads/desktop/latest.json`) and authentication routes (`/login`, `/mfa`).

---

## 3. Automated Test Verification & Quality Gates

### A. Dedicated Test Suite
Created [`tests/website-public-security-and-data-integrity.test.mjs`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/tests/website-public-security-and-data-integrity.test.mjs) verifying all 14 core criteria:
1. Migration 54 defines `get_public_live_queue` with zero PII projection.
2. Migration 54 implements rate-limited contact intake and length constraints.
3. `lib/public/actions.ts` calls `get_public_live_queue` RPC and bounds inputs.
4. Static assets (`favicon.ico`, `logo.png`, `icon-192.png`, `icon-512.png`) exist and are valid.
5. PWA manifest, service worker, and robots.txt are structurally sound.
6. HospitalJsonLd structured data links valid logo and accurate capabilities.
7. Public appointment form requires explicit age/gender and avoids `alert()`.
8. Live Queue displays in HomePage and CheckToken do not expose patient names.
9. Contact form bounds field lengths and makes realistic operational claims.
10. Privacy policy aligns with BD Personal Data Protection Act 2026 sections.
11. Consent guide provides truthful informational guidance.
12. Public marketing text eliminates pseudo-technical encryption claims.
13. `public/_headers` removes `unsafe-eval` and adds sensitive route cache-busting.
14. HospitalHeader acts truthfully as audit activity tracker.

### B. Quality Gate Results
- **Certification Test Suite:** 58/58 test suites passed (520 active passes, 0 failures, 0 blocked).
- **TypeScript Typecheck (`npm run typecheck`):** Passed with 0 errors.
- **ESLint (`npx eslint . --max-warnings 0`):** Passed with 0 warnings, 0 errors.
- **Security Audit (`npm audit --audit-level=high`):** 0 vulnerabilities.
- **Static Export Build (`npm run build`):** 43/43 routes successfully generated in `out/`.

---

## 4. Transition to Conversation 3

With Conversation 2 complete and verified, the next workstream (**Conversation 3**) will focus on:
1. **WCAG 2.2 Accessibility:** Focus ring contrast, touch target sizes (min 44x44px), ARIA landmarks, form labels.
2. **Visual UX & Layouts:** Responsive layout testing from 360px mobile to 1440px desktop displays.
3. **Cross-Browser Verification:** Playwright browser automation specs across public appointment, doctor directory, token status, and emergency flows.
