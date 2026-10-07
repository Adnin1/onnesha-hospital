# Onnesha Hospital Comprehensive Security Model & OWASP ASVS 5.0 Mapping

> [!NOTE]
> This document details the technical security controls, architectural isolation boundaries, cryptographic protections, and OWASP Application Security Verification Standard (ASVS) 5.0 mapping for Onnesha Hospital & Diagnostic Complex (OHMS v1.1.48).

---

## 1. Architectural Security Boundaries (Static Edge + In-Database Enforcement)

```
[ Public Web / Tauri Desktop Client / Mobile PWA ]
              │ (TLS 1.3 + HTTPS + Strict Anycast Edge)
              ▼
    [ Cloudflare Pages Edge CDN ]
    • Edge Security Headers (_headers):
      - Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
      - X-Frame-Options: DENY
      - X-Content-Type-Options: nosniff
      - Content-Security-Policy (CSP without unsafe-eval)
      - Cache-Control: no-store on sensitive application routes
              │
              ▼
    [ Authenticated Client-Side Runtime ]
    • Supabase Auth JWT Token Session Management
    • Client-side validation & UI role guards
    • Zero privileged secrets in client bundles (Zero Service Role Key)
              │ (Authenticated PostgREST / RPC via HTTPS)
              ▼
   [ Supabase PostgreSQL Database Engine (Authoritative Security Perimeter) ]
    • In-Database RPC Authorization:
      - caller authentication (auth.uid() IS NOT NULL)
      - current organization verification (private.get_current_org_id())
      - in-function permission verification (public.is_org_admin_or_has_permission)
      - explicit search_path = '' hardening on all SECURITY DEFINER functions
    • 100% Row Level Security (RLS) Isolation on all database tables
    • Management-Only Visibility Boundaries (Referrals, Rates, Ledgers)
    • Immutable Forensic Trigger Audit Ledger (public.audit_logs)
```

---

## 2. OWASP ASVS 5.0 Technical Control Mapping

| ASVS Category | ASVS Requirement ID | Control Description | Onnesha HMS Technical Implementation |
| :--- | :--- | :--- | :--- |
| **V1: Architecture** | V1.1.1, V1.4.1 | Secure boundaries between public components, application logic, and database tenants. | Client-side route isolation (`(public)` vs `(hospital)`), authoritative PostgreSQL RLS policies, in-database RPC permission gates. |
| **V2: Authentication** | V2.1.1, V2.2.1 | Strong password policy, session handling, secure cookie/storage. | Supabase Auth JWT tokens, PKCE authentication flow, secure token refresh, session expiry handlers. |
| **V3: Session Management**| V3.1.1, V3.2.3 | Anti-session hijacking, token validation on every transaction, server logout invalidation. | PostgREST JWT claim verification on every API/RPC call, token invalidation on signOut(). |
| **V4: Access Control** | V4.1.1, V4.2.1 | Least privilege access control, prohibition of client-side role assertions. | In-database RBAC enforcement via `user_roles` and `role_permissions`, management-only RLS policies. |
| **V5: Validation & Encoding**| V5.1.1, V5.3.1 | Input sanitization, parameterized queries, prevention of SQLi, XSS. | Parameterized PostgREST queries (0 raw string SQL concats), Zod schema validation, numeric bounds checking. |
| **V6: Cryptography** | V6.2.1, V6.4.1 | Strong encryption algorithms, secret separation, safe key handling. | AES-256 at rest in Supabase, zero hardcoded server secrets in client bundle. |
| **V7: Error Handling & Audit**| V7.1.1, V7.4.1 | Sanitized error responses without stack traces or PHI, tamper-evident audit logging. | Redacted error handlers stripping PII/PHI, database `audit_logs` entries for all mutations. |
| **V8: Data Protection** | V8.1.1, V8.3.1 | Protection of personal health information (PHI), prevention of caching sensitive data. | Service worker `public/sw.js` `NEVER_CACHE_PATTERNS` for all clinical, financial, and referral routes. |
| **V14: Configuration** | V14.1.1, V14.4.1| Security headers, HSTS, frame protection, static build hardening. | Cloudflare `_headers` (HSTS `max-age=31536000`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`). |

---

## 3. Cryptographic Secrets Hygiene & Desktop Zero-Secret Model

1. **Client Software (Web & Tauri Windows Desktop):**
   - Contains ONLY public `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
   - Zero embedded `SUPABASE_SERVICE_ROLE_KEY`, SMS API keys, or payment merchant secrets.
2. **Database Perimeter Security:**
   - Privileged mutations are executed through PostgreSQL `SECURITY DEFINER` RPCs that strictly authenticate `auth.uid()`, verify `private.get_current_org_id()`, and enforce granular permission checks.
   - Public and anon execute privileges are explicitly revoked from all internal and management functions.

---

## 4. Multi-Tenant RLS & Audit Verification

- **Row Level Security (RLS):** All tables enforce `organization_id` isolation.
- **Management Visibility Boundary:** Sensitive referral partner data, commission rates, and payouts are restricted to management roles. Admission staff use narrow projection RPCs only.
- **Forensic Audit Vault:** All financial voids, prescription changes, rate adjustments, and user permission updates generate immutable entries in `audit_logs`.
