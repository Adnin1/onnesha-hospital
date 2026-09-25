# OHMS CURRENT PRODUCTION TRUTH REPORT
**Classification:** AMBER — SOFTWARE IMPLEMENTED & VERIFIED; OPERATIONAL COMMISSIONING PENDING  
**Report Generated:** 2026-09-26T03:54:20+06:00  
**Repository:** `Adnin1/onnesha-hospital`  
**Git Branch:** `main`  
**Current Git HEAD:** `74721aa896499320602b44a0df45b42c0595c8cf`  
**Cloudflare Live Production URL:** `https://onnesha-hospital.pages.dev`  
**Supabase Database Instance:** `iuhtzahuszdkdarhxobx.supabase.co`  

---

## 1. Executive Summary & Zero-Fabrication Verdict
* **Software Engineering Baseline:** `100% VERIFIED & SOUND`. Zero TypeScript errors, zero ESLint warnings, 71/71 test suites passing, and 152/152 Playwright cross-browser runs passing across Chromium, Firefox, Mobile Chrome, and WebKit.
* **Database & Migrations:** **68 Migrations Applied & in 100% Parity**. Migration 068 applied extending Critical Care (ICU/CCU/SICU), Blood Bank, Radiology studies, Registrar certificates, Ambulance dispatch, and CRM Health Cards with strict RLS policies.
* **GitHub Actions CI State:** Mandatory CI (`validate` job) passes cleanly. The dedicated staging live security job triggers fail-closed when staging credentials are intentionally omitted from GitHub secrets.
* **External Operational Reality:** 13 external/owner/hardware gates remain blocked awaiting real-world human, merchant, or on-site device actions.

---

## 2. Definitive Metrics Matrix

| Category | Recomputed Metric | Verification State |
| :--- | :--- | :--- |
| **Local Git HEAD** | `74721aa896499320602b44a0df45b42c0595c8cf` | Active |
| **Remote Git HEAD** | `74721aa896499320602b44a0df45b42c0595c8cf` | 100% Synchronized (`refs/heads/main`) |
| **Database Migrations** | `68` (001 to 20260926040000) | 100% Remote Database Parity |
| **Node.js Test Suites** | `71` Suites / `625` Tests Passed | 0 Failures, 6 Standard Skips |
| **Cross-Browser Tests** | `152` Tests (Chromium, Firefox, Mobile, WebKit) | 100% Passed (38 tests/browser) |
| **TypeScript / ESLint** | `tsc --noEmit` & `eslint --max-warnings 0` | 0 Errors, 0 Warnings |
| **Static HTML Routes** | `44` Static Export Routes (`out/`) | 100% Pre-rendered SSG |
| **Internal Assets / Links**| `298` Links, `667` Assets Validated | 0 Broken References |
| **Operational Gates** | `13` Blocked by External/Owner/Hardware | Zero Fabricated PASS |
