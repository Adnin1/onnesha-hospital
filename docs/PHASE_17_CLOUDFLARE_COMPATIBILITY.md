# Phase 17 — Cloudflare Compatibility

## Current Architecture
- **Deployment**: Cloudflare Pages (static export)
- **Build Output**: `output: "export"` → `out/` directory
- **Pages**: 32 static HTML pages
- **Middleware**: `proxy.ts` (runs as Cloudflare Pages Function at edge)
- **Headers**: `public/_headers` with security headers and cache controls

## Compatibility Assessment

### Current Static Export — Fully Compatible ✅
- Cloudflare Pages handles static files perfectly
- `_headers` file correctly applied
- Service worker (`sw.js`) served as static file
- PWA manifest served as static file
- All Supabase interactions are client-side

### Workers + vinext Assessment
- Cloudflare currently recommends **Workers + vinext** for full-stack Next.js
- vinext is in **beta** — not recommended for production hospital systems
- Current static export provides:
  - Zero cold-start latency
  - Global CDN distribution
  - Simple deployment pipeline
  - No server-side compute costs

### Recommendation for Phase 18+
- **Do NOT migrate to Workers/vinext** in this phase
- Evaluate vinext when it reaches stable release
- If server-side features are needed (API routes, SSR):
  1. Assess vinext compatibility with current routes
  2. Test in staging environment
  3. Verify Supabase middleware compatibility
  4. Ensure print/document generation still works
  5. Only migrate after thorough testing

### Current Deployment Pipeline
```
npm run build → next build (static export) → wrangler pages deploy out/
```
- Auto-deploy script: `scripts/auto-deploy.mjs`
- Build → Deploy → GitHub sync (all automated)

## No Changes Required for Phase 17
Current Cloudflare Pages deployment is preserved without modification.
