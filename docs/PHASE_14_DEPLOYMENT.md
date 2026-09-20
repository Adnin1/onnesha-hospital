# Phase 14: Deployment & Cloudflare Architecture Audit

## 1. Current Deployment State
- **Platform**: Cloudflare Pages (`https://onnesha-hospital.pages.dev`).
- **Mode**: Static Export (`output: "export"`).
- **Pages/Routes**: 32 statically exported HTML/JS bundles.
- **Backend**: Supabase Managed PostgreSQL with server actions executing via client SDKs.

## 2. Cloudflare Next.js Recommendations & Future Path
- Cloudflare's current documentation recommends **Cloudflare Workers with vinext** (`@cloudflare/vinext`) for full-stack Next.js applications (enabling SSR, Edge Route Handlers `/api/*`, and Cloudflare Queues).
- However, `vinext` is currently in beta. Blindly migrating now would risk destabilizing the production hospital portal.
- **Strategy**: Phase 14 implements clean adapter and processor abstractions that run seamlessly in both client-side static contexts and edge/server worker functions. Formal migration to Cloudflare Workers is queued for Phase 18 (Production Infrastructure & Domain Hardening) after full compatibility verification.
