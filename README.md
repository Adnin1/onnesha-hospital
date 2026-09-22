# Onnesha Hospital Management System (OHMS v1.1.5)
Enterprise Healthcare Operations & Multi-Tenant SaaS Platform

[![Tests](https://img.shields.io/badge/tests-593%20active%20passing-brightgreen)](#automated-testing)
[![Suites](https://img.shields.io/badge/test%20suites-69%20passed-brightgreen)](#automated-testing)
[![TypeScript](https://img.shields.io/badge/typescript-strict%200%20errors-blue)](#quality-gates)
[![ESLint](https://img.shields.io/badge/eslint-0%20errors-brightgreen)](#quality-gates)
[![Next.js](https://img.shields.io/badge/next.js-16.3.5%20turbopack-black)](https://nextjs.org)
[![Cloudflare](https://img.shields.io/badge/deployment-cloudflare%20pages-orange)](https://onnesha-hospital.pages.dev)

- **Live Production URL:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
- **GitHub Repository:** [Adnin1/onnesha-hospital](https://github.com/Adnin1/onnesha-hospital)
- **Database Engine:** Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS) (61/61 Migrations Synchronized)

---

## 📋 Final Production Hardening & Operational Acceptance Documentation
- 📄 [Final Zero-Gap Production Closure Report 2026](./docs/OHMS_FINAL_ZERO_GAP_CLOSURE_2026.md)
- 📄 [Execution Checkpoint & Audit Certification](./docs/OHMS_EXECUTION_CHECKPOINT.md)
- 📄 [Final UI Functional Inventory](./docs/FINAL_UI_FUNCTIONAL_INVENTORY.md)
- 📄 [Final Production User Acceptance (UAT) Checklist](./docs/FINAL_PRODUCTION_USER_ACCEPTANCE.md)
- 📄 [Final Functional Regression Matrix](./docs/FINAL_FUNCTIONAL_REGRESSION_MATRIX.md)
- 📄 [Final E2E Evidence Matrix](./docs/FINAL_E2E_EVIDENCE_MATRIX.md)
- 📄 [Final Current State Audit](./docs/FINAL_CURRENT_STATE_AUDIT.md)
- 📄 [Final Real-World Operational Certification Matrix](./docs/FINAL_REAL_WORLD_OPERATIONAL_CERTIFICATION.md)
- 📄 [Final Operational Acceptance Matrix](./docs/FINAL_OPERATIONAL_ACCEPTANCE_MATRIX.md)
- 📄 [Real Browser E2E Specification & Results](./docs/FINAL_REAL_BROWSER_E2E.md)
- 📄 [HMS Daily Operational Staff Runbook](./docs/HMS_DAILY_OPERATION_RUNBOOK.md)
- 📄 [Final Database Workflow Verification](./docs/FINAL_DATABASE_WORKFLOW_VERIFICATION.md)
- 📄 [Production Runtime Architecture Verification](./docs/FINAL_RUNTIME_ARCHITECTURE_VERIFICATION.md)

---

## 🏥 Enterprise Modules Overview (14 Core Modules Verified)
- **Deterministic Identifiers:** PostgreSQL sequences generating `P-YYYYMM-XXXXX` and visit identifiers (`OPD-`, `IPD-`, `EMG-`).
- **Windows PC Desktop Client:** Tauri 2 powered Windows desktop app connected to production host (`https://onnesha-hospital.pages.dev`), reusing shared PostgreSQL database, RBAC, and RLS security.
- **Operational Health & DR Runbook:** Database connectivity telemetry, PHI-redacted error sanitizer, automated backup protocols, and emergency disaster recovery runbooks.
- **Full Hospital E2E Simulation:** Synthetic simulation of complete patient journey, casualty emergency, pharmacy batch inventory, lab results, void audits, and multi-tenant organization isolation.
- **Security & Audit Vault:** Immutable PostgreSQL audit vault (`audit_logs`), before/after forensic diff viewer, clinical justification mandate for high-risk operations, and zero-mock administration console.
- **Enterprise Printing Engine:** Dual-format print architecture (A4 formal clinical/billing documents + 80mm roll POS thermal slips), zero-dependency SVG Code128/QR generation, multi-tenant print templates, and comprehensive reprint audit logging (`document_print_logs`).
- **Enterprise Notifications:** Transactional Outbox pattern, bilingual Bangla/English templates, fail-closed when provider credentials unconfigured.
- **Online Payment Engine:** Multi-gateway tokenized checkout (bKash, Nagad, SSLCommerz), server-side invoice due enforcement, constant-time HMAC-SHA256 signature verification, finance reconciliation ledger.
- **Patient 360° EMR:** Chronological medical history timeline (`/app/patients/[id]`) with printable hospital headers.
- **Outpatient Department (OPD):** Consultation console with physiological sanity-bounded vitals and clinical notes (`/app/opd`).
- **Inpatient Department (IPD):** Admission workflow, bed transfers, and mandatory discharge diagnoses (`/app/ipd`).
- **Emergency Department:** Casualty triage with RED/YELLOW/GREEN prioritization and temporary unknown patient chart intake (`/app/emergency`).
- **Diagnostic Pathology & Imaging:** Order processing, specimen accessioning, reference range validations.
- **Pharmacy & POS Inventory:** Batch tracking, FEFO dispensing, stock alerts, thermal POS receipt generation.

---

## 🧪 Automated Testing Breakdown (Current Verified Metrics)
- **Total Test Suites:** 69 / 69 Passed (0 failures)
- **Active Automated Test Cases:** 593 Passed
- **Standard Deferred:** 6 (explicit external vendor / optional staging dependencies)
- **Cross-Browser Playwright Matrix:** 108 / 108 Passed (Chromium: 27/27, Firefox: 27/27, Mobile Chrome: 27/27, WebKit: 27/27)

---

## 🚀 Quality Gates & Verification Commands
```bash
npm run typecheck    # 0 errors
npx eslint . --quiet # 0 errors
npm test             # 590 active tests pass across 69 suites
npm run build        # 43/43 routes statically exported for Cloudflare Pages
```
