# Onnesha Hospital Management System — Engineering Playbook

> Permanent engineering standards for all contributors.
> Last updated: 2026-09-29

## 1. Architecture Principles

### 1.1 Static Export + Supabase Cloud
- Next.js with `output: "export"` — purely static HTML/JS/CSS
- Supabase is the ONLY backend (Auth, PostgREST, Realtime, Storage, Edge Functions)
- No SSR, no Node.js server, no API routes at runtime
- Cloudflare Pages serves static files; `public/_headers` controls ALL response headers

### 1.2 Security Model
- **Row-Level Security (RLS)**: Every table with user data MUST have RLS enabled
- **Tenant Isolation**: All queries filter by `organization_id` via `current_org_id()` RPC
- **SECURITY DEFINER functions**: MUST use `SET search_path = ''` with fully schema-qualified references
- **EXECUTE grants**: Explicitly `REVOKE FROM PUBLIC, anon` and `GRANT TO authenticated, service_role`
- **Client keys**: Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in client bundle
- **Service role key**: NEVER in client code, NEVER with `NEXT_PUBLIC_` prefix

### 1.3 Fail-Closed Design
- Missing environment variables → build failure (not silent defaults)
- Missing RLS policy → deny all (PostgreSQL default when RLS enabled)
- Missing tenant context → SQLSTATE 42501 (permission denied)
- Docker secrets → `${VAR:?Error}` syntax (fail if unset)

## 2. Development Workflow

### 2.1 Local Development
```bash
npm install
npm run dev          # Next.js dev server with Turbopack
npm run typecheck    # TypeScript validation
npx eslint . --max-warnings 0  # Lint
npm run test:certification      # Full test suite
npm run build        # Production build
npm run audit:assets # Link/asset forensics
```

### 2.2 Database Migrations
- All migrations in `supabase/migrations/` with sequential numbering
- Migrations MUST be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- New tables MUST include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- New RPC functions MUST include `SET search_path` and GRANT/REVOKE

### 2.3 Testing Strategy
- **Unit/Integration**: `tests/*.test.mjs` — Node.js native test runner
- **E2E**: `tests/browser/*.spec.ts` — Playwright (Chromium, Mobile Chrome, Firefox, WebKit)
- **Live Security**: `tests/live/*.live.test.mjs` — requires staging Supabase credentials
- **Certification**: `npm run test:certification` runs all non-live test suites

### 2.4 Branching & Release
1. All work on feature branches
2. PR requires CI green (typecheck + lint + test + build)
3. Merge to `main` triggers Cloudflare Pages deploy
4. Release tags follow semver: `v1.1.x` for patches, `v1.2.x` for features
5. Tag MUST point to the exact commit that passed CI
6. `package.json` version MUST match tag

## 3. Security Checklist (Per PR)

- [ ] No hardcoded credentials or API keys
- [ ] No `localhost` or `127.0.0.1` in production paths
- [ ] New tables have RLS enabled
- [ ] New RPCs have search_path and GRANT/REVOKE
- [ ] Service Worker NEVER_CACHE_PATTERNS updated for new sensitive routes
- [ ] CSP in `_headers` covers any new external origins
- [ ] No PHI in logs, console output, or error messages

## 4. Module Directory (32 Modules)

| # | Module | Route | Status |
|---|--------|-------|--------|
| 1 | Dashboard | `/app/dashboard` | ✅ |
| 2 | Patient Management | `/app/patients` | ✅ |
| 3 | Doctor Management | `/app/doctors` | ✅ |
| 4 | Appointments | `/app/appointments` | ✅ |
| 5 | Prescriptions | `/app/prescriptions` | ✅ |
| 6 | Pharmacy | `/app/pharmacy` | ✅ |
| 7 | Laboratory | `/app/laboratory` | ✅ |
| 8 | Diagnostics | `/app/diagnostics` | ✅ |
| 9 | Billing | `/app/billing` | ✅ |
| 10 | Invoicing | `/app/invoices` | ✅ |
| 11 | Payments | `/app/payments` | ✅ |
| 12 | Financial Reports | `/app/reports` | ✅ |
| 13 | Inventory | `/app/inventory` | ✅ |
| 14 | Procurement | `/app/procurement` | ✅ |
| 15 | HR & Payroll | `/app/hr` | ✅ |
| 16 | Staff Directory | `/app/staff` | ✅ |
| 17 | Duty Roster | `/app/duty-roster` | ✅ |
| 18 | Bed Management | `/app/beds` | ✅ |
| 19 | Emergency | `/app/emergency` | ✅ |
| 20 | Blood Bank | `/app/blood-bank` | ✅ |
| 21 | Cabins & Wards | `/app/cabins` | ✅ |
| 22 | Ambulance | `/app/ambulance` | ✅ |
| 23 | Settings | `/app/settings` | ✅ |
| 24 | Audit Log | `/app/audit` | ✅ |
| 25 | Notifications | `/app/notifications` | ✅ |
| 26 | General Ledger | `/app/general-ledger` | ✅ |
| 27 | Accounts Receivable | `/app/accounts-receivable` | ✅ |
| 28 | Accounts Payable | `/app/accounts-payable` | ✅ |
| 29 | Online Booking | `/appointment` (public) | ✅ |
| 30 | Waiting Queue | `/queue/*` (public) | ✅ |
| 31 | Supplier Management | `/app/suppliers` | ✅ |
| 32 | Purchase Orders | `/app/purchase-orders` | ✅ |

## 5. Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|--------|
| Frontend | Next.js 16.3.5 (Static Export) | All UI |
| Backend | Supabase Cloud (PostgreSQL 15) | Auth, Data, RPC, Realtime, Storage |
| Hosting | Cloudflare Pages | Static file serving, CDN, DDoS protection |
| Desktop | Tauri 2 | Windows MSI client (optional) |
| Docker | nginx + optional PostgreSQL/Redis | Edge LAN deployment (optional) |
| CI/CD | GitHub Actions | Automated testing and deployment |
| E2E | Playwright 1.63 | Cross-browser testing |

## 6. Prohibited Patterns

| Pattern | Why Prohibited |
|---------|----------------|
| `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | Leaks admin key to client bundle |
| Hardcoded `localhost` in production source | Breaks production deployment |
| `unsafe-eval` in CSP | XSS attack vector |
| Tables without RLS | Data leak risk |
| SECURITY DEFINER without `SET search_path` | Privilege escalation via schema shadowing |
| Fake Supabase URLs in Dockerfile | Silent runtime failure |
| `ports:` for PostgreSQL/Redis in docker-compose | Unnecessary attack surface |
| PHI in console.log/error messages | HIPAA/privacy violation |
