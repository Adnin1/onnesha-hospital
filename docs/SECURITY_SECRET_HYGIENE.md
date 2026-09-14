# Security Secret Hygiene Audit — Phase 17

## Audit Date
Phase 17 pre-implementation audit of Phase 14–16 code.

## Finding: Hardcoded SMS API Key in Settings Page

**File:** `app/(hospital)/app/settings/page.tsx` (line 39)
**Content:** `useState("ak_live_bd_99812491204812")`
**Severity:** HIGH
**Action:** Replaced with empty string `""`. SMS settings must be loaded from database configuration or environment variables only.

**File:** `app/(hospital)/app/settings/page.tsx` (line 38)
**Content:** `useState("https://api.sms-gateway-bd.com/v2/send")`
**Severity:** MEDIUM
**Action:** Replaced with empty string `""`.

> ⚠️ **If `ak_live_bd_99812491204812` was ever a real provider credential, it MUST be rotated on the provider side.** This codebase cannot rotate external provider keys.

## Rules Enforced

1. Secrets ONLY from secure environment/runtime configuration
2. NEVER expose secrets via `NEXT_PUBLIC_` variables
3. NEVER store provider credentials in client components
4. NEVER render credentials in admin UI
5. Do not log secrets
6. Do not include secrets in error messages
7. Mask sensitive configuration in settings pages
8. Never place real secrets in test fixtures
9. Use clearly fake placeholders in `.env.example` only

## Environment Variable Security Audit

### `.env.example` (committed — safe)
- `NEXT_PUBLIC_SUPABASE_URL` — public, safe
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key, safe
- `SUPABASE_SERVICE_ROLE_KEY` — commented out as placeholder, safe

### `.env.local` (gitignored — NOT committed) ✅
- Contains `SUPABASE_SERVICE_ROLE_KEY` — correctly gitignored

### Client-side exposure check
- `NEXT_PUBLIC_*` variables: Only safe public values (app name, hospital code, currency, hotlines)
- Supabase service role key: Server-only via `lib/supabase/admin.ts` ✅
- Payment adapter secrets: Environment-only fallback via `process.env.*` ✅
- Webhook secrets: Parameter-passed, not hardcoded ✅

## Repository-wide Secret Scan Results

| Pattern | Findings | Status |
|---------|----------|--------|
| `api_key` / `apikey` | Settings page hardcoded (FIXED) | ✅ Remediated |
| `secret` | Webhook security (parameter-passed, safe) | ✅ Clean |
| `password` | SSLCommerz config (env-based, safe) | ✅ Clean |
| `bearer` | Not found | ✅ Clean |
| `private_key` | Nagad adapter (env-based, safe) | ✅ Clean |
| `sk_` / `pk_` | Not found | ✅ Clean |
| `vapid` | Not found (to be added Phase 17) | ✅ Clean |
| `.env` committed | Only `.env.example` (safe placeholders) | ✅ Clean |
| localStorage / sessionStorage | Zero usage | ✅ Clean |
