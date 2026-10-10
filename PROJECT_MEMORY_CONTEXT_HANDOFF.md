# ONNESHA HOSPITAL ERP — MASTER PERSISTENT CONTEXT & HANDOFF DIRECTIVE
**Last Synchronized:** 2026-10-11T05:07:30+06:00
**Release Version:** v1.1.82 (Production Live)
**Target Host:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
**Remote Database:** Supabase (`iuhtzahuszdkdarhxobx.supabase.co`)
**Repository:** `C:\Users\mahin khan\.gemini\antigravity\scratch\onnesha-hospital` (`origin/main`)

---

## 1. System Overview & Canonical Hospital Branding
- **Canonical English Name:** `ANNESHA HOSPITAL AND DIAGNOSTIC` ("Center" removed across the system per owner directive).
- **Canonical Bengali Name:** `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক` ("সেন্টার" / "কমপ্লেক্স" cancelled across the system).
- **Canonical Address:** শেরপুর রোড, সূত্রাপুর, বগুড়া। (Sherpur Road, Sutrapur, Bogura).
- **Canonical Hotlines:** 01620-003888, 01718-835623.
- **Framework:** Next.js 16.3.8 (App Router, static export with Cloudflare Pages Edge proxy).
- **Desktop Client:** Tauri v2.11.4 (`src-tauri/`) for Windows x86_64 ERP deployment.
- **Backend & Database:** PostgreSQL via Supabase with Row Level Security (RLS), 143 forward-only migrations.
- **Verification Integrity:** 129 test suites passing (1,175 active tests, 0 failures), 52 Playwright Chromium E2E scenarios passing.

---

## 2. IPD 4-Part Discharge Certificate Folder & Print Separation
1. **Authentic 4-Part Folder Layout (Components: `DischargeSummaryPrint.tsx`):**
   - **Page 1 (Discharge Certificate Cover):**
     - Authentic House + Caduceus hospital logo SVG.
     - Hospital header: `অন্বেষা হাসপাতাল ও ডায়াগনস্টিক` / `ANNESHA HOSPITAL AND DIAGNOSTIC`, Sherpur Road, Sutrapur, Bogura, 01620-003888, 01718-835623.
     - Blue 3D Title Banner: `DISCHARGE CERTIFICATE`.
     - Metadata bar: Patient ID, Bed/Cabin no, Date.
     - Body form lines with underline: Certified that Ms/Mrs/Miss, Age, Son/daughter/wife of Mr., of Village, Post, P.S, District, Admitted on/at, Discharged on/at, Suffering from, Name of the Consultant.
     - Signature: `SIGNATURE OF DOCTOR ON DUTY`, EMR barcode, cyan/blue bottom ribbon.
   - **Page 2 (Discharge Summary & OT Report):**
     - Blue header pill: `DISCHARGE SUMMARY`.
     - `1. PRESENTING FEATURES :` lines a, b, c, d.
     - `2. INVESTIGATIONS :` structured pathology & diagnostic lab findings.
     - OT & Surgical lines: a. (1) Date (2) Time, b. Indication, c. Operation, d. Surgeon, e. Assistants (1) (2), f. Anaesthesist, g. Anaesthesia, g. Findings & Procedure.
     - `Baby Note :` Sex, Wt (kg), A/S (Apgar score).
     - Signatures: Duty Doctor / Medical Officer & Attending Consultant / Surgeon.
   - **Page 3 (Treatment Rx):**
     - Blue header pill: `TREATMENT`.
     - Prominent classic `℞` symbol.
     - Take-home medications table (Sl., Medicine Name & Generic, Form, Dosage, Duration, Instructions / সেবনের নিয়ম).
     - Ruled blank lines for physical handwritten prescription continuation.
     - Medication compliance safety notes & Registered Doctor signature.
   - **Page 4 (Discharge Advice & Our Services):**
     - Top Section: `উপদেশ ঃ` with triangle bullets (▶ নিয়মিত ও সময়মত ঔষধ খাবেন, বিশ্রাম দিন/মাস, ভারী কাজ নিষেধ দিন/মাস, সেলাই কাটার তারিখ, সাক্ষাত দিন/মাস পর, কোনো সমস্যা হলে দ্রুত যোগাযোগ করুন).
     - Expanded clinical guidance: Nutrition/diet, wound hygiene, emergency red flag warnings (১০১°+ জ্বর, রক্তপাত, পুঁজ).
     - Signatures: Duty Doctor & Attending Consultant.
     - Blue section banner: `আমাদের সেবা সমূহ`.
     - Comprehensive advanced services: Specialist doctors across all disciplines, 24/7 MBBS duty doctors, VIP/Deluxe cabins & wards, major/minor surgeries, modular OT & anesthesia, generator backup, 24/7 pharmacy & ambulance, computerized lab, 4D USG, digital X-Ray & central oxygen.
     - Bottom hospital branding with Sherpur Road address & hotlines.
2. **Complete Print Decoupling (`app/ipd/page.tsx`):**
   - Printing Discharge Certificate: Prints ONLY the 4-part Discharge Summary modal (exactly 4 A4 pages). Underlying IPD page is hidden via `print:hidden`.
   - Printing IPD Admission: Prints ONLY the Inpatient Admission Sheet (`.print-pad`, 1 page).
   - They NEVER print together or spill into unwanted pages.

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
