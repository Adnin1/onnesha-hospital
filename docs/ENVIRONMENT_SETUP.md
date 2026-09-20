# ENVIRONMENT SETUP & CONFIGURATION GUIDE
**Project:** Onnesha Hospital Management System (OHMS)  
**Security Classification:** Strict Production Confidentiality  

---

## 1. Required Variables & Descriptions

| Variable Name | Scope | Sensitivity | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client & Server) | Non-Secret | HTTPS URL of your Supabase project (e.g. `https://xxxx.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Client & Server) | Safe-Public | Supabase Publishable / Anon API Key for client browser interactions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | **CRITICAL SECRET** | Bypasses PostgreSQL RLS for background trusted batch tasks. Must **NEVER** be prefixed with `NEXT_PUBLIC_` or bundled in client JS. |
| `NEXT_PUBLIC_APP_NAME` | Public | Non-Secret | Display title for the hospital enterprise portal. |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | Public | Non-Secret | System currency code (default: `BDT`). |
| `NEXT_PUBLIC_EMERGENCY_HOTLINE` | Public | Non-Secret | Primary 24/7 hospital ambulance and emergency triage contact. |

---

## 2. Local Development Configuration

Copy the template to your local `.env.local` file:
```bash
cp .env.example .env.local
```
Fill in the verified credentials from your Supabase Project Settings (API Section).

---

## 3. Production Deployment Security
- In Cloudflare Pages / Workers or Vercel, inject `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Environment Variables.
- Store `SUPABASE_SERVICE_ROLE_KEY` exclusively as an Encrypted Secret.
