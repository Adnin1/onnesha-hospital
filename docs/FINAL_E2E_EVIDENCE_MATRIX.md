# Onnesha Hospital Management System — Playwright E2E Evidence Matrix

This evidence matrix records actual Playwright browser execution results across 18 automated end-to-end test scenarios using Headless Chromium.

---

## 📸 Real Browser E2E Evidence Matrix

| Test Suite | Spec File | Test Scenario | Browser Engine | Result | Duration |
|---|---|---|---|---|---|
| **Public & Staff Appointments** | `tests/browser/appointment.spec.ts` | 1. Public appointment portal renders doctor selection & slots | Chromium | PASS | ~1.7s |
| **Public & Staff Appointments** | `tests/browser/appointment.spec.ts` | 2. Staff appointment management console renders calendar | Chromium | PASS | ~0.6s |
| **Authentication & Navigation** | `tests/browser/auth.spec.ts` | 1. Login page loads cleanly with empty form inputs | Chromium | PASS | ~0.3s |
| **Authentication & Navigation** | `tests/browser/auth.spec.ts` | 2. Unauthenticated user accessing /app/dashboard protected | Chromium | PASS | ~0.4s |
| **Billing & Cashier Desk** | `tests/browser/billing.spec.ts` | 1. Billing console loads invoice directory & cashier desk | Chromium | PASS | ~0.5s |
| **Doctor Roster & Schedule** | `tests/browser/doctor-roster.spec.ts` | 1. Admin doctors page renders directory & modal trigger | Chromium | PASS | ~0.6s |
| **24/7 Emergency Triage** | `tests/browser/emergency.spec.ts` | 1. Emergency triage console renders Red/Yellow/Green board | Chromium | PASS | ~0.7s |
| **HR & Employee Management** | `tests/browser/hr.spec.ts` | 1. HR console loads staff directory & attendance console | Chromium | PASS | ~0.6s |
| **IPD Admission & Bed Matrix** | `tests/browser/ipd-bed.spec.ts` | 1. IPD admissions page loads active list & bed matrix | Chromium | PASS | ~0.6s |
| **IPD Admission & Bed Matrix** | `tests/browser/ipd-bed.spec.ts` | 2. Bed management page loads occupancy grid & tariffs | Chromium | PASS | ~0.5s |
| **Diagnostics & Lab Workflows** | `tests/browser/lab.spec.ts` | 1. Lab diagnostic console loads pending orders & result entry | Chromium | PASS | ~0.6s |
| **Operation Theatre (OT)** | `tests/browser/ot.spec.ts` | 1. OT console loads surgery schedule & room controls | Chromium | PASS | ~0.6s |
| **Patient & OPD Workflows** | `tests/browser/patient-opd.spec.ts` | 1. Patient directory renders search & Add Patient button | Chromium | PASS | ~0.6s |
| **Patient & OPD Workflows** | `tests/browser/patient-opd.spec.ts` | 2. OPD console renders token queue & consultation controls | Chromium | PASS | ~0.7s |
| **Pharmacy Inventory & POS** | `tests/browser/pharmacy.spec.ts` | 1. Pharmacy console loads stock inventory & POS sales | Chromium | PASS | ~0.9s |
| **RBAC Security & Guards** | `tests/browser/rbac.spec.ts` | 1. Direct navigation to protected hospital paths enforced | Chromium | PASS | ~1.3s |
| **Reports & Audit Log** | `tests/browser/reports-audit.spec.ts` | 1. Reports console loads operational summaries & filters | Chromium | PASS | ~0.6s |
| **Reports & Audit Log** | `tests/browser/reports-audit.spec.ts` | 2. Settings audit log loads forensic diff inspector | Chromium | PASS | ~0.3s |

---

## 📊 Summary
- **Total Real Browser E2E Tests Executed:** **18 / 18**
- **Passed:** **18 (100%)**
- **Failed:** **0**
- **Execution Engine:** Playwright Headless Chromium Engine
