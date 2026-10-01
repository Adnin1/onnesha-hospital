# OHMS Next.js Static Export Architecture Audit & Edge Evaluation

**Document Purpose:** Architectural assessment of Next.js `output: "export"` against Cloudflare Pages Edge and Supabase BaaS for the Onnesha Hospital Management System (OHMS).  
**Baseline Release:** `v1.1.30`  
**Verdict:** `APPROVED STATIC ARCHITECTURE` — Static export is technically optimal, secure, and performant; blind migration to Cloudflare Workers is unnecessary and counter-recommended.

---

## 1. Architectural Inventory & Feature Classification

Every system capability is classified according to the 4-tier security & runtime rubric:
- **[A] Safe in Browser / Static Edge:** Prerendered HTML/JS assets served by Cloudflare Pages CDN edge.
- **[B] Must Remain Database RPC:** Direct client-to-PostgreSQL operations secured by Row Level Security (RLS) and stored procedures.
- **[C] Must Move to Secure Server-Side Function:** Operations requiring sensitive third-party API credentials, secret signing keys, or webhook ingress.
- **[D] External Owner Gate:** Real-world merchant credentials, physical devices, or regulatory validations.

| Subsystem / Feature | Current Implementation | Architectural Classification | Security & Invariant Rationalization |
|:---|:---|:---:|:---|
| **Public Website Routes** (`/`, `/about`, `/services`, `/doctors`, `/contact`, `/privacy`, `/terms`, `/consent`) | Prerendered HTML via `output: "export"` | **[A]** Safe in Browser / Static Edge | Zero server execution needed. Assets cached at Cloudflare Edge. Zero database credentials required for unauthenticated views. |
| **Public Interactive Islands** (`/appointment`, `/check-token`) | React Client Components (`"use client"`) | **[A]** Safe in Browser / Static Edge | Interactive lookup and validation run client-side. Anonymous database reads hit shielded PostgREST views/RPCs with zero PHI leakage. |
| **Authentication & MFA** (`/login`, `/mfa`, `/forgot-password`, `/reset-password`) | `@supabase/ssr` / `@supabase/supabase-js` Auth | **[A]** Safe in Browser / Static Edge | Auth flows communicate directly with Supabase Auth service. Client bundle only contains public publishable/anon key; tokens are stored in secure browser session storage. |
| **Clinical Directory & EMR** (`patients`, `appointments`, `opd`, `ipd`, `beds`, `critical-care`, `lab`, `radiology`) | Client-side fetch via Supabase SDK | **[B]** Must Remain Database RPC | Multi-tenant PostgreSQL RLS enforces tenant isolation (`app.current_organization_id`) and RBAC permissions. Atomic mutations use PostgreSQL stored procedures. |
| **Pharmacy & Inventory** (Batch tracking, dispensing, stock decrement) | Supabase client + DB constraints | **[B]** Must Remain Database RPC | Non-negative stock constraints (`CHECK (stock_quantity >= 0)`) enforced at database level. Zero business logic trust placed in client. |
| **Billing & General Ledger** (Invoicing, payments, 3-way match, reversals) | PostgreSQL Stored Procedures (`SECURITY DEFINER`) | **[B]** Must Remain Database RPC | Transactions are strictly atomic in PostgreSQL (`void_invoice_atomic`, `reverse_journal_atomic`). Mandatory audit justification logging in `audit_logs`. |
| **Payment Gateway Checkout** (bKash, Nagad, SSLCommerz) | Supabase Edge Function (`supabase/functions/payment-initiate`) | **[C]** Secure Server-Side Function + **[D]** Gate | Merchant keys (`BKASH_APP_SECRET`, `NAGAD_PRIVATE_KEY`) reside exclusively in Edge Function environment. Never exposed to browser bundle. |
| **Payment Webhook Callbacks** (bKash IPN, Nagad IPN, SSLCommerz IPN) | Supabase Edge Function (`supabase/functions/payment-callback`) | **[C]** Secure Server-Side Function + **[D]** Gate | Requires HMAC-SHA256 signature verification and asynchronous settlement callback. Isolated from frontend static bundle. |
| **Transactional Outbox Notifications** (SMS, WhatsApp, Email) | Client enqueues to `notification_outbox` table | **[B]** DB Outbox + **[C]** Server Dispatch + **[D]** Gate | Client never contacts SMS/WhatsApp APIs directly. Jobs enqueued in PostgreSQL with idempotency keys; background worker dispatches with provider API keys. |
| **File Storage & Clinical Documents** (Prescriptions, lab attachments) | Supabase Storage (`storage.objects`) | **[B]** Must Remain Database RPC | Multi-tenant storage RLS policies verify active organization membership, permission, and patient path boundary. |
| **Desktop Client** (Windows Tauri 2 MSI / NSIS) | Tauri 2 Webview loading `../out` | **[A]** Desktop Client Shell | Uses identical static export distribution (`../out`) with strict CSP. Zero service role secrets compiled into Rust binary. |

---

## 2. Cloudflare Pages vs. Cloudflare Workers Evaluation

### Analysis: Why Cloudflare Pages Static Export is Superior for OHMS
1. **Attack Surface Minimization:**
   - With `output: "export"`, there is no running Node.js or V8 server runtime on the web origin.
   - Attackers cannot exploit SSR injection, server prototype pollution, or Node.js SSR memory leaks.
2. **Deterministic Edge Performance:**
   - All 58 static routes are prerendered and geographically distributed across Cloudflare's 330+ edge data centers.
   - Time To First Byte (TTFB) is ~15–30ms globally; Largest Contentful Paint (LCP) is well within the ≤2.5s good threshold.
3. **Strict Separation of Concerns:**
   - **Frontend:** Pure presentation, routing, client-side state, and accessibility shell.
   - **Data Layer:** PostgreSQL (Supabase) with database-enforced Row Level Security (RLS) and cryptographic session JWT verification.
   - **Secrets Execution:** Supabase Edge Functions for third-party merchant and payment callbacks.
4. **Conclusion on Cloudflare Workers / vinext Migration:**
   - Migrating to Cloudflare Workers (SSR / vinext) would introduce cold-start latency, unnecessary runtime dependencies, and configuration overhead without providing any security or clinical capability that is not already superiorly handled by Supabase Edge Functions and PostgreSQL RLS.
   - **Decision:** Retain Next.js `output: "export"` deployed to Cloudflare Pages.

---

## 3. Edge Headers & Content-Security-Policy (CSP) Verification

The static export relies on `public/_headers` for edge security enforcement:
- **`Strict-Transport-Security`:** `max-age=31536000; includeSubDomains; preload`
- **`X-Content-Type-Options`:** `nosniff`
- **`X-Frame-Options`:** `DENY`
- **`Referrer-Policy`:** `strict-origin-when-cross-origin`
- **`Permissions-Policy`:** Restricts camera, microphone, geolocation to necessary contexts.
- **`Content-Security-Policy`:**
  - `default-src 'self'`
  - `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://onnesha-hospital.pages.dev`
  - `img-src 'self' data: https: blob:`
  - `style-src 'self' 'unsafe-inline'`
  - Zero `unsafe-eval` in CSP.
  - Private clinical routes (`/app/*`) are explicitly marked with `Cache-Control: no-store, no-cache, must-revalidate`.
