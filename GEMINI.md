# OHMS Supreme Autonomous Engineering Operating Guidelines (GEMINI.md)
# AUTONOMOUS_ENGINEERING_SWARM_GODMODE_V5 (PROJECT ROOT)

## 0. Universal Master Autonomous Shortcuts & Triggers
Whenever the user issues ANY of the following shortcuts, triggers, or phrases:
- `/apex-engine`, `/apex`, `/gsd-ship`, `/ship`, `/godmode`, `/auto`
- `APEX: RUN`, `APEX`, `SHIP`, `GSD`, `AUTO-PILOT`, `GODMODE`, `SWARM`, `DEPLOY`, `PRODUCTION`
- Bengali: `"সব কাজ নিজে নিজে কমপ্লিট করো"`, `"নিজে নিজে করে দাও"`, `"একদম শেষ করে দাও"`, `"শর্টকাট দিয়ে দাও"`
You MUST automatically execute the full end-to-end engineering lifecycle without asking routine questions or requiring manual reminders. The user NEVER needs to repeat long prompts again.

---

## 1. Autonomous Engine Orchestration (Zero Manual Reminder Policy)
The user must NEVER need to remind you to run tests, fix linter warnings, perform audits, or deploy to edge. You execute them automatically:
1. **GSD Core Discipline (Plan → Execute → Verify → Ship):** Maintain structured progress, keep Git working tree clean, and prevent context rot.
2. **Ralph Autonomous Feedback Loop (Loop Until Green):** After code changes, automatically run `node scripts/run-tests.mjs`. If a test fails, diagnose the root cause, patch the code, and re-test until green without stopping.
3. **Roo Code Multi-Mode Reasoning:**
   - **Architect First:** Analyze dependencies, database schemas, and contracts before modifying files.
   - **Code Cleanly:** Ensure 0 TypeScript errors and 0 ESLint warnings (`--max-warnings 0`).
   - **Debug to Root Cause:** Diagnose stack traces and patch bugs with minimal blast radius.
4. **CodeRabbit Adversarial Review:** Pre-commit audit for security flaws, tenant isolation (`organization_id`), input sanitization, and regression risks.
5. **APEX Engine v5.0 Verification:** Ground all assertions in empirical proof (108 migrations parity, 109 passing suites, clean git tree, Cloudflare live 200 OK).

---

## 2. Architectural Invariants
- **Static Export Architecture:** Built as pure static export (`output: 'export'`) deployed to Cloudflare Pages. Never introduce server-only imports (`next/headers`, `next/cookies`) into UI components. Edge redirects and headers enforced via `public/_redirects` and `public/_headers`.
- **Zero False-Green Policy:** Never manufacture evidence, passes, hashes, or operational completions.
- **Supabase Multi-Tenancy & RLS:** All database tables must enforce Row Level Security (`ENABLE ROW LEVEL SECURITY`). Every tenant-scoped query and mutation must assert `organization_id = session.organizationId` at both Server Action and RLS layers.
- **General Ledger Atomicity:** Financial operations adhere to double-entry bookkeeping (Debits = Credits). Stock deductions must prevent negative balances.
- **Immutable Git Tag Governance:** Release tags (e.g. `v1.1.47`) are strictly immutable audit anchors. Never force-move or mutate historical tags (`git tag -a -f`).

---

## 3. Human & On-Site Boundary Governance (G1–G16)
The following 16 operational gates are physical/organizational commissioning boundaries and must NEVER be fabricated:
- G1: Live Payment Gateway Keys (bKash, SSLCommerz, Nagad)
- G2: Bulk SMS Provider API Key
- G3: WhatsApp Business Cloud API Key
- G4: Hospital SMTP Mail Credentials
- G5: Physical 80mm ESC/POS Thermal Receipt Printers
- G6: Physical 2D Handheld Barcode Scanners
- G7: Physical ZKTeco Biometric Terminals (Hospital LAN IP routing)
- G8: Physical DICOM PACS Modalities (C-STORE binding)
- G9: Physical LIS Analyzers (Serial/TCP interfaces)
- G10: GitHub Actions Staging Secrets (`OHMS_TEST_SUPABASE_URL`, `OHMS_TEST_SERVICE_ROLE_KEY`)
- G11: Supabase Point-in-Time Recovery (PITR) & Off-site Backups
- G12: Physical Queue TV Android Displays
- G13: Clinical UAT Sign-Off from Hospital Superintendent
- G14: DGHS & BMDC Statutory Compliance Filings
- G15: Windows Authenticode EV Code Signing Certificate & Hardware Token
- G16: Custom Domain DNS CNAME Cutover
