# SECURITY BASELINE & THREAT PREVENTION SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  

---

## 1. Credentials & Secrets Management
- **Rule SEC-01 (No Secrets in Code):** No API keys, JWT service roles, or database passwords may ever be committed to source code or git history.
- **Rule SEC-02 (Client vs. Server Boundary):** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be present in client-side bundles. `SUPABASE_SERVICE_ROLE_KEY` must never be referenced outside server components or secure Edge Functions.
- **Rule SEC-03 (No Mock Fallbacks):** Mock URL fallbacks in Supabase clients are strictly prohibited in production. Missing environment variables must immediately halt execution with an explicit configuration error.

---

## 2. Authentication & Session Control
- **HttpOnly Cookies:** Authentication tokens are stored exclusively in HttpOnly, SameSite=Lax, Secure cookies managed by `@supabase/ssr`.
- **Session Expiration:** Standard staff sessions expire after 8 hours; Cashier desks implement a 15-minute inactivity screen lock.
- **MFA Ready:** Super Admin accounts (Jewel Vai & Apon Vai) mandate Time-based One-Time Password (TOTP) Multi-Factor Authentication.

---

## 3. Row Level Security & Access Defense
- **Strict Tenant Boundary:** Zero cross-tenant data queries are permitted. Every table is guarded by RLS using `organization_id = get_current_org_id()`.
- **Audit Immutability:** The `audit_logs` table has `REVOKE UPDATE, DELETE` applied at the PostgreSQL engine level to prevent tamper attempts even by administrative roles.
