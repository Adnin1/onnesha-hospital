# OHMS FINAL EXECUTION QUEUE — PHASE 2

**System:** Onnesha Hospital Management System (OHMS v1.1.47)  
**Baseline HEAD:** `c8b24ff1b101da04a9ab020a75174f9cdfd67996`  
**Updated:** 2026-10-06T02:54:00+06:00  

| ID | DOMAIN | PROBLEM | ROOT CAUSE | ACTION | STATUS | EVIDENCE | OWNER DEPENDENCY | PRIORITY |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---:|
| **Q-01** | `CI/CD` | GitHub legacy `/status` API returns 0 checks | Modern GitHub Actions reports to Check Runs API (`/check-runs`), not legacy status API | Reconciled telemetry, verified all 4 check runs | `CLOSED` | Check Runs API shows `Mandatory CI: success` | None | **P0** |
| **Q-02** | `Security` | Missing staging secrets blocks automatic release | Staging secrets `OHMS_TEST_SUPABASE_URL` not yet in GitHub Secrets | Enforce fail-closed architecture to prevent unverified release | `CLOSED` | CI fail-closed behavior verified; staging gate safely blocks release | Gate G10 (Owner action) | **P0** |
| **Q-03** | `Hardware` | ZKTeco UI previously defaulted to fake `CONNECTED` state | Simulation testbed had hardcoded `zkStatus = "CONNECTED"` and sample punch rows | Set initial status to `STANDBY_SIMULATION_READY`, amber indicator, empty state notice | `CLOSED` | Hardened in `app/(hospital)/app/settings/hardware/page.tsx` | Gate G7 (On-site LAN) | **P0** |
| **Q-04** | `Desktop` | Public download portal could claim unreleased CI binary | Git tags exist up to `v1.1.47` but GitHub Release asset job skipped on G10 | Set `artifact_status: "PENDING_CI_BUILD"` in `latest.json` and serve historical verified release | `CLOSED` | Live `latest.json` on Cloudflare Pages and Playwright spec 7 | Gate G10 & Gate G15 | **P0** |
| **Q-05** | `Database` | Migration parity and lint needed fresh verification | Previous reports are historical, not forward proof | Ran `supabase migration list` (108/108) and `db lint --linked` (0 fatal errors) | `CLOSED` | Live CLI output: 108/108 match, 0 fatal lint errors | None | **P0** |
| **Q-06** | `Deployment`| Cloudflare live edge parity needed proof on clean HEAD | Code committed locally must match live edge | Deployed static export via Wrangler (`commit-dirty=false`) to Cloudflare Pages | `CLOSED` | Live deployment `5d5f286a` active on `onnesha-hospital.pages.dev` | Gate G16 (Custom DNS) | **P0** |
| **Q-07** | `Website` | Full-stack website routes, assets, and E2E acceptance | Needed multi-browser verification on clean tree | Executed route acceptance (59/59), asset audit (0 broken), and 4-browser E2E (52/52) | `CLOSED` | `audit:routes`, `audit:assets`, and Playwright test logs | None | **P1** |
| **Q-08** | `SEO / A11y`| Pre-rendered structured data & WCAG 2.2 AA adherence | Static export can lack crawlable server components if improperly configured | Verified JSON-LD structured data and semantic HTML in pre-rendered static shells | `CLOSED` | HTML static output analysis and Playwright a11y specs | None | **P1** |
| **Q-09** | `Hardware` | Universal HAL driver suite verification | Low-level drivers needed regression check | Executed 28 hardware unit tests across DICOM, ESC/POS, LIS, Scanner, and ZKTeco | `CLOSED` | `node --test tests/hardware/*.test.mjs` (28/28 passed) | Gates G5–G9 | **P1** |
| **Q-10** | `Governance`| Absence of permanent engineering governance file | Context resets could lose operational and zero-false-green policies | Created `docs/OHMS_PERMANENT_ENGINEERING_GOVERNANCE.md` | `CLOSED` | File tracked in Git mainline | None | **P2** |
| **Q-11** | `Branching` | GitHub `main` branch lacks branch protection rules | Requires repository administrator permissions | Prepared exact branch protection ruleset instructions for owner | `CLOSED` | Instructions documented in certification report | Owner Action Required | **P1** |
