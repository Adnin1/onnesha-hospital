# CLOUDFLARE EDGE & PRODUCTION DEPLOYMENT RUNBOOK
**Project:** Onnesha Hospital Management System (OHMS)  
**Edge Platform:** Cloudflare Pages / Workers  
**Target URL:** `https://onnesha-hospital.pages.dev` / `https://www.onneshahospital.com`  

---

## 1. Deployment Pipeline
The application builds as an optimized static export bundled with Cloudflare Workers serverless Edge handlers:
1. `npm run build` generates optimized assets in `out/`.
2. `npx wrangler pages deploy out --project-name=onnesha-hospital` deploys atomic updates across Cloudflare's global Anycast CDN in under 15 seconds.
3. Automated deploy pipeline: `npm run deploy` automatically builds, deploys to Cloudflare, and syncs commits to GitHub.

---

## 2. Health Monitoring
Health check endpoint `/api/health` monitors platform availability without leaking database credentials or server metadata.
