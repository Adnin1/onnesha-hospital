# Bangladesh Personal Data Protection Act 2026 & Cyber Security Act 2026 Technical Readiness Specification

> [!IMPORTANT]
> **LEGAL DISCLAIMER:** TECHNICAL READINESS ≠ LEGAL CERTIFICATION. This document certifies **Technical System Readiness & Cryptographic Controls Architecture**. Technical readiness does NOT constitute formal legal certification under the Data Protection Authority of Bangladesh. Official statutory compliance certification requires independent legal audit, organizational governance policy signoff, and designated Data Protection Officer (DPO) filings.

---

## 1. Overview & Statutory Context

The **Bangladesh Personal Data Protection Act, 2026** and the **Cyber Security Act, 2026** establish strict statutory requirements governing the processing, storage, transmission, and rights management of Personal Data and Sensitive Personal Data (EHR/PHR).

Onnesha Hospital & Diagnostic Complex ("Onnesha HMS") has implemented technical data privacy mechanisms directly into the database architecture, authorization middleware, UI routing, telemetry instrumentation, and network transmission layers.

---

## 2. Technical Control Architecture Matrix

| Act Section / Requirement | Statutory Requirement | Onnesha HMS Technical Control Implementation | Architectural Verification |
| :--- | :--- | :--- | :--- |
| **BD PDP Act Sec. 5** | Lawful Basis & Consent | Explicit opt-in consent flow at patient registration and `/consent` portal. | Public `/consent` page, DB `profiles.consent_given` |
| **BD PDP Act Sec. 7** | Data Minimization | Form fields strictly limited to clinical care, identity verification (NID), and billing. | Zod schemas reject extraneous fields |
| **BD PDP Act Sec. 12** | Encryption at Rest | Database tables and static assets encrypted with AES-256 (Supabase managed KMS). | PostgreSQL transparent data encryption |
| **BD PDP Act Sec. 13** | Encryption in Transit | TLS 1.3 mandatory across web app, desktop client, and external APIs with HSTS. | Public `_headers`, Tauri CSP policy |
| **BD PDP Act Sec. 18** | Patient Right of Access | Direct self-service portal to view prescriptions, lab results, and billing invoices. | Patient dashboard `/app/patient-portal` |
| **BD PDP Act Sec. 19** | Right to Rectification | Scoped update APIs allowing patients to correct demographics with audit tracking. | Immutable `audit_logs` before/after diff |
| **BD PDP Act Sec. 21** | Data Localization & Sovereignty | Regional cloud tenant enforcement with zero unauthorized cross-border export. | Cloudflare Pages & Supabase SG/IN region |
| **Cyber Security Act Sec. 17** | Critical Information Infrastructure (CII) | Row-Level Security (RLS) tenant isolation preventing cross-tenant data leaks. | 100% RLS policies on all 26 DB tables |
| **Cyber Security Act Sec. 28** | Forensic Audit Trail | Immutable audit logging of all clinical, financial, and administrative operations. | `audit_logs` trigger on INSERT/UPDATE/DELETE |
| **Telemetry Protection** | Zero PHI Leakage | Web vitals and error trackers automatically redact patient IDs, NIDs, and amounts. | `lib/health.ts` and `lib/web-vitals.ts` |
| **Push & SMS Privacy** | Non-PHI Notifications | Push notifications and SMS alerts contain generic templates without medical details. | `lib/push/subscription.ts` templates |

---

## 3. Data Protection Principles Implemented

### 3.1 Row-Level Security (RLS) & Multi-Tenant Boundaries
Every table in the Onnesha database enforces `organization_id = current_setting('app.current_organization_id', true)::uuid`. Even if a raw database query is attempted, data outside the active organization context is inaccessible at the engine level.

### 3.2 Telemetry & Error Redaction
Error telemetry in `lib/health.ts` executes regex filters that strip match patterns for:
- Patient IDs: `P-\d{6}-\d{5}` -> `P-[REDACTED_PATIENT_ID]`
- NIDs / Passports: `\b\d{10,17}\b` -> `[REDACTED_NUMERIC_ID]`
- Billing totals and financial figures

### 3.3 Push & Service Worker Cache Exclusions
Service worker (`public/sw.js`) explicitly bypasses cache for all sensitive paths:
```js
const NEVER_CACHE_PATTERNS = [
  /\/api\//, /supabase\.co/, /\.supabase\./, /auth/,
  /patient/i, /prescription/i, /diagnosis/i, /invoice/i,
  /payment/i, /billing/i, /clinical/i, /lab/i, /pharmacy/i
];
```

---

## 4. Patient Rights Execution Protocols

1. **Right to Access:** Served via authenticated patient portal (`/app/patient-portal`).
2. **Right to Rectification:** Executed via `updatePatientDemographics` with `audit_logs` tracking.
3. **Right to Consent Withdrawal:** Managed via `/consent` public page or DPO contact email (`dpo@onneshahospital.com`).
4. **Data Retention & Erasure:** Inactive non-clinical records purged according to hospital medical board retention schedules (minimum 7 years clinical retention mandated by DGHS).

---

## 5. Owner Action Items for Formal Statutory Certification

- [ ] Appoint official Data Protection Officer (DPO) and register contact details with DGHS/ICT Division.
- [ ] Conduct legal review of patient consent wording with qualified Bangladeshi legal counsel.
- [ ] Execute Data Processing Agreements (DPA) with third-party gateway providers (SSLCommerz, SMS Gateway BD).
