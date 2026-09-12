# PHASE 2 CURRENT REPOSITORY AUDIT & TECHNICAL BASELINE
**Project:** Onnesha Hospital Management System (OHMS)  
**Date:** September 13, 2026  
**Next.js Runtime:** 16.3.5 (Turbopack, App Router, React 19.2.8)  

---

## 1. What Already Exists & Is Reusable

1. **Complete Routing Topology (28 Routes):**
   - **Public:** `/`, `/about`, `/services`, `/departments`, `/doctors`, `/appointment`, `/diagnostic`, `/check-token`, `/contact`.
   - **Authentication:** `/login` with 1-click role switcher demo and clean modern card layout.
   - **Hospital Portal:** `/app/dashboard`, `/app/patients`, `/app/doctors`, `/app/appointments`, `/app/opd`, `/app/ipd`, `/app/emergency`, `/app/billing`, `/app/lab`, `/app/pharmacy`, `/app/beds`, `/app/ot`, `/app/prescriptions`, `/app/hr`, `/app/reports`, `/app/settings`.
2. **App Shell & Layouts:**
   - `HospitalSidebar.tsx`: Fully categorized responsive sidebar with desktop collapsible state and mobile sliding drawer.
   - `HospitalHeader.tsx`: Role indicators, live clock, user profile menu, and notification trigger.
   - `HospitalPrintHeader.tsx`: 80mm POS slip and A4 official pad printing headers.
3. **Utilities & Types:**
   - `lib/utils.ts`: Standard BDT currency and Dhaka timezone date formatters.
   - `types/index.ts`: Strongly typed interfaces across 15 hospital domain entities.

---

## 2. Deficiencies & What Must Be Refactored

1. **Authentication:**
   - *Previous state:* Handled via client-side `localStorage.setItem("onnesha_user_role", ...)` and client-side cookie string.
   - *Refactoring:* Connect to real Supabase Auth (`supabase.auth.signInWithPassword`), HttpOnly cookies via `@supabase/ssr`, server-side session retrieval, and real user profile lookup.
2. **Permission Engine:**
   - *Previous state:* Hardcoded `DEFAULT_ROLE_PERMISSIONS` dictionary in `lib/permissions.ts`.
   - *Refactoring:* Build real `hasPermission()`, `requirePermission()` server-side utilities, tenant-aware roles, and flexible role resolution.
3. **Application Shell Integration:**
   - Connect sidebar and header to live authenticated profile, active organization context, and dynamic permission evaluation instead of raw `localStorage`.
4. **Global Feedback States:**
   - Missing unified loading skeletons, empty state visual cards, and user-friendly error boundaries across routes.

---

## 3. What Must Remain Untouched

- Public presentation pages (`app/(public)/*`) must remain intact without visual breakage.
- The 28 static and client-side route components will be preserved in layout structure.
- No working UI modules will be thrown away.
