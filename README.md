# Onnesha Hospital Management System (OHMS)
Enterprise Healthcare Operations & Multi-Tenant SaaS Platform

[![Tests](https://img.shields.io/badge/tests-101%2F101%20passing-brightgreen)](#automated-testing)
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
- 📄 [Master System Completion Report](./docs/MASTER_SYSTEM_COMPLETION_REPORT.md) (Zero-Mock Enterprise Operations Audit)

---

## 🏥 Clinical Foundation (Phase 3 Scope)
- **Deterministic Identifiers:** PostgreSQL sequences generating `P-YYYYMM-XXXXX` and visit identifiers (`OPD-`, `IPD-`, `EMG-`).
- **Bangladesh Mobile Phone Canonicalization:** Strict conversion of `+880`, `880`, spaces, and dashes into `01[3-9]\d{8}` format.
- **Multi-Signal Duplicate Detection:** Server-side engine combining exact NID matches, Dice's Bigram coefficient name similarity, and shared phone number analysis.
- **Patient 360° EMR:** Chronological medical history timeline (`/app/patients/[id]`) with printable hospital headers.
- **Outpatient Department (OPD):** Consultation console with physiological sanity-bounded vitals and clinical notes (`/app/opd`).
- **Inpatient Department (IPD):** Admission workflow, bed transfers, and mandatory discharge diagnoses (`/app/ipd`).
- **Emergency Department:** Casualty triage with RED/YELLOW/GREEN prioritization and temporary unknown patient chart intake (`/app/emergency`).

---

## 🧪 Automated Testing
101 / 101 automated test cases passing across 8 complete test suites:
- `tests/security.test.mjs` (20 Scenarios)
- `tests/clinical.test.mjs` (21 Scenarios)
- `tests/appointments.test.mjs` (10 Scenarios)
- `tests/emr-diagnostics.test.mjs` (10 Scenarios)
- `tests/beds-ot.test.mjs` (10 Scenarios)
- `tests/pharmacy.test.mjs` (10 Scenarios)
- `tests/billing.test.mjs` (10 Scenarios)
- `tests/hr.test.mjs` (10 Scenarios)

---

## 🚀 Quality Gates & Verification Commands
```bash
npm run typecheck    # 0 errors
npx eslint . --quiet # 0 errors
npm test             # 101/101 pass
npm run build        # 29/29 routes statically exported for Cloudflare Pages
```

