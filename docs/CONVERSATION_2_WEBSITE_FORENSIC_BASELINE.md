# Onnesha Hospital — Public Website & Runtime Architecture Forensic Baseline Audit

**Audit Timestamp:** 2026-09-21T15:30:00+06:00  
**Baseline Git Commit:** `15bf3d868a4847d9d1e2d5a70a0aea15d28eee03`  
**Current Branch:** `main` (Verified clean working tree)  
**Auditor Role:** Elite Principal Full-Stack Engineer & Senior Security Architect  

---

## 1. Inventory of Public Routes, Assets & Infrastructure

### 1.1 Existing Public Routes (`app/(public)/*`)
- `/` (Homepage — clinical trust, doctor search, token status, services overview)
- `/about` (About Onnesha Hospital, facilities, digital platform)
- `/services` (Clinical & Diagnostic investigation tariff catalog)
- `/doctors` (Specialist doctor directory & schedule lookup)
- `/appointment` (4-step public online serial booking wizard)
- `/check-token` (Live token queue tracker for waiting patients)
- `/contact` (Contact details, physical location, emergency lines, inquiry form)
- `/downloads/desktop` (Official Tauri Windows Desktop installer portal)
- `/privacy` (Personal data protection policy under BD law)
- `/terms` (Terms of clinical care and portal service)
- `/consent` (Patient data privacy choices & consent declarations)

### 1.2 Authentication & App Entry Routes
- `/login` (Staff & clinician authentication portal)
- `/mfa` (Multi-factor authentication challenge)
- `/forgot-password` (Password recovery request)
- `/reset-password` (Password reset confirmation)
- `/app/*` (Protected hospital ERP & clinical operating system routes)

### 1.3 Static Public Assets (`public/*`)
- `public/icons/icon-192.svg`, `public/icons/icon-512.svg`, `public/icons/icon-maskable-512.svg`
- `public/downloads/desktop/Onnesha-Hospital-Setup-1.1.4.exe` (2,010,152 bytes)
- `public/downloads/desktop/Onnesha-Hospital-1.1.4.msi` (2,506,752 bytes)
- `public/downloads/desktop/latest.json`
- `public/manifest.json`
- `public/sw.js`
- `public/robots.txt`
- `public/_headers`
- `public/llms.txt`
- `public/api/health.json`

---

## 2. Forensic Findings & Defect Register

