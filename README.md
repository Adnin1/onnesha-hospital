# Onnesha Hospital Management System (OHMS)
Enterprise Healthcare Operations & Multi-Tenant SaaS Platform

[![Tests](https://img.shields.io/badge/tests-288%2F288%20passing-brightgreen)](#automated-testing)
[![TypeScript](https://img.shields.io/badge/typescript-strict%200%20errors-blue)](#quality-gates)
[![ESLint](https://img.shields.io/badge/eslint-0%20errors-brightgreen)](#quality-gates)
[![Next.js](https://img.shields.io/badge/next.js-16.3.5%20turbopack-black)](https://nextjs.org)
[![Cloudflare](https://img.shields.io/badge/deployment-cloudflare%20pages-orange)](https://onnesha-hospital.pages.dev)

- **Live Production URL:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
- **GitHub Repository:** [Adnin1/onnesha-hospital](https://github.com/Adnin1/onnesha-hospital)
- **Database Engine:** Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS)

---

## 📋 Final Production Hardening & Truth Documentation
- 📄 [Final Truth Audit & System Classification](./docs/FINAL_TRUTH_AUDIT.md)
- 📄 [Production Runtime Architecture](./docs/PRODUCTION_RUNTIME_ARCHITECTURE.md)
- 📄 [Final Database & RLS Security Audit](./docs/FINAL_RLS_SECURITY_AUDIT.md)
- 📄 [Final Real E2E & Test Verification Report](./docs/FINAL_REAL_E2E_VERIFICATION.md)
- 📄 [Final Production Security Audit](./docs/FINAL_PRODUCTION_SECURITY_AUDIT.md)
- 📄 [Final Backup & Disaster Recovery Report](./docs/FINAL_BACKUP_DR_VERIFICATION.md)
- 📄 [Final Launch Acceptance Report](./docs/FINAL_LAUNCH_ACCEPTANCE.md)

---

## 🏥 Enterprise Modules Overview (Phases 1–20)
- **Deterministic Identifiers:** PostgreSQL sequences generating `P-YYYYMM-XXXXX` and visit identifiers (`OPD-`, `IPD-`, `EMG-`).
- **Windows PC Desktop Client (Phase 18):** Tauri 2 powered Windows desktop app connected to canonical production domain (`https://onneshahospital.com`), reusing shared PostgreSQL database, RBAC, and RLS security.
- **Operational Health & DR (Phase 19):** Database connectivity telemetry, PHI-redacted error sanitizer, automated backup protocols, and emergency disaster recovery runbooks.
- **Full Hospital E2E Simulation (Phase 20):** Synthetic simulation of complete patient journey, casualty emergency, pharmacy batch inventory, lab results, void audits, and multi-tenant organization isolation.
- **Security & Audit Vault (Phase 16):** Immutable PostgreSQL audit vault (`audit_logs`), before/after forensic diff viewer, clinical justification mandate for high-risk operations, and zero-mock administration console.
- **Enterprise Printing Engine (Phase 15):** Dual-format print architecture (A4 formal clinical/billing documents + 80mm roll POS thermal slips), zero-dependency SVG Code128/QR generation, multi-tenant print templates, and comprehensive reprint audit logging (`document_print_logs`).
- **Enterprise Notifications (Phase 14):** Transactional Outbox pattern, bilingual Bangla/English templates, SSL Wireless/Greenweb SMS, Meta WhatsApp Business Cloud API, Resend/SendGrid email.
- **Online Payment Engine (Phase 14):** Multi-gateway tokenized checkout (bKash, Nagad, SSLCommerz), server-side invoice due enforcement, constant-time HMAC-SHA256 signature verification, finance reconciliation ledger.
- **Patient 360° EMR:** Chronological medical history timeline (`/app/patients/[id]`) with printable hospital headers.
- **Outpatient Department (OPD):** Consultation console with physiological sanity-bounded vitals and clinical notes (`/app/opd`).
- **Inpatient Department (IPD):** Admission workflow, bed transfers, and mandatory discharge diagnoses (`/app/ipd`).
- **Emergency Department:** Casualty triage with RED/YELLOW/GREEN prioritization and temporary unknown patient chart intake (`/app/emergency`).

---

## 🧪 Automated Testing & Test Categorization Breakdown
**288 / 288** automated test cases passing across **33 complete test suites**:

- **Unit & Helper Tests (135 Scenarios):** `tests/clinical.test.mjs`, `tests/appointments.test.mjs`, `tests/emr-diagnostics.test.mjs`, `tests/beds-ot.test.mjs`, `tests/pharmacy.test.mjs`, `tests/billing.test.mjs`, `tests/hr.test.mjs`, `tests/phase13-public-appointment-seo.test.mjs`, `tests/phase14-notification-payment.test.mjs`, `tests/phase15-printing-engine.test.mjs`
- **Integration & Workflow Tests (50 Scenarios):** `tests/integration/patient-workflow.test.mjs`, `tests/integration/emergency-and-bed.test.mjs`, `tests/integration/pharmacy-and-lab.test.mjs`, `tests/integration/billing-and-payments.test.mjs`, `tests/integration/multi-tenant-rbac.test.mjs`, `tests/e2e/patient-journey-e2e.test.mjs`, `tests/e2e/emergency-e2e.test.mjs`, `tests/e2e/pharmacy-lab-e2e.test.mjs`, `tests/e2e/billing-payment-e2e.test.mjs`, `tests/e2e/patient-opd-real.test.mjs`, `tests/e2e/billing-real.test.mjs`, `tests/e2e/role-rbac-real.test.mjs`
- **Security & MFA Tests (50 Scenarios):** `tests/security.test.mjs`, `tests/auth/admin-login.test.mjs`, `tests/auth/mfa.test.mjs`, `tests/auth/session-security.test.mjs`, `tests/auth/rbac-admin.test.mjs`, `tests/e2e/privacy-and-compliance-e2e.test.mjs`
- **Infrastructure, Desktop & DR Tests (35 Scenarios):** `tests/phase17-pwa-performance-a11y.test.mjs`, `tests/phase18-infrastructure-desktop.test.mjs`, `tests/phase19-backup-monitoring-dr.test.mjs`, `tests/audit-hardening.test.mjs`
- **Production Readiness Simulation (18 Scenarios):** `tests/phase20-hospital-simulation.test.mjs`, `tests/e2e/auth-real-e2e.test.mjs`, `tests/phase16-security-financial-clinical-audit.test.mjs`

---

## 🚀 Quality Gates & Verification Commands
```bash
npm run typecheck    # 0 errors
npx eslint . --quiet # 0 errors
npm test             # 288/288 pass
npm run build        # 40/40 routes statically exported for Cloudflare Pages
```
