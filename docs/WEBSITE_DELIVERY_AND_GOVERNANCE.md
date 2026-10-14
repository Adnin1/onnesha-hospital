# OHMS Website Delivery, Verification & Engineering Governance Runbook

**Classification:** Mandatory Production Delivery Standard & Operational Governance Runbook  
**Version:** `1.2.0`  
**Governing Standard:** Section 15 of Master Engineering Protocol  
**Canonical Domain:** `https://onnesha-hospital.pages.dev`  
**Authoritative Metadata Source:** `config/hospital.ts`

---

## 1. Baseline Verification & Source-of-Truth Hierarchy

1. **Hierarchy of Truth:**
   ```
   config/hospital.ts (Single Authoritative Source of Truth)
         │
         ├── config/site.ts (SEO, Canonical URLs, Sitemaps)
         │       │
         │       └── app/sitemap.ts, components/public/HospitalJsonLd.tsx
         │
         └── UI Components (PublicNavbar, PublicFooter, Page Components)
                 │
                 └── public/llms.txt (Public AI & Clinical Crawler Identity)
   ```

2. **Reconciliation Rules:**
   - Any change to hospital legal identity, physical address, hotlines, or licenses MUST occur in `config/hospital.ts`.
   - Never hardcode alternative addresses or phone numbers in subcomponents or marketing pages.
   - Discrepancies between external directory listings and repository baseline are tagged:
     `CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED`.
   - Unverified optional fields (such as DGHS Facility ID pending owner statutory filing) MUST be handled gracefully with conditional rendering (e.g. `Verification Pending (Gate G14)`), NEVER as an empty colon or unverified claim.

---

## 2. Public Website Route Inventory & Acceptance Matrix

The static public portal comprises 12 primary public routes:

| Route | Primary Interaction / Scope | Security & Privacy Boundary |
| :--- | :--- | :--- |
| `/` | Homepage, triage alert, queue preview, quick actions, departments | Zero PII; 15s queue refresh with Page Visibility API guard |
| `/about` | Mission, clinical facilities, authoritative NAP profile, DGHS status | Read-only; no unverified claims or fake credentials |
| `/doctors` | Specialist directory, department filter, visiting hours | Real database query via `getPublicDoctorsAction`; 0 fake doctors |
| `/services` | Clinical departments, indicative diagnostic tariff catalog | Disclaimers present; currency formatted in BDT (`৳`) |
| `/appointment`| Multi-step OPD appointment wizard, Bangladesh phone validation | Duplicate click guard, rate-limited, printable serial slip |
| `/check-token`| Public live token status lookup, anonymized waiting queue | Fail-closed RPC; never displays patient names or diagnoses |
| `/contact` | Hospital contact form, direct reception & ambulance lines | Bound validation (length checks); server-side rate limiting |
| `/downloads/desktop`| Desktop PC ERP installer download, SHA-256 manifest, release notes | Actual binary provenance (`.exe`, `.msi`); EV signing disclosure |
| `/privacy` | Patient data privacy policy | Bangladesh Personal Data Protection Act 2026 alignment |
| `/terms` | Hospital terms of medical service & patient rights | Statutory medical terms; non-fictitious jurisdiction |
| `/consent` | Patient informed consent & treatment guidelines | Educational clinical guidance; no mock consent state |
| `/login` | Staff, doctor, and administrator authentication portal | Supabase Auth; rate-limited; strictly isolated from public data |

---

## 3. Design System & UX Standards

1. **Healthcare Visual Aesthetics:**
   - Palette: Clean white/slate backgrounds with restrained medical navy (`#0369a1`, `#0f172a`) and emerald/teal accents (`#059669`).
   - Emergency highlights reserved strictly for acute casualty elements (`#dc2626`).
   - Clean typography with high legibility across English and Bengali script.

2. **WCAG 2.2 Level AA Accessibility Invariants:**
   - **Touch Targets:** All clickable interactive elements (buttons, links, form inputs) must have a minimum bounding box of 44 × 44 pixels (`min-h-[44px]`).
   - **Focus Indicators:** Visible high-contrast focus rings (`focus:ring-2 focus:ring-sky-500 focus:outline-hidden`).
   - **Skip Link:** Landmark navigation bypass (`#main-content`) prominently styled on focus.
   - **Dialogs & Alerts:** Strict prohibition of browser native `window.alert`, `window.confirm`, or `window.prompt`. All feedback rendered via accessible inline alerts (`role="alert"`).
   - **Mobile Navigation:**
     - Keyboard navigation: `Escape` key closes the menu.
     - Body scroll lock during modal menu expansion.
     - Automatic closure upon route navigation.
     - Zero horizontal overflow (`overflow-x-hidden`).

---

## 4. Technical SEO, Structured Data & Link Integrity