### Critical Architecture Conflict (P0)
- **Defect:** `next.config.ts` specifies `output: "export"`, while `proxy.ts` and `@/lib/supabase/middleware.ts` attempt to intercept incoming HTTP requests using cookies and sessions.
- **Evidence:** 
  Next.js official documentation (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md` line 291) explicitly lists `Proxy`, `Cookies`, `Redirects`, `Headers`, and `Server Actions` as **unsupported** under `output: "export"`.
  When building, Next.js emits: `⚠ Statically exporting a Next.js application via next export disables API routes and middleware.`
  Cloudflare Pages in CI deploys `out/` via `npx wrangler pages deploy out`. As a result, `proxy.ts` **never executes in production**.
- **Impact:** False sense of security if developers assume `proxy.ts` guards the `/app/*` static HTML files at the network edge.
- **Resolution (Option A):** Remove `proxy.ts` and server middleware assumptions. Consolidate into a pure, coherent static export architecture:
  1. Client-side UX routing protection is handled via `AuthGuard` / `useAuth`.
  2. Authoritative security & data isolation is enforced at the database layer (Supabase PostgreSQL RLS policies and `SECURITY DEFINER SET search_path = ''` RPCs).
  3. No unexecutable proxy code left in the repository.

### Public Data Exposure & Queue Privacy Violation (P0)
- **Defect:** `getLiveWaitingQueueAction` in `lib/public/actions.ts` queries the base `appointments` table directly (`supabase.from("appointments").select(...)`) and fetches raw `patient_name`, attempting to mask it client-side (`nameParts[0] + " " + nameParts[1][0] + "***"`).
- **Evidence:** `appointments` table has strict RLS for authenticated staff only (`TO authenticated, service_role`). If an anon policy is added or bypassed, direct REST queries to `GET /rest/v1/appointments?select=patient_name,patient_phone` completely expose patient identities and contact numbers.
- **Impact:** Direct violation of patient confidentiality and data protection standards.
- **Resolution:** Create an authoritative database RPC `public.get_public_live_queue(p_org_id UUID)` that returns ONLY public-safe columns (`token_number`, `status`, `doctor_name`, `room_number`, `created_at`) and **zero patient names, phone numbers, or IDs**.

### Broken Static Asset References (P1)
1. **Missing `/favicon.ico`:**
   - Referenced in `public/manifest.json` line 33 and `public/sw.js` line 7 (`STATIC_ASSETS`).
   - The file does not exist in `public/`.
   - `sw.js` uses `cache.addAll(STATIC_ASSETS)`. When `/favicon.ico` returns 404, the entire Service Worker install event rejects!
2. **Missing `/logo.png` in Structured Data:**
   - `components/public/HospitalJsonLd.tsx` line 12 references `logo: "${SITE_CONFIG.canonicalUrl}/logo.png"`.
   - `logo.png` does not exist in `public/`. Google Structured Data testing tool will fail logo validation.
3. **Nonexistent Routes in `robots.txt`:**
   - `public/robots.txt` advertises:
     - `Allow: /departments` (404 / nonexistent)
     - `Allow: /diagnostic` (404 / nonexistent)

### Public Appointment Flow Integrity & UX Defects (P1)
- **Hardcoded Defaults:** `app/(public)/appointment/page.tsx` pre-selects `age = "30"` and `gender = "MALE"`. Violates user input integrity. Must default to blank age and unselected gender.
- **Client-Side `alert()`:** `handleBookAppointment` uses `alert("Please select...")` which halts the main thread and fails WCAG accessibility standards. Must use accessible inline form error alerts.
- **Simulated SMS Claim:** Confirmation screen renders `<span className="font-bold">SMS Dispatched: ...</span>`, misleading patients that an SMS was delivered when no active external SMS gateway is wired in this flow.
- **Timezone Semantics:** Ensure all date and day-of-week checks use `Asia/Dhaka` strictly.

### Public Contact Form Abuse Surface (P1)
- **Unrestricted Anonymous Inserts:** `submitContactInquiryAction` in `lib/public/actions.ts` writes directly to `public_contact_inquiries` without payload length limits, rate limiting, or sanitization against oversized submissions.

### Semantic Misrepresentation in Hospital Header (P1)
- **Audit Logs as Fake Notifications:** `components/app/HospitalHeader.tsx` queries `audit_logs` and displays them as "System Notifications" with fake "Unread" badges and a non-functional "Mark all as read" button. Must be refactored to "Recent System Activity" with truthful audit trail semantics.

### Legal Content Inaccuracy (2026 Bangladesh Data Protection Act) (P1)
- **Incorrect Section Mapping:** `app/(public)/privacy/page.tsx` line 73 claims "Under Section 18 of the BD Data Protection Act 2026, patients registered with Onnesha Hospital hold explicit statutory rights: Right to Access...".
- **Statutory Truth:** In the Bangladesh Personal Data Protection Act 2026:
  - Section 11: Right to Access
  - Section 12: Right to Rectification / Correction
  - Section 13: Right to Withdraw Consent
  - Section 17: Security & Technical Safeguards
  - Section 18: Data Retention & Disposal
  - Section 20: Security Breach Notification
- **Fictional DPO:** `dpo@onneshahospital.com` and fictional DPO titles must be removed in favor of authentic hospital contact and administration desk references.

### Fabricated Marketing & Technical Claims (P2)
- "256-bit TLS and RLS এনক্রিপশন" (`about/page.tsx`, `page.tsx`).
- "Official DGHS-standard pathology tariff schedule" (`services/page.tsx`).
- "Intensive Care Unit (ICU & CCU)", "Laminar air-flow system with HEPA filtration", "Modern Modular Operation Theater (OT)" (`services/page.tsx`, `HospitalJsonLd.tsx`).
- Must be rewritten to reflect truthful, standard hospital services and clinical operations.

### SEO & Sitemap Dynamic Modification Timestamp (P2)
- `app/sitemap.ts` uses `lastModified: new Date()`, which changes on every single build, falsifying actual page modification history to search crawlers.

---

## 3. Remediation Roadmap

1. **Step 1:** Architecture consolidation — decommission unexecutable `proxy.ts` / server middleware, update build configs.
2. **Step 2:** Database RPC for public queue — create Migration 55: `get_public_live_queue` with zero PII exposure.
3. **Step 3:** Generate valid `favicon.ico` and `logo.png` assets in `public/`.
4. **Step 4:** Clean `robots.txt` (remove `/departments`, `/diagnostic`) and fix `sitemap.ts` (stable release lastModified).
5. **Step 5:** Harden `app/(public)/appointment/page.tsx` (remove false defaults, remove `alert()`, accessible error UI, truthful confirmation wording).
6. **Step 6:** Harden contact inquiry action (strict validation, length limits, anti-abuse checks).
7. **Step 7:** Correct `privacy/page.tsx`, `terms/page.tsx`, and `consent/page.tsx` legal sections and remove fake DPO.
8. **Step 8:** Refactor `HospitalHeader.tsx` to "Recent System Activity" without fake unread counts.
9. **Step 9:** Sanitize `services/page.tsx`, `about/page.tsx`, and `HospitalJsonLd.tsx` of unsupported superiority and facility claims.
10. **Step 10:** Update `public/_headers` (remove `'unsafe-eval'`).
11. **Step 11:** Implement targeted test suites and execute the complete quality gate.
