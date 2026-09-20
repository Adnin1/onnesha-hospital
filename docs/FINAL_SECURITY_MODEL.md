# Onnesha Hospital Comprehensive Security Model & OWASP ASVS 5.0 Mapping

> [!NOTE]
> This document details the technical security controls, architectural isolation boundaries, cryptographic protections, and OWASP Application Security Verification Standard (ASVS) 5.0 mapping for Onnesha Hospital & Diagnostic Complex.

---

## 1. Architectural Security Boundaries

```
[ Public Web / Desktop Client / PWA ]
              │ (TLS 1.3 + HTTPS + HSTS)
              ▼
    [ Next.js Middleware / Edge ]
    • Security Headers (X-Frame-Options: DENY, CSP)
    • Session JWT Verification
              │
              ▼
    [ Server-Authoritative API / Actions ]
    • RBAC Permission Guards (requirePermission)
    • Zod Schema Input Sanitization
    • Service Role Key Restricted to Server Runtime
              │
              ▼
   [ Supabase PostgreSQL DB Engine ]
    • 100% RLS Isolation (organization_id = current_setting(...))
    • Forensic Trigger Audit Ledger (audit_logs)
    • AES-256 Storage & Column Encryption
```

---

## 2. OWASP ASVS 5.0 Technical Control Mapping

| ASVS Category | ASVS Requirement ID | Control Description | Onnesha HMS Technical Implementation |
| :--- | :--- | :--- | :--- |
| **V1: Architecture** | V1.1.1, V1.4.1 | Secure boundaries between public components, application logic, and database tenants. | Next.js route groups (`(public)` vs `(hospital)`), Server Action isolation, multi-tenant RLS policies. |
| **V2: Authentication** | V2.1.1, V2.2.1 | Strong password policy, session handling, secure cookie storage. | Supabase Auth JWT tokens, HTTP-only Secure SameSite cookies, session expiry handlers. |
| **V3: Session Management**| V3.1.1, V3.2.3 | Anti-session hijacking, token validation on every request, server logout invalidation. | `lib/supabase/proxy.ts` session verification middleware on `/app/*`. |
| **V4: Access Control** | V4.1.1, V4.2.1 | Least privilege access control, prohibition of client-side role assertions. | Server-side `requirePermission()` helper in `lib/permissions.ts` checking profile permissions. |
| **V5: Validation & Encoding**| V5.1.1, V5.3.1 | Input sanitization, parameterized queries, prevention of SQLi, XSS. | Supabase PostgREST parameterized queries (0 raw string SQL concats), Zod schema validation. |
| **V6: Cryptography** | V6.2.1, V6.4.1 | Strong encryption algorithms, secret separation, safe VAPID key handling. | AES-256 at rest, VAPID private key server-only, public key client-only. Zero hardcoded secrets. |
| **V7: Error Handling & Audit**| V7.1.1, V7.4.1 | Sanitized error responses without stack traces or PHI, tamper-evident audit logging. | `lib/health.ts` error sanitizer stripping PII/PHI, database `audit_logs` triggers. |
| **V8: Data Protection** | V8.1.1, V8.3.1 | Protection of personal health information (PHI), prevention of caching sensitive data. | Service worker `public/sw.js` `NEVER_CACHE_PATTERNS` for all clinical, financial, and patient routes. |
| **V14: Configuration** | V14.1.1, V14.4.1| Security headers, HSTS, frame protection, static build hardening. | `public/_headers` (HSTS `max-age=31536000`, `X-Frame-Options: DENY`, `X-Content-Type-Options`). |

---

## 3. Cryptographic Secrets Hygiene & Desktop Zero-Secret Model

1. **Client Software (Web & Tauri Windows Desktop):**
   - Contains ONLY public `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
   - Zero embedded `SUPABASE_SERVICE_ROLE_KEY`, SMS API keys, or payment merchant secrets.
2. **Server Runtime:**
   - Secrets supplied strictly through environment variables.
   - Verified clean of hardcoded credentials in `app/(hospital)/app/settings/page.tsx`.

---

## 4. Multi-Tenant RLS & Audit Verification

- **Row Level Security (RLS):** All 26 database tables enforce `organization_id` policies.
- **Forensic Audit Vault:** All financial voids, prescription changes, and user permission updates generate immutable entries in `audit_logs`.
