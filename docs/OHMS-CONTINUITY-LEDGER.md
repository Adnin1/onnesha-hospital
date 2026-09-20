# ONNESHA HOSPITAL MANAGEMENT SYSTEM & ERP (OHMS ERP)
## AUTHORITATIVE PRODUCTION CONTINUITY LEDGER (v1.1.0)

**Document Ref:** `docs/OHMS-CONTINUITY-LEDGER.md`  
**Last Verified Timestamp:** `2026-09-21T02:00:00+06:00`  
**Auditor:** Senior Full-Stack & Release Engineer (Antigravity)  
**Standard:** Strict Granular Truth & Zero Fabrication

---

### 1. Authoritative Identity & Lineage

| Attribute | Verified Value | Evidence Method |
|---|---|---|
| **Repository** | `Adnin1/onnesha-hospital` | `git remote -v` |
| **Active Branch** | `main` | `git branch --show-current` |
| **Active Release Version** | `v1.1.0` (Major ERP Architecture Milestone) | `package.json` |
| **Historical Tag v1.0.8 Target** | `39728c93b67e28daf705ef61890c1790c958fa70` | `git rev-parse 'v1.0.8^{commit}'` |
| **Historical Tag v1.0.7 Target** | `dfed116f44448065906789222860c52ab0aa864b` | `git rev-parse 'v1.0.7^{commit}'` |
| **Historical Tag v1.0.6 Target** | `cab210cba268e85f5a7c5d759e38874b897cd827` | `git rev-parse 'v1.0.6^{commit}'` |
| **Historical Tag v1.0.5 Target** | `208c37b89ad3fa601f9a7114cf0d26016a14d300` | `git rev-parse 'v1.0.5^{commit}'` |

---

### 2. Cryptographic Artifact Checksums (SHA-256) (v1.1.0)

| Binary File | Size (Bytes) | SHA-256 Checksum | Origin Compiler |
|---|---|---|---|
| `Onnesha-Hospital-Setup-1.1.0.exe` | 1,989,452 | `093485037636E1CFD8AB48B2EF5755DD7F26E520FC8B8E3D51F3482716EB3278` | NSIS 3.10 (`makensis.exe`) |
| `Onnesha-Hospital-1.1.0.msi` | 2,494,464 | `274CB7B2B06671E8B4E98A08CC51EF6C4960E1ACD6CC5199FE91A6A6C8694B44` | WiX Toolset 3.11 (`candle` + `light`) |
| `latest.json` | 845 | Pinned to v1.1.0 manifest | UTF-8 JSON Manifest |

---

### 3. Database & Remote State (Supabase)

| Attribute | State | Verification Method |
|---|---|---|
| **Project Reference** | `iuhtzahuszdkdarhxobx` | `.env.local` / linked configuration |
| **Database Engine** | PostgreSQL 17.6 (`ap-southeast-1`) | Live connection |
| **Active Migrations** | `47/47` Synchronized (0 drift) | `npx supabase migration list` |
| **Schema Linter** | `0 errors` across extensions/private/public | `npx supabase db lint --linked` |
| **Tenant Resolver** | `private.get_current_org_id()` SECURITY DEFINER | Migration 46 live in catalog |
| **ERP Foundations** | Migration 47 (`20260921020000_hospital_erp_core_foundations.sql`) | Applied & verified in live catalog |
| **Atomic Posting RPC** | `public.post_journal_entry_atomic` enforcing $\sum \text{Debit} = \sum \text{Credit}$ | Migration 47 live in catalog |

---

### 4. Quality Gates & Test Suites Summary

| Test Suite / Quality Gate | Total Cases | Result | Duration |
|---|---|---|---|
| **TypeScript Typecheck** (`tsc --noEmit`) | 100% files | **PASS (0 errors)** | 2.1s |
| **ESLint Quality Gate** (`--max-warnings 0`) | 100% files | **PASS (0 errors, 0 warnings)** | 4.8s |
| **Node Unit & Integration Suites** | 442 cases across 51 suites | **PASS (436 passed, 0 failed, 6 standard skips)** | 7.8s |
| **Chromium Playwright E2E Tests** | 22 browser test cases | **PASS (22 passed, 0 failed)** | 14.9s |
| **Next.js Production SSG Build** | 43 routes | **PASS (0 errors)** | 8.0s |
| **Desktop Compilation (Tauri v2)** | WiX MSI + NSIS EXE | **PASS (0 errors)** | 52.4s |
