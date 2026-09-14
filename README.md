# Onnesha Hospital Management System (OHMS)
Enterprise Healthcare Operations & Multi-Tenant SaaS Platform

[![Tests](https://img.shields.io/badge/tests-154%2F154%20passing-brightgreen)](#automated-testing)
[![TypeScript](https://img.shields.io/badge/typescript-strict%200%20errors-blue)](#quality-gates)
[![ESLint](https://img.shields.io/badge/eslint-0%20errors-brightgreen)](#quality-gates)
[![Next.js](https://img.shields.io/badge/next.js-16.3.5%20turbopack-black)](https://nextjs.org)
[![Cloudflare](https://img.shields.io/badge/deployment-cloudflare%20pages-orange)](https://onnesha-hospital.pages.dev)

- **Live Production URL:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
- **GitHub Repository:** [Adnin1/onnesha-hospital](https://github.com/Adnin1/onnesha-hospital)
- **Database Engine:** Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS)

---

## 📋 Phase Implementation Reports
- 📄 [Phase 2 Completion Report](./PHASE_2_COMPLETION_REPORT.md) (Auth, RBAC, PostgreSQL RLS, Application Shell)
- 📄 [Phase 3 Completion Report](./PHASE_3_COMPLETION_REPORT.md) (Patient Management, OPD, IPD, Emergency, Clinical 360 EMR)
- 📄 [Phase 14 Notification & Payment Report](./docs/PHASE_14_ENTERPRISE_NOTIFICATIONS_AND_PAYMENTS.md) (SMS, WhatsApp, Email, bKash, Nagad, SSLCommerz, Outbox, Reconciliation)
- 📄 [Phase 15 Printing & Documents Report](./docs/PHASE_15_PRINTING_AND_DOCUMENTS.md) (Doctor Chamber Pad, 80mm POS Thermal, A4 Invoices, Lab Reports, Discharge Summaries)
- 📄 [Phase 16 Security & Audit Report](./docs/PHASE_16_SECURITY_AND_AUDIT.md) (PostgreSQL Audit Vault, Financial Voiding, Clinical Governance, Forensic Diffs)
- 📄 [Master System Completion Report](./docs/MASTER_SYSTEM_COMPLETION_REPORT.md) (Zero-Mock Enterprise Operations Audit)

---

## 🏥 Enterprise Modules Overview (Phases 1–16)
- **Deterministic Identifiers:** PostgreSQL sequences generating `P-YYYYMM-XXXXX` and visit identifiers (`OPD-`, `IPD-`, `EMG-`).
- **Security & Audit Vault (Phase 16):** Immutable PostgreSQL audit vault (`audit_logs`), before/after forensic diff viewer, clinical justification mandate for high-risk operations, and zero-mock administration console.
- **Enterprise Printing Engine (Phase 15):** Dual-format print architecture (A4 formal clinical/billing documents + 80mm roll POS thermal slips), zero-dependency SVG Code128/QR generation, multi-tenant print templates, and comprehensive reprint audit logging (`document_print_logs`).
- **Enterprise Notifications (Phase 14):** Transactional Outbox pattern, bilingual Bangla/English templates, SSL Wireless/Greenweb SMS, Meta WhatsApp Business Cloud API, Resend/SendGrid email.
- **Online Payment Engine (Phase 14):** Multi-gateway tokenized checkout (bKash, Nagad, SSLCommerz), server-side invoice due enforcement, constant-time HMAC-SHA256 signature verification, finance reconciliation ledger.
- **Patient 360° EMR:** Chronological medical history timeline (`/app/patients/[id]`) with printable hospital headers.
- **Outpatient Department (OPD):** Consultation console with physiological sanity-bounded vitals and clinical notes (`/app/opd`).
- **Inpatient Department (IPD):** Admission workflow, bed transfers, and mandatory discharge diagnoses (`/app/ipd`).
- **Emergency Department:** Casualty triage with RED/YELLOW/GREEN prioritization and temporary unknown patient chart intake (`/app/emergency`).

---

## 🧪 Automated Testing
154 / 154 automated test cases passing across 11 complete test suites:
- `tests/security.test.mjs` (20 Scenarios)
- `tests/clinical.test.mjs` (21 Scenarios)
- `tests/appointments.test.mjs` (10 Scenarios)
- `tests/emr-diagnostics.test.mjs` (10 Scenarios)
- `tests/beds-ot.test.mjs` (10 Scenarios)
- `tests/pharmacy.test.mjs` (10 Scenarios)
- `tests/billing.test.mjs` (10 Scenarios)
- `tests/hr.test.mjs` (10 Scenarios)
- `tests/phase13-public-appointment-seo.test.mjs` (10 Scenarios)
- `tests/phase14-notification-payment.test.mjs` (12 Scenarios)
- `tests/phase15-printing-engine.test.mjs` (10 Scenarios)
- `tests/phase16-security-financial-clinical-audit.test.mjs` (10 Scenarios)

---

## 🚀 Quality Gates & Verification Commands
```bash
npm run typecheck    # 0 errors
npx eslint . --quiet # 0 errors
npm test             # 154/154 pass
npm run build        # 32/32 routes statically exported for Cloudflare Pages
```


