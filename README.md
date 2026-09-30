# Onnesha Hospital Management System (OHMS v1.1.26)
Enterprise Healthcare Operations & Multi-Tenant SaaS Platform

[![Version](https://img.shields.io/badge/version-v1.1.26-blue.svg)](./docs/FINAL_PRODUCTION_CERTIFICATION.md)
[![Tests](https://img.shields.io/badge/tests-840%20active%20passed-brightgreen.svg)](./docs/FINAL_PRODUCTION_CERTIFICATION.md)
[![Suites](https://img.shields.io/badge/test%20suites-95%20passed-brightgreen.svg)](./docs/FINAL_PRODUCTION_CERTIFICATION.md)
[![TypeScript](https://img.shields.io/badge/typescript-strict%200%20errors-blue.svg)](#quality-gates)
[![ESLint](https://img.shields.io/badge/eslint-0%20warnings-brightgreen.svg)](#quality-gates)
[![Next.js](https://img.shields.io/badge/next.js-16.3.8%20turbopack-black.svg)](https://nextjs.org)
[![Cloudflare](https://img.shields.io/badge/deployment-cloudflare%20pages-orange.svg)](https://onnesha-hospital.pages.dev)

- **Live Canonical Production URL:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
- **GitHub Repository:** [Adnin1/onnesha-hospital](https://github.com/Adnin1/onnesha-hospital)
- **Database Engine:** Supabase PostgreSQL with Multi-Tenant Row Level Security (RLS) (98/98 Migrations Synchronized)
- **Runtime Architecture:** Next.js Turbopack Static Export (`output: "export"`) deployed to Cloudflare Pages Global Anycast CDN, backed by Supabase PostgreSQL and Tauri 2 Windows Desktop Client.

---

## 📋 Core Governance & Architectural Documentation
- 📄 [Final Production Certification (v1.1.26)](./docs/FINAL_PRODUCTION_CERTIFICATION.md) — Authoritative release certification, automated test evidence, and 68-field machine-readable system ledger.
- 📄 [Project Execution State Ledger](./docs/PROJECT_EXECUTION_STATE.md) — Single source of truth for runtime provenance, database parity, and 5-gate closure matrix.
- 📄 [Operational Commissioning Status & 14 Owner Gates](./docs/FINAL_OPERATIONAL_COMMISSIONING_STATUS.md) — Real-world hospital physical and business commissioning prerequisites.
- 📄 [Final System Architecture](./docs/FINAL_SYSTEM_ARCHITECTURE.md) — Single-platform topology, data flows, and sub-systems.
- 📄 [Final Security Model & RLS Specifications](./docs/FINAL_SECURITY_MODEL.md) — Multi-tenant organization isolation, RBAC role matrix, and audit vault.
- 📄 [Final Deployment Architecture](./docs/FINAL_DEPLOYMENT_ARCHITECTURE.md) — Cloudflare Pages edge proxy and hermetic CI pipeline.
- 📄 [Final Backup & Disaster Recovery Runbook](./docs/FINAL_BACKUP_DR.md) — Database backup policy, point-in-time recovery, and storage sync.
- 📄 [Hospital Staff Operational Runbook](./docs/FINAL_OPERATION_RUNBOOK.md) — Day-to-day reception, nursing, pharmacy, and cashier workflows.
- 📄 [Final UI Functional Inventory](./docs/FINAL_UI_FUNCTIONAL_INVENTORY.md) — Inventory of all 58 routes and clinical management consoles.
- 📄 [Real Browser E2E Specification & Results](./docs/FINAL_REAL_BROWSER_E2E.md) — 38 Playwright Chromium E2E specs running live against production edge.

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
- **Diagnostic Pathology & Imaging:** Order processing, specimen accessioning, reference range validations, and pathologist sign-off locking.
- **Direct Clinical Analyzer / LIS Integration:** Automated bi-directional laboratory instrument integration supporting ASTM E1381/E1394 and HL7 v2.5.1 protocols (Mindray, Roche Cobas, Sysmex, Bio-Rad) with native Local LIS Bridge daemon (`lib/lab/lis/local-bridge.ts`), database-level idempotency constraints, atomic transactional RPC writes, persistent critical panic value alerts (`lab_critical_alerts`), and host-query worklist generation.
- **Pharmacy & POS Inventory:** Batch tracking, FEFO dispensing, stock alerts, thermal POS receipt generation.

---

## 🧪 Automated Testing Breakdown (Current Verified Metrics)
- **Total Test Suites:** 95 / 95 Passed (0 failures)
- **Active Automated Test Cases:** 840 Passed
- **Standard Deferred / Skips:** 6 (explicit external vendor / optional staging dependencies)
- **Real Browser Chromium E2E:** 38 / 38 Passed (Playwright live against production edge)
- **Prerendered Static Routes:** 58 / 58 Routes (56 HTML pages + sitemap.xml)
- **Static Link & Asset Crawl:** 0 broken references across 384 exported files

---

## 🚀 Quality Gates & Verification Commands
```bash
npm run typecheck                  # Strict TypeScript check (0 errors)
npx eslint . --max-warnings 0      # ESLint strict gate (0 warnings, 0 errors)
npm audit --audit-level=high       # Security dependency audit (0 vulnerabilities)
npm run build                      # 58 static routes exported cleanly
npm run audit:assets               # 0 broken internal links or static assets
npm test                           # 95 suites, 840 active tests pass
npm run test:security              # 20 core security scenarios pass
node scripts/project-health-check.mjs --strict  # 15/15 governance gates pass
npx playwright test --project=chromium          # 38 live browser E2E specs pass
node scripts/smoke_test.mjs        # 15 routes 200 OK, 4/4 live security layers green
```

---

## ⚖️ Real-World Governance Boundary
Under the **Antigravity Autonomous Engineering Swarm Constitution**:
> **`Software Complete ≠ Hospital Operationally Ready`**

All software code, database migrations, security policies, and automated test layers are **100% Code-Complete and Certified Green**. Live hospital operation requires 14 physical/external Owner Gates (e.g. physical POS thermal printers, live merchant onboarding keys, and regulatory sign-offs) documented in [FINAL_OPERATIONAL_COMMISSIONING_STATUS.md](./docs/FINAL_OPERATIONAL_COMMISSIONING_STATUS.md).
