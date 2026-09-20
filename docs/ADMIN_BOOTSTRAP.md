# Super Admin Initial Account Provisioning & Bootstrap Protocol

> [!IMPORTANT]
> **SECURITY DIRECTIVE:** This document outlines the secure operational protocol for creating initial Super Admin and Hospital Admin accounts for Onnesha Hospital & Diagnostic Complex. Real passwords and private cryptographic keys MUST NEVER be written or committed to source code or git repositories.

---

## 1. Overview

In production environments, Super Admin accounts MUST NOT be hardcoded into source code or seed scripts with pre-filled default passwords. Accounts are created directly via the **Supabase Dashboard** or via secure SQL provisioning scripts, followed by mandatory 2-Factor Authentication (TOTP) pairing.

---

## 2. Step-by-Step Initial Admin Account Setup

### Step 1: Create Auth User in Supabase Console
1. Log in to the [Supabase Cloud Console](https://supabase.com/dashboard).
2. Select the Onnesha Hospital production project.
3. Navigate to **Authentication** → **Users** → **Add User**.
4. Select **Create User**:
   - Email: `admin@onneshahospital.com` (or designated hospital director email)
   - Auto Confirm User: **Checked** (`true`)
   - Enter a strong, cryptographically generated password (at least 16 characters including uppercase, lowercase, numbers, and symbols).

### Step 2: Assign Super Admin Role & Active Organization
Execute the following SQL query in the Supabase SQL Editor:

```sql
-- 1. Ensure user profile exists
INSERT INTO profiles (id, email, full_name, is_active, active_organization_id)
SELECT id, email, 'Hospital Director', true, (SELECT id FROM organizations LIMIT 1)
FROM auth.users
WHERE email = 'admin@onneshahospital.com'
ON CONFLICT (id) DO UPDATE SET
  full_name = 'Hospital Director',
  is_active = true,
  active_organization_id = (SELECT id FROM organizations LIMIT 1);

-- 2. Grant super_admin role
INSERT INTO user_roles (user_id, role_id, organization_id)
SELECT 
  u.id,
  r.id,
  (SELECT id FROM organizations LIMIT 1)
FROM auth.users u
CROSS JOIN roles r
WHERE u.email = 'admin@onneshahospital.com'
  AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id, organization_id) DO NOTHING;
```

---

## 3. Mandatory TOTP MFA Pairing Protocol

Immediately after creating the account:

1. Log in to the Onnesha Hospital Management System at `/login`.
2. Enter the official email and new password.
3. Navigate to **System Settings** → **Security & MFA Management** (`/app/settings/security`).
4. Click **Add Authenticator** / **TOTP MFA সক্রিয় করুন**.
5. Open an authenticator application (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden).
6. Scan the QR code displayed on screen or manually enter the secret key.
7. Enter the generated 6-digit TOTP code to verify and activate `AAL2` protection.
