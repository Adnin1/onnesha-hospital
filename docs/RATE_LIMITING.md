# ENTERPRISE DISTRIBUTED RATE LIMITING ARCHITECTURE
**Project:** Onnesha Hospital Management System (OHMS)  
**Infrastructure Target:** Cloudflare Edge WAF & Distributed Token Bucket  

---

## 1. Why In-Memory Rate Limiting Fails in Serverless/Edge
In serverless architectures (Cloudflare Workers, Edge Functions, Next.js Serverless lambdas), processes scale horizontally and terminate dynamically. An in-memory Map (`new Map()`) is wiped between cold starts and is not shared across edge nodes, rendering it ineffective against distributed abuse.

---

## 2. Tiered Rate Limiting Strategy

1. **Edge Tier (Cloudflare WAF / Rate Limiting Rules):**
   - **Login Endpoint (`/login`, `/api/auth/*`):** Maximum 5 failed attempts per 15 minutes per IP address before requiring Cloudflare Managed Challenge (Turnstile).
   - **Public Appointment Booking (`/appointment`, `/api/appointment`):** Maximum 10 submissions per hour per IP to prevent spam bookings.
   - **SMS Triggering:** Strict ceiling of 3 SMS dispatches per unique phone number within 10 minutes.
2. **Durable Storage Tier (Cloudflare KV / Redis / PostgreSQL):**
   - Critical financial operations (e.g. invoice voids or bulk refunds) record a velocity counter in `cash_transactions` to prevent automated double-draw downs.
