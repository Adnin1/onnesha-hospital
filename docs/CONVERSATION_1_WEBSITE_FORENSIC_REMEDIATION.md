# Forensic Verification & Remediation Report: Conversation 1
## Website, UI/UX, Performance, SEO, and Role Security Overhaul

**Target Version:** v1.1.4 Baseline Refinement  
**System:** Onnesha Hospital Management & ERP (OHMS ERP)  
**Verification Date:** September 2026  
**Auditor / Agent:** Antigravity (Google DeepMind)  
**Status:** COMPLETE & VERIFIED (Quality Gates 100% Passed)

---

### 1. Executive Summary

This report documents the forensic investigation and complete remediation of the public website, authenticated staff portals, design system, navigation structures, and role authorization presentation in the Onnesha Hospital ERP repository (`Adnin1/onnesha-hospital`).

Prior to this workstream, several high-risk cosmetic illusions and clinical inaccuracies existed in the frontend layer, including client-side role impersonation dropdowns, fabricated notification toasts, unverified marketing claims, unbounded database queries in dashboard metrics, and arbitrary hardcoded financial values in reports.

All listed defects have been resolved with strict compliance to production standards, React 19 / Next.js best practices, and zero mock/fabrication policies.

---

### 2. Forensic Findings & Deficiencies Remediated

| # | Component / Route | Severity | Defect Identified | Remediation Applied |
|---|---|---|---|---|
| 1 | `components/app/HospitalSidebar.tsx` | **CRITICAL** | Client-side `<select>` role switcher allowed any user to toggle between `doctor`, `admin`, `super_admin`, etc., creating the illusion of client-driven privilege escalation. | Removed `<select>` element entirely. Integrated `getCurrentUserSession()` to query verified Supabase staff session role. Displayed read-only "Verified Staff Role" badge. |
| 2 | `components/app/HospitalHeader.tsx` | **HIGH** | Header rendered hardcoded fake notifications (`B-007 Bed Assigned`, `CBC test verified for OH-000101`, `Ciprocin 500mg Low Stock`), misleading clinical operators. | Removed all static arrays. Integrated real live queries to `audit_logs` table with fallback to an honest empty state ("No unread notifications"). Throttled clock update from 1s to 30s. Added keyboard/outside-click listeners. |
| 3 | `app/(public)/page.tsx` & `check-token/page.tsx` | **HIGH** | Displayed "Realtime" badge despite using a 15-second interval timer. Contained unverified operational claims ("100% transparent billing", "fully automated analyzers", "এন্ড-টু-এন্ড এনক্রিপশন"). | Renamed badge to "Auto-refresh (15s)". Rewrote marketing copy to represent verified clinical services and standard encryption without fabricated superlatives. |
| 4 | `app/(hospital)/app/dashboard/page.tsx` | **HIGH** | Fetched all bed rows to compute occupancy client-side; unbound invoice fetching without timezone boundaries; missing rapid-click protection; metric errors collapsed whole dashboard. | Converted bed counts to server-side `head: true` index queries. Bounded invoice queries to Asia/Dhaka day boundaries with `limit(500)`. Added `actionInProgressId` guard against double-clicks. Implemented independent error fallbacks ("Unavailable"). |
| 5 | `app/(hospital)/app/reports/page.tsx` | **HIGH** | Hardcoded 20% commission fallback (`commRate = 20`), hardcoded consultation fee fallback (800 BDT), hardcoded room number ("101"). Lacked date and status filters. | Removed all arbitrary financial constants. Replaced client slicing with full-dataset `grand_total` accounting. Added interactive date range filters (`today`, `7days`, `30days`, `all`) and invoice status filters (`all`, `paid`, `due`, `void`). |
| 6 | Canonical Domain Architecture | **MEDIUM** | Inconsistent canonical URLs between `onneshahospital.com` and `onnesha-hospital.pages.dev` across meta tags, sitemaps, and JSON-LD. | Created `config/site.ts` as single source of truth (`https://onneshahospital.com`). Unified `layout.tsx`, `sitemap.ts`, and `HospitalJsonLd.tsx`. |
| 7 | `public/_headers` | **MEDIUM** | Missing Content-Security-Policy (CSP) headers for production Cloudflare Pages deployment. | Implemented robust CSP header permitting `'self'`, Next.js Turbopack inline scripts, Supabase API/Auth domains, and canonical origins. |

---

### 3. File Inventory of Changes

#### Created Files:
1. `config/site.ts` - Master domain, branding, and canonical site configuration.
2. `tests/phase35-website-ux-role-forensics.test.mjs` - 12 automated forensic regression tests verifying all fixed behaviors.
3. `docs/CONVERSATION_1_WEBSITE_FORENSIC_REMEDIATION.md` - This report.

#### Modified Files:
1. `app/layout.tsx` - Metadata canonical URL and OpenGraph consolidation.
2. `app/sitemap.ts` - Dynamic sitemap referencing canonical production host.
3. `components/public/HospitalJsonLd.tsx` - Schema.org Hospital markup with verified address and canonical URL.
4. `components/app/HospitalSidebar.tsx` - Role switcher removal, real session derivation, accessible landmarks.
5. `components/app/HospitalHeader.tsx` - Fake notification elimination, real audit log fetch, 30s clock throttle.
6. `app/(public)/page.tsx` - Auto-refresh badge honesty, unverified claim purge.
7. `app/(public)/check-token/page.tsx` - Honest queue timing description.
8. `app/(hospital)/app/dashboard/page.tsx` - Server-side `head: true` counts, Asia/Dhaka time boundaries, click debouncing.
9. `app/(hospital)/app/reports/page.tsx` - Real commission calculation, date/status filtering, accurate accounting.
10. `public/_headers` - Content-Security-Policy (CSP) production hardening.

---

### 4. Verification Evidence & Quality Gates

All six quality gates were executed locally with zero errors or bypasses:

```
======================================================================
GATE 1: TypeScript Static Typecheck
Command: npm run typecheck
Result:  PASS (0 errors)
======================================================================
GATE 2: ESLint Code Quality
Command: npx eslint . --max-warnings 0
Result:  PASS (0 errors, 0 warnings)
======================================================================
GATE 3: Dependency Security Audit
Command: npm audit --audit-level=high
Result:  PASS (found 0 vulnerabilities)
======================================================================
GATE 4: Certification Regression Test Suite
Command: npm run test:certification
Result:  PASS (55/55 test suites passed, 479 active passes, 0 failures, 0 blocked)
======================================================================
GATE 5: Next.js Static Export & Production Build
Command: npm run build
Result:  PASS (43 static routes compiled and prerendered)
======================================================================
GATE 6: Playwright Chromium Real Browser E2E Suite
Command: npx playwright test --project=chromium
Result:  PASS (22/22 browser specs passed in 14.4s)
======================================================================
```

---

### 5. Handoff to Conversation 2: Database Architecture & ERP Accounting

With the frontend presentation layer, website honesty, UI accessibility, and role presentation verified, the baseline is certified for **Conversation 2**:
1. Deep audit of 51 Supabase migrations against actual ERP business logic.
2. Verification of double-entry ledger debit/credit balance constraints.
3. Three-way matching (PO -> GRN -> Supplier Bill) enforcement at database trigger level.
4. Concurrency controls on pharmacy inventory (`SELECT FOR UPDATE` or atomic inventory decrement RPCs).
5. Comprehensive RLS review with `SECURITY DEFINER` function search-path isolation.
