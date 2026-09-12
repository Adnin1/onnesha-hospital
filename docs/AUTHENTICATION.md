# AUTHENTICATION & SESSION LIFECYCLE SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  
**Provider:** Supabase Auth (@supabase/ssr, PostgreSQL auth.users)  

---

## 1. Authentication Lifecycle

```
[Staff Enters Email & Password at /login]
               │
               ▼
[Supabase Auth (signInWithPassword)] ──(Fails)──► [User-friendly error displayed]
               │ (Success)
               ▼
[HttpOnly Secure Session Cookies Issued]
               │
               ▼
[Next.js Proxy / Route Handlers Verify JWT]
               │
               ▼
[Retrieve Tenant Profile & Active Roles from profiles & user_roles]
               │
               ▼
[Authorized Entry to /app/dashboard & Role-Governed Modules]
```

---

## 2. Session Security Rules
- **No Client JWT Storage:** Auth tokens are stored exclusively in HttpOnly, SameSite=Lax, Secure cookies. `localStorage` token storage is eliminated.
- **Session Timeout:** 8-hour max age; cashier desks lock automatically after 15 minutes of inactivity.
- **Password Policies:** 8+ characters, requiring mixed alphanumeric and special characters. No plaintext passwords stored in any application tables.