1. **Canonical URLs & Sitemaps:**
   - Canonical URL base: `https://onnesha-hospital.pages.dev` (configured centrally in `config/site.ts`).
   - `app/sitemap.ts`: Dynamic sitemap generated at build time. Strictly includes indexable public routes; strictly excludes `/check-token`, `/login`, and `/app/*`.
   - `public/robots.txt`: Disallows internal ERP routes (`/app/`, `/login`, `/mfa`, `/auth/`).

2. **Structured Data (JSON-LD):**
   - Implemented in `components/public/HospitalJsonLd.tsx` as Schema.org `Hospital`.
   - Prohibits fabricated customer reviews, star ratings, or invented opening hours.

3. **Asset & Link Forensics:**
   - Automated crawler verification via `scripts/website-link-asset-forensics.mjs`.
   - Zero broken internal anchors or dead assets permitted.

---

## 5. Security, Headers & Credential Governance

1. **Security Headers (`public/_headers`):**
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `Content-Security-Policy`: Disallows `unsafe-eval`.
   - `X-Frame-Options: DENY` (anti-clickjacking).
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.

2. **Secret Scanning & Credential Rotation Invariant:**
   - Zero hardcoded Supabase `service_role` secrets, payment secret keys, or bot tokens permitted in repository files or build outputs.
   - Any credential exposed in an operational log or transcript MUST be treated as compromised.
   - The credential MUST be immediately rotated at the provider (e.g. Telegram BotFather) by the owner (`BLOCKED_EXTERNAL_OWNER`).
   - Secret scanners must never echo discovered raw tokens to console or output logs.

---

## 6. Desktop Release & Download Parity Invariant

1. **Parity Check:**
   - `public/downloads/desktop/latest.json` MUST accurately declare:
     - Exact version matching current build (`v1.1.90`).
     - Real SHA-256 hashes matching physical artifacts (`Onnesha-Hospital-Setup-1.1.90.exe`, `Onnesha-Hospital-1.1.90.msi`).
     - Accurate binary file sizes (`~2.8 MB` EXE, `~3.3 MB` MSI).
   - Historical fallback link (`v1.1.4` on GitHub Releases) MUST be clearly designated as an archive fallback.
   - Windows Authenticode EV Code Signing status MUST be disclosed honestly as pending owner hardware token (Gate G15).

---

## 7. Change & Release Lifecycle Workflow

Every modification to the public portal or hospital web code must execute this linear pipeline:

```
[1. Inspect Baseline]  ──► git status, rev-parse HEAD, remote sync
        │
[2. Smallest Safe Edit]──► Surgical replace_file_content (no TODOs)
        │
[3. Local Regression]  ──► npm run typecheck (0 errors)
                       ──► npm run lint (0 warnings)
                       ──► node --test tests/website-*.test.mjs
                       ──► npm test (all 150 suites)
        │
[4. Static Export]     ──► npm run build (63 routes in out/)
                       ──► node scripts/website-route-acceptance.mjs
                       ──► node scripts/website-link-asset-forensics.mjs
        │
[5. Push & Deploy]     ──► git push ssh-origin main
                       ──► npx wrangler pages deploy out --commit-dirty=false
        │
[6. Edge Smoke Test]   ──► curl.exe -I https://onnesha-hospital.pages.dev
                       ──► node scripts/scheduled-health-check.mjs
        │
[7. Closure Ledger]    ──► Record SHA, deployment ID, and gate status
```

---

## 8. External Owner-Controlled Commissioning Gates (G1–G16)

The following external gates are strictly owner-controlled and cannot be bypassed or fabricated by software engineering:

- **Gate G1:** Live bKash, Nagad & SSLCommerz merchant production keys.
- **Gate G2:** Bulk SMS Provider production API key.
- **Gate G3:** WhatsApp Business Cloud API token & Telegram BotFather token rotation.
- **Gate G4:** Hospital official SMTP credentials.
- **Gate G5:** Physical 80mm ESC/POS thermal receipt printers on hospital LAN.
- **Gate G6:** Physical 2D handheld barcode scanners.
- **Gate G7:** Physical ZKTeco biometric attendance terminals (Hospital LAN IP binding).
- **Gate G8:** Physical DICOM PACS modality network routing (C-STORE binding).
- **Gate G9:** Physical LIS analyzer serial/TCP interfaces.
- **Gate G10:** Production service-role credentials in hosting environment (`SUPABASE_SERVICE_ROLE_KEY`).
- **Gate G11:** Supabase Point-in-Time Recovery (PITR) & off-site backup configuration.
- **Gate G12:** Physical queue TV Android display units in waiting areas.
- **Gate G13:** Clinical UAT formal sign-off from Hospital Superintendent.
- **Gate G14:** DGHS & BMDC statutory compliance registration filings.
- **Gate G15:** Windows Authenticode EV Code Signing Certificate & hardware token.
- **Gate G16:** Custom domain DNS CNAME cutover (`onneshahospital.com`).
