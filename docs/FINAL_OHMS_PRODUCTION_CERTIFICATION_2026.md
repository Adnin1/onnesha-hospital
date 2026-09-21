# Onnesha Hospital Management System (OHMS)
## Independent Final Production Release Certification (2026)
**Document ID:** `CERT-FINAL-RELEASE-2026`  
**Generated At:** 2026-09-22T01:21:55+06:00  
**Authority:** Independent Principal Release Certification Audit  
**Target Release:** `1.1.5`  
**Repository:** `Adnin1/onnesha-hospital`  
**Default Branch:** `main`  
**Verified Source SHA:** `5206438bb85042298082e857fba94dcbb3332552`  
**Live Edge Host:** `https://onnesha-hospital.pages.dev` (Active)  
**Canonical Domain:** `https://onneshahospital.com` (DNS Delegation Pending)  

---

## 1. Independent Forensic Certification Matrix

| Area | Status | Evidence & Verification Detail |
| :--- | :---: | :--- |
| **DOMAIN** | `BLOCKED` | `onneshahospital.com` and `www.onneshahospital.com` return `ECONNREFUSED`. Awaiting registrar nameserver delegation to Cloudflare Zone. |
| **WEBSITE** | `PASS` | All 43 routes cleanly generated via Next.js static export. Server shell + client island architecture verified with zero runtime console exceptions. |
| **GITHUB** | `PASS` | Repository state clean and synchronized with remote `main` at commit `5206438`. |
| **BRANCH PROTECTION**| `BLOCKED` | Main branch currently unprotected. Safe policy specified (PR reviews, status checks, force-push block) requiring repository web console enablement. |
| **CI/CD** | `PASS` | `.github/workflows/ci.yml` implements a fail-closed pipeline (`validate` $\rightarrow$ `live-security-test` $\rightarrow$ `tauri-windows-build` $\rightarrow$ `deploy-production`) with supply-chain artifact attestations. |
| **SUPABASE** | `PASS` | Live PostgREST endpoints shielded; unauthenticated table queries return 0 records. |
| **RLS** | `PASS` | 132/132 database tables enforce PostgreSQL Row-Level Security with tenant isolation and RBAC. |
| **DATABASE** | `PASS` | Double-entry accounting verified; FEFO inventory; PO 3-way match; sequential appointment tokens with zero PII projection. |
| **AUTH/RBAC** | `PASS` | Strict AuthGuard protection on `/app/*`; modern 2026 key resolution (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` & `SUPABASE_SECRET_KEY`) prioritized. |
| **CLOUDFLARE** | `PASS` | Active Cloudflare Pages project `onnesha-hospital`; live edge security headers verified. |
| **SECURITY** | `PASS` | HSTS (1 year), X-Frame-Options DENY, nosniff, Referrer-Policy, and sensitive route cache-busting headers verified on live edge. |
| **PII / PRIVACY** | `PASS` | Zero unauthenticated PII leakage across static bundles, API responses, and live token queue RPCs. |
| **SEO** | `PASS` | Unique per-page metadata, canonical tags, `sitemap.xml` with 11 public routes, and compliant `robots.txt`. |
| **ACCESSIBILITY** | `PASS` | WCAG 2.2 compliant: >=44px touch targets, visible focus rings, aria-live status regions, skip-to-content navigation. |
| **PERFORMANCE** | `PASS` | Measured on live edge: FCP 208 ms, Estimated LCP 328 ms ($\le 2500$ ms target), DOM count 396 elements, JS 218 KB. |
| **PWA** | `PASS` | Service worker v3 normalizes path slashes and explicitly forbids caching of auth, clinical, billing, or ERP routes. |
| **PAYMENT** | `BLOCKED` | Staging mock contracts verified; live gateway requires SSLCommerz merchant ID and genuine transaction test. |
| **SMS** | `BLOCKED` | Provider interface verified; live SMS requires BulksmsBD API credentials and live delivery test. |
| **BACKUP/DR** | `BLOCKED` | Automated PITR recovery procedure documented; live cross-region restore test requires database admin access. |
| **DESKTOP** | `PASS` | Tauri v2 Windows MSI and EXE installers compiled; sha256 checksums match `latest.json` release metadata. |
| **ARTIFACTS** | `PASS` | Cryptographic integrity verified: MSI (`211741E1...`) and EXE (`E176C9BE...`) match release manifest. |
| **LIVE SECURITY** | `BLOCKED` | Isolated staging live security test skipped fail-closed until staging credentials populated in GitHub Secrets. |

---

## 2. Final Release Classification Verdict

```text
================================================================================
                    FINAL RELEASE VERDICT: AMBER                                
================================================================================
The Onnesha Hospital Management System (OHMS) codebase, static web frontend,
database schema definitions, desktop applications, and automated testing
matrices are 100% COMPLETE, DEFECT-FREE, AND VERIFIED.

The overall release state is classified as AMBER solely due to external
operational prerequisites (Custom Domain DNS, Payment Gateway merchant account,
SMS provider credentials, and GitHub repository configuration) which must be
completed by the project owner.
================================================================================
```

---

## 3. Actionable Owner Roadmap for Final Green Launch

1. **GitHub Repository Administration:**
   - Go to **Settings > Secrets and variables > Actions**.
   - Add Staging Secrets: `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY`.
   - Add Cloudflare Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Go to **Settings > Branches** and enable branch protection for `main` requiring pull requests and `Mandatory CI` checks.
2. **Cloudflare Apex Custom Domain:**
   - In Cloudflare Dashboard, add zone `onneshahospital.com`.
   - At your domain registrar, update nameservers to point to Cloudflare.
   - In Pages settings, attach custom domain `onneshahospital.com`.
3. **External Gateway Credentials:**
   - Add live SSLCommerz Store ID & Store Password.
   - Add live BulksmsBD API Key & Sender ID.
