---
name: ship
description: >-
  Autonomous Production Shipping & Verification Engine (SWARM GODMODE v5.0).
  Executes full verification, test suites, edge deployment to Cloudflare Pages, git commit, and empirical closure report.
---

# AUTONOMOUS PRODUCTION SHIP ENGINE v5.0

Activate this skill whenever the user invokes /ship, SHIP, /gsd-ship, or requests production delivery.

## Universal Shortcuts & Triggers
- /ship, /godmode, /auto-pilot, /autopilot, /swarm, /auto, /apex, /apex-engine, /gsd-ship, /nije-koro
- 
ije koro | নিজে করো | 
ije nije sob kore dao | নিজে নিজে সব করে দাও | সব নিজে নিজে করো
- নিজে নিজে করে দাও | সব কাজ নিজে নিজে কমপ্লিট করো | একদম শেষ করে দাও
- SHIP, DEPLOY, PRODUCTION, Deliver to production, APEX: RUN

---

## Production Ship Sequence
1. Deterministic local telemetry check (git status, 
pm run typecheck, 
pm run lint)
2. Automated test suite execution (Node test runner + Playwright 4-browser E2E)
3. Database migration parity & RLS verification (supabase migration list)
4. Production static export & edge deployment verification (Cloudflare Pages)
5. Clean atomic git commit & empirical closure report with zero false greens