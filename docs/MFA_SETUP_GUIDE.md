# Admin Guide: TOTP Multi-Factor Authenticator Setup

> [!TIP]
> Follow this guide to pair your smartphone or password manager with Onnesha Hospital Management System for 2-Factor Security.

---

## 1. Supported Authenticator Applications

Onnesha HMS supports standard Time-based One-Time Password (TOTP) applications:

- **Mobile Apps:** Google Authenticator, Microsoft Authenticator, Authy, Aegis, Duo Mobile.
- **Desktop & Password Managers:** 1Password, Bitwarden, KeePass.

---

## 2. Pairing Instructions

1. Log in to Onnesha HMS at `https://onneshahospital.com/login`.
2. Go to **Settings** → **Security & MFA Management** (`/app/settings/security`).
3. Click **Add Authenticator**.
4. Open your preferred authenticator app:
   - Tap **Add Account** / **+**.
   - Select **Scan QR Code**.
   - Point your phone camera at the QR code displayed on screen.
5. If scanning is unavailable, copy the **Manual Secret Key** and paste it into your authenticator app.
6. Enter the 6-digit code shown in your app into the verification box on screen.
7. Click **ভেরিফাই ও অ্যাক্টিভেট করুন**.

---

## 3. Signing In with 2-Factor Authentication

1. Enter your official email and password on `/login`.
2. Upon submission, you will be redirected to `/auth/mfa`.
3. Open your authenticator app, copy the current 6-digit code for **Onnesha Hospital**, and enter it on screen.
4. Click **Verify**. Your session will elevate to **AAL2** and redirect to your dashboard.
