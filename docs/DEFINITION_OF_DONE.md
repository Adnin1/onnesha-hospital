# Onnesha Hospital Management System — Definition of Done

> Every item below **MUST** pass before a release tag is created.
> Automated items are enforced by `scripts/project-health-check.mjs` and GitHub Actions CI.

## 1. Code Quality Gates

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| TypeScript | `npm run typecheck` | 0 errors |
| ESLint | `npx eslint . --max-warnings 0` | 0 warnings, 0 errors |
| Unit/Integration Tests | `npm run test:certification` | All suites pass, 0 failures |
| E2E Tests (Chromium) | `npx playwright test --project=chromium` | All specs pass |
| E2E Tests (Mobile Chrome) | `npx playwright test --project=mobile-chrome` | All specs pass |
| E2E Tests (Firefox) | `npx playwright test --project=firefox` | All specs pass (CI only on Windows) |
| E2E Tests (WebKit) | `npx playwright test --project=webkit` | All specs pass (CI only on Windows) |
| Build | `npm run build` | 0 errors, all routes exported |
| Asset Audit | `npm run audit:assets` | 0 broken links, 0 missing assets |
| npm audit | `npm audit --audit-level=high` | 0 high/critical vulnerabilities |

## 2. Security Gates

| Gate | Verification | Pass Criteria |
|------|-------------|---------------|
| Secret Scan | Automated (health-check) | 0 instances of `service_role`, private keys, hardcoded passwords in source |
| CSP Headers | `public/_headers` review | No `unsafe-eval`, sandbox origins only if runtime-needed |
| Service Worker | `public/sw.js` | NEVER_CACHE_PATTERNS covers all clinical/financial routes |
| SECURITY DEFINER | Migration audit | All functions have `SET search_path = ''` and explicit GRANT/REVOKE |
| No localhost in production | Automated (health-check) | 0 hardcoded localhost/127.0.0.1 in production source |
| Docker secrets | `docker-compose.yml` | All secrets use `${VAR:?Error}` fail-closed syntax |
| Supabase key isolation | Source scan | `SUPABASE_SERVICE_ROLE_KEY` never prefixed with `NEXT_PUBLIC_` |

## 3. Release Provenance Gates

| Gate | Verification | Pass Criteria |
|------|-------------|---------------|
| Version consistency | `package.json` version matches git tag | Exact match |
| Tag points to HEAD | `git rev-parse HEAD == git rev-parse <tag>^{commit}` | Same commit hash |
| CI green on tagged commit | GitHub Actions | All required checks pass |
| Changelog | `docs/FINAL_RELEASE_REPORT.md` updated | Test counts, commit hash, date accurate |

## 4. Database Gates

| Gate | Verification | Pass Criteria |
|------|-------------|---------------|
| Migration count matches | Count files in `supabase/migrations/` | Matches report claim |
| RLS enabled | All tables with user data | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` present |
| Tenant isolation | Financial RPCs | `current_org_id()` check in all multi-tenant functions |

## 5. Owner Gates (Cannot Be Automated — Require Credentials)

| Gate | Owner Action Required |
|------|----------------------|
| Supabase Production Checklist | Dashboard → Security Advisor, Performance Advisor, RLS audit |
| Staging Secrets | Add `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` to GitHub Secrets |
| DNS Configuration | Point `onneshahospital.com` to Cloudflare Pages custom domain |
| SSL Certificate | Verify Cloudflare edge certificate covers custom domain |
| Payment Gateway | Configure production SSLCommerz/bKash/Nagad merchant credentials |
| SMTP/Auth | Configure Supabase Auth SMTP for transactional emails |
| Code Signing | Obtain Windows code signing certificate for Tauri MSI builds |
| Branch Protection | Enable GitHub branch protection rules on `main` |
| Backup/PITR | Enable Supabase Point-in-Time Recovery for production database |

## Classification

- **ENGINEERING COMPLETE**: All gates in Sections 1-4 pass.
- **PRODUCTION CERTIFIED**: All gates in Sections 1-5 pass.
- A release may be tagged as ENGINEERING COMPLETE while Owner Gates remain open.
