# Phase 17 — Performance

## Optimizations Implemented

### Bundle Cleanup
- Removed 5 unused SVG files: `next.svg`, `vercel.svg`, `window.svg`, `file.svg`, `globe.svg`
- Dependencies remain lean: 8 production deps, 7 devDeps

### Query Optimization
- No `select('*')` found — all queries use named columns ✅
- No localStorage/sessionStorage usage ✅
- No N+1 patterns detected in current server actions

### Static Export
- `output: "export"` preserved — 32 static pages
- All pages pre-rendered as static HTML
- Data fetching is client-side via Supabase SDK

### Service Worker Caching
- Static assets cached for instant repeat loads
- Network-first for dynamic content
- Versioned cache with automatic cleanup

### Web Vitals Measurement
- `lib/web-vitals.ts`: Lightweight CWV tracking (LCP, CLS, INP)
- No PII in telemetry — anonymous route paths only
- Console logging in development

### Image Optimization
- PWA icons use SVG format (scalable, small file size)
- `images.unoptimized: true` in next.config (required for static export)

## Known Limitations
- Client-side pagination not yet added to all large tables (audit logs paginated via `getAuditLogsAction`)
- Dynamic imports for print components not yet implemented (print components are only loaded on print routes)
- No Lighthouse CI integration yet
