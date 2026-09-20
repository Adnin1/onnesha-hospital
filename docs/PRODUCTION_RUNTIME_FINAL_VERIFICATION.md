# Onnesha Hospital Management System — Production Runtime Verification

This document evaluates the Cloudflare hosting architecture and production runtime execution model for Onnesha Hospital Management System (OHMS).

---

## ☁️ Cloudflare Pages & Full-Stack Next.js Evaluation

### Current Target Architecture
- **Host Provider:** Cloudflare Pages
- **Export Strategy:** Next.js Static Export (`output: "export"`) with Client-Side Supabase SSR/Browser SDK.
- **Backend Infrastructure:** Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS) and Server Actions / Browser Client SDK.

### Architectural Fit Analysis
1. **Static Export + Client Auth (Current Implemented Model):**
   - **Pros:** Ultra-fast TTFB globally on Cloudflare Edge CDN, 0 server-side cold starts, full offline/PWA caching capabilities via Service Worker.
   - **Cons:** Middleware and Node.js server-side dynamic rendering are rendered client-side via AuthGuard and client SDK calls.
2. **Workers / vinext Path (Optional Cloudflare Upgrade Path):**
   - Recommended by Cloudflare if full server-side Next.js SSR / API routes are required directly on Edge Workers.

### Security & Environment Hardening
- **Zero Hardcoded Production Passwords:** All admin passwords and TOTP secrets are strictly removed from git commits and test suites.
- **Environment Variable Binding:** Supabase URL and Anon keys are injected via environment variables.
- **Canonical Domain:** `https://onneshahospital.com` (supported by fallback to live `https://onnesha-hospital.pages.dev`).
