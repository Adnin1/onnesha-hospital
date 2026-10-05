# OHMS Engineering Operating Guidelines (GEMINI.md)

## 1. Architectural Invariants
- **Static Export Architecture:** The Next.js frontend is built as a pure static export (`output: 'export'`) deployed to Cloudflare Pages. Never introduce server-only imports (`next/headers`, `next/cookies`), dynamic SSR routes, or Node runtime APIs into client components or static pages. Routing fallbacks and security headers are strictly enforced via `public/_redirects` and `public/_headers`.
- **Zero False-Green Policy:** Never manufacture evidence, passes, hashes, or operational completions. Any gate requiring physical access, merchant credentials, or owner authority must remain explicitly declared as pending owner action.
- **Supabase Multi-Tenancy & RLS:** All database tables must enforce Row Level Security (`ENABLE ROW LEVEL SECURITY`). Every tenant-scoped query and mutation must assert `organization_id = session.organizationId` at both the Server Action and RLS policy layers.
- **General Ledger Atomicity:** Financial operations (billing, pharmacy sales, refunds) must adhere to double-entry bookkeeping. Total debits must equal total credits in every transaction. Inventory stock deductions must be transactional and prevent negative stock.
- **Immutable Git Tag Governance:** Release tags (e.g. `v1.1.47`) are strictly immutable audit anchors. Never force-move or mutate historical tags (`git tag -a -f`). Post-release mainline commits advance forward linearly.

## 2. Release & Code Quality Standards
- **Zero-Warning Linter & Types:** TypeScript (`tsc --noEmit`) and ESLint (`npm run lint`) must pass with 0 errors and 0 warnings (`--max-warnings 0`).
- **Comprehensive Test Suite:** Full suite execution (`node scripts/run-tests.mjs`) must maintain 100% passing suites across all active tests.
- **WCAG 2.2 AA Accessibility:** Public web components must enforce minimum 44×44px touch targets, contrast ratios ≥ 4.5:1, semantic ARIA attributes, explicit skip-to-content anchors, and zero browser-blocking alert modals (`alert`, `confirm`, `prompt`).
- **Service Worker Lifecycle:** Edge static caching in `public/sw.js` must be version-bound to prevent stale deployment shells. Dynamic API endpoints, authentication flows, and token lookups must never be cached (`NEVER_CACHE`).

## 3. Physical & External Owner Boundaries (G1–G16)
The following 16 operational gates are physical/organizational commissioning boundaries and must NEVER be fabricated by autonomous agents:
- G1: Live bKash Merchant Credentials
- G2: Live Nagad Merchant Credentials
- G3: Live Rocket Merchant Credentials
- G4: Bangladesh DLR SMS Gateway API Credits & Sender ID
- G5: Physical 80mm ESC/POS Thermal Receipt Printers
- G6: Physical Flatbed/ADF Document Scanner Driver Binding
- G7: Physical USB/Serial Barcode Scanners
- G8: Physical DICOM PACS Server C-STORE Binding & Modality Link
- G9: Physical ASTM/HL7 Bi-directional Lab Analyzers (LIS)
- G10: Real Doctor BMDC Official Registry Verification
- G11: Physical Cash Drawer Solenoid RJ11 Kick Verification
- G12: Clinical Staff UAT & Dual-Language Sign-Off
- G13: DGHS Private Hospital Regulatory Inspection Sign-Off
- G14: Custom Domain DNS CNAME Cutover (`onneshahospital.com`)
- G15: Windows Authenticode EV Code Signing Certificate & CI Runner Release Build
- G16: Automated Off-Site Database Backups (Requires Supabase Pro/Team Plan)
