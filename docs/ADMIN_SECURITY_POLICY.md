# Administrative Security, Session Assurance & MFA Policy

> [!NOTE]
> This document details the administrative security rules, Multi-Factor Authentication (MFA) assurance requirements, session invalidation protocols, and step-up authorization standards for Onnesha Hospital & Diagnostic Complex.

---

## 1. Authentication Standard & Assurance Levels (AAL)

Onnesha HMS enforces a multi-tier Authenticator Assurance Level (AAL) model powered by Supabase Auth:

| Assurance Level | Requirement | Applicable Roles / Routes |
| :--- | :--- | :--- |
| **AAL1** | Single-Factor: Email + Password | Public portals, basic staff read-only modules. |
| **AAL2** | Multi-Factor: Email + Password + 6-Digit TOTP | `super_admin`, `admin`, finance/billing managers, system settings, `/app/*`. |

---

## 2. Step-Up Authentication for High-Risk Operations

The following administrative and financial operations mandate active **AAL2** session assurance:

1. **Financial Voids & Refunds:** Voiding issued billing invoices or issuing patient refunds.
2. **User & Role Administration:** Assigning or modifying user roles, creating new staff accounts, disabling accounts.
3. **MFA Unenrollment:** Removing or changing active TOTP authenticators in `/app/settings/security`.
4. **Integration & Gateway Secrets:** Updating bKash/Nagad/SSLCommerz merchant credentials or SMS gateway parameters.
5. **Database Export & Audit Ledger View:** Accessing full audit vault before/after diffs or exporting patient records.

---

## 3. Session Security & Cookie Protection

- **Cookie Management:** Handled exclusively via `@supabase/ssr` with HttpOnly, Secure, and SameSite flags.
- **No Hardcoded Cookie Strings:** Session validation strictly calls `supabase.auth.getUser()`, rejecting untrusted user-controlled cookie strings.
- **No Public Caching:** Protected auth responses include `Cache-Control: private, no-store`.

---

## 4. Incident Response & Lockout Prevention

- **Multiple Authenticators:** Super Admins are advised to enroll a secondary authenticator (e.g. phone + 1Password/Bitwarden).
- **Compromise Revocation:** Disabling an account in Supabase Auth immediately invalidates current access and refresh tokens.
