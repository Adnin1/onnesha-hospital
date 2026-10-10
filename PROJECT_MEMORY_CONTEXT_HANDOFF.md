# ONNESHA HOSPITAL ERP — MASTER PERSISTENT CONTEXT & HANDOFF DIRECTIVE
**Last Synchronized:** 2026-10-11T04:38:24+06:00
**Release Version:** v1.1.82 (Production Live)
**Target Host:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
**Remote Database:** Supabase (`iuhtzahuszdkdarhxobx.supabase.co`)
**Repository:** `C:\Users\mahin khan\.gemini\antigravity\scratch\onnesha-hospital` (`origin/main`)

---

## 1. System Overview & Architecture
- **Framework:** Next.js 16.3.8 (App Router, static export with Cloudflare Pages Edge proxy).
- **Desktop Client:** Tauri v2.11.4 (`src-tauri/`) for Windows x86_64 ERP deployment.
- **Backend & Database:** PostgreSQL via Supabase with Row Level Security (RLS), 143 forward-only migrations.
- **Verification Integrity:** 129 test suites passing (1,175 active tests, 0 failures), 52 Playwright Chromium E2E scenarios passing.

---

## 2. Recent Major Deliverables (Diagnostic Catalog & Tariffs)
1. **Diagnostic Catalog Overhaul (16 Categories, 191 Tests):**
   - Migration: `20261011043000_seed_official_diagnostic_catalog_and_tariffs.sql` pushed and verified in remote DB.
   - Categories:
     1. Hematological Tests (11 tests)
     2. Sero-Immunology Tests (2 tests)
     3. Biochemistry (29 tests)
     4. ICT Method Immunology/Virology Tests (7 tests)
     5. Serology Tests (1 test)
     6. Immunological Tests (10 tests)
     7. Reproductive Endocrinology (6 tests)
     8. Oncology (6 tests)
     9. Clinical Pathology (6 tests)
     10. Microbiological Tests (5 tests)
     11. Microbiological Tests (Widal/Other) (2 tests)
     12. USG (12 tests)
     13. X-RAY (42 tests)
     14. CT Scan (18 tests)
     15. MRI (26 tests)
     16. Special Diagnostics (Endoscopy/Echo/Duplex) (8 tests)
2. **Optional Test Code:**
   - In `components/lab/TestTariffManager.tsx` and `lib/lab/actions.ts`, `test_code` is optional.
   - If left blank, the backend auto-generates a unique uppercase identifier based on the test name.

---

## 3. Persistent User Directives & Rules
1. **Never shut down the PC automatically** under any autonomous protocol.
2. Master shortcuts (`/t`, `/godmode`, `/apex`, `/auto`, `/flash-opus`, `/nije-koro`) execute the full end-to-end software development lifecycle autonomously.
3. Zero placeholders (`// TODO` strictly banned), 100% runtime-ready code, strict typecheck (`tsc --noEmit`), and zero-warning policy.
4. Auto-deploy to Cloudflare Pages via `npm run deploy` upon passing verification.

---

## 4. How to Resume in a New Conversation
In a new conversation window, you can simply type:
```text
/t resume
```
or
```text
sob mone ache? kaj chalu koro
```
The agent will instantly read this file and the MCP knowledge graph to continue with 100% memory retention.
