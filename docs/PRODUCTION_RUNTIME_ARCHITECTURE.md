# Production Runtime Architecture Specification

> [!IMPORTANT]
> **ARCHITECTURE TRUTH DIRECTIVE:** This document details the exact technical runtime architecture of Onnesha Hospital & Diagnostic Complex as deployed in production. It clearly distinguishes between client-side execution, CDN static hosting, and Supabase server-side services.

---

## 1. Overview & Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                              ONNESHA HOSPITAL PLATFORM                            |
+-----------------------------------------------------------------------------------+
                                          |
     +------------------------------------+------------------------------------+
     |                                    |                                    |
     v                                    v                                    v
+--------------------------+  +--------------------------+  +--------------------------+
|  Cloudflare Pages CDN    |  |  Windows Desktop Client  |  |  Progressive Web App     |
|  (Static Next.js Export) |  |  (Tauri 2 Windows App)   |  |  (PWA Service Worker)    |
|  - 40 Pre-rendered Pages |  |  - Windows Native Shell  |  |  - Network-First Cache   |
|  - Client AuthGuard      |  |  - Shared Next.js Views  |  |  - No PHI Local Storage  |
+--------------------------+  +--------------------------+  +--------------------------+
             |                                    |                                    |
             +------------------------------------+------------------------------------+
                                          |
                                          v (HTTPS / TLS 1.3)
                    +----------------------------------------------+
                    |  Supabase Cloud Managed Backend              |
                    |  - Auth & TOTP MFA (AAL1 -> AAL2 Elevation)  |
                    |  - PostgreSQL Database with RLS Policies     |
                    |  - Row-Level Security (organization_id)      |
                    |  - Realtime Change Data Capture              |
                    |  - Storage Buckets (Medical Records / Logs)  |
                    +----------------------------------------------+
```

---

## 2. Component Execution Breakdown

### A. Client-Side Browser Runtime
- **Location:** User Web Browser / PWA / Tauri Desktop Webview.
- **Responsibilities:**
  - Rendering UI pages and forms.
  - Interactive clinical consoles (OPD, IPD, Prescriptions, Lab, Billing, Pharmacy).
  - Executing `AuthGuard.tsx` session validation and TOTP MFA challenge verification.
  - Submitting authentications via `@supabase/ssr` (`createBrowserClient`).
  - Directly executing RLS-protected GraphQL/REST/PostgreSQL requests against Supabase API.

### B. CDN Edge Runtime (Cloudflare Pages)
- **Location:** Cloudflare Global Anycast Edge Network.
- **Responsibilities:**
  - Serving pre-compiled HTML, JS, CSS, fonts, icons, and PWA assets.
  - Applying HTTP security headers via `public/_headers` (HSTS, X-Frame-Options, Content-Security-Policy).
  - Fast global static asset delivery with zero cold starts.

### C. Server-Side Managed Backend (Supabase Managed Cloud)
- **Location:** Supabase Cloud Infrastructure (PostgreSQL 15+).
- **Responsibilities:**
  - **Authentication:** Password validation, JWT token issuance, refresh token rotation, TOTP factor enrollment, TOTP challenge verification, AAL assurance level management (`aal1` → `aal2`).
  - **Authorization:** Enforcement of Row Level Security (RLS) policies on all tables (`organization_id` matching, RBAC role permission matching).
  - **Audit Trail:** Automatic timestamping and mutation auditing.
  - **Storage:** Secure file storage with bucket RLS policies.

---

## 3. Server-Side Protection vs. Static Export Clarification

In Next.js static export mode (`output: "export"` in `next.config.ts`), Next.js HTTP server middleware (`proxy.ts` / `middleware.ts`) is pre-rendered at build time. On static CDNs like Cloudflare Pages:

1. **Client-Side AuthGuard Enforces Access:**
   - Every protected route under `/app/*` is wrapped by `AuthGuard.tsx` in `app/(hospital)/app/layout.tsx`.
   - Before rendering the control panel interface, `AuthGuard` queries `@supabase/ssr` for the active user session and `getAuthenticatorAssuranceLevel()`.
   - If the user is unauthenticated, they are immediately redirected to `/login`.
   - If the user has `super_admin` or `admin` role and their session is `aal1` with an enrolled TOTP factor, they are redirected to `/mfa` to complete 2FA elevation before accessing privileged pages.

2. **Database Level Enforcement (RLS Is The Primary Security Perimeter):**
   - Even if a malicious user bypasses client-side JavaScript, all database queries are subject to Supabase Row Level Security (RLS).
   - Unauthenticated or unauthorized HTTP requests to Supabase API are rejected at the database engine level with 403 / 401 response codes.

---

## 4. Webhooks & Server-Side Functions

For external webhook callbacks (such as bKash, Nagad, SSLCommerz payment gateways) or scheduled cron tasks:
- **Cloudflare Pages Functions** (`functions/api/payment-webhook.js`) or **Supabase Edge Functions** execute server-side Node/Deno JavaScript with access to `SUPABASE_SERVICE_ROLE_KEY` (kept strictly in environment secrets, never exposed to the client bundle).
