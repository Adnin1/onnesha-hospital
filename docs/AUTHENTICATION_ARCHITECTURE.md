# Authentication & Multi-Factor Security Architecture

> [!NOTE]
> Architectural reference detailing `@supabase/ssr` session management, edge proxy protection, client-side AuthGuard, and TOTP MFA assurance elevation.

---

## 1. Dual-Runtime Security Layer

```
[ Incoming Request ]
        │
        ├─────────► [ Edge Proxy (proxy.ts) ] (Node/Edge Runtime)
        │            • Calls updateSession(request) via @supabase/ssr
        │            • Validates user state with supabase.auth.getUser()
        │            • Scopes protection strictly to /app/*
        │            • ZERO hardcoded cookie-name checks
        │
        └─────────► [ Client AuthGuard (AuthGuard.tsx) ] (Browser/Static Export Runtime)
                     • Client layout wrapper for /app/*
                     • Calls supabase.auth.getUser()
                     • Evaluates DB profile & user_roles
                     • Checks MFA assurance level (AAL1 vs AAL2)
                     • Redirects to /auth/mfa if TOTP required
```

---

## 2. Authentication Sequence Diagram

```
User -> Login Form (/login): Submits email + password
Login Form -> Supabase Auth: signInWithPassword()
Supabase Auth --> Login Form: Session token (AAL1)
Login Form -> Supabase Auth: getAuthenticatorAssuranceLevel()
Login Form -> Supabase Auth: listFactors()
alt Verified TOTP Factors Enrolled & Current Level == AAL1
    Login Form -> MFA Page (/auth/mfa): Redirect to 6-digit TOTP challenge
    User -> MFA Page (/auth/mfa): Inputs 6-digit code
    MFA Page -> Supabase Auth: mfa.challenge() & mfa.verify()
    Supabase Auth --> MFA Page: Session elevated to AAL2
    MFA Page -> Dashboard (/app/dashboard): Access Granted (AAL2)
else No TOTP Factors Enrolled
    Login Form -> Dashboard (/app/dashboard): Access Granted (AAL1)
end
```

---

## 3. Key Components Reference

- **`proxy.ts`**: Root Next.js proxy utilizing `@supabase/ssr` server-side user verification.
- **`lib/supabase/middleware.ts`**: Refreshes auth tokens and returns authenticated `user` and updated response headers.
- **`lib/auth/session.ts`**: Universal server/browser helper providing `getCurrentUserSession()`, `hasPermission()`, `requirePermission()`, and `requireAAL2()`.
- **`components/auth/AuthGuard.tsx`**: Client component protecting static export routes on Cloudflare Pages.
- **`app/(auth)/login/page.tsx`**: Production login UI with blank defaults and safe error mapping.
- **`app/(auth)/mfa/page.tsx`**: 6-digit numeric TOTP challenge page for AAL2 elevation.
- **`app/(hospital)/app/settings/security/page.tsx`**: Security portal for QR code pairing and factor unenrollment.
