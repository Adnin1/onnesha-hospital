# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
## Autonomous Engineering Continuation Protocol

**Classification:** Mandatory Repository-Native Session Continuation Directive  
**Version:** `1.1.47`  
**Applicability:** Universal across all AI Coding Agents (Antigravity, Claude, ChatGPT, Cursor, Roo-Code) and Human Engineers.

---

### 1. Fundamental Source of Truth Principles

1. **The Repository is the Sole Source of Truth:**
   Conversation memory, transcript summaries, or external chatbot assertions are strictly historical commentary. Every new session must establish ground truth exclusively from the live Git tree, repository files, and verified edge endpoints.

2. **Mandatory Start-of-Session Reading Order:**
   Every new engineering session MUST read the following authoritative ledgers before modifying any code or proposing solutions:
   - [`CLOSURE_LEDGER.md`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/CLOSURE_LEDGER.md)
   - [`CURRENT_STATE.md`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/CURRENT_STATE.md)
   - [`OHMS_FINAL_DELIVERY_REPORT.md`](file:///C:/Users/mahin%20khan/.gemini/antigravity/scratch/onnesha-hospital/OHMS_FINAL_DELIVERY_REPORT.md)

3. **Deterministic Verification Before Action:**
   Always verify the live repository baseline using local deterministic commands:
   - Git HEAD: `git rev-parse HEAD`
   - Working Tree State: `git status --porcelain` (must be clean)
   - Remote Synchronization: `node scripts/git-sync.mjs ls-remote` (must match HEAD)
   - Edge Deployment: HTTP probe against `https://onnesha-hospital.pages.dev`

4. **Continuation Invariant:**
   - Every session must continue strictly from the first unresolved executable issue.
   - Already verified, passing work (e.g. green test suites, database migration parity, passing health check gates) must NOT be blindly rewritten or repeated unless hard mathematical evidence demonstrates regression.

---

### 2. Exact Provenance & Deployment Invariant

To permanently eliminate deployment provenance mismatches:

$$\text{FINAL\_HEAD} \equiv \text{REMOTE\_HEAD} \equiv \text{BUILD\_HEAD} \equiv \text{DEPLOYMENT\_HEAD}$$

#### Strict Execution Sequence:
1. **Identify & Fix:** Make code, asset, or documentation modifications.
2. **Quality Gates:** Verify locally:
   - `npm run typecheck` (0 errors)
   - `npm run lint` (0 warnings)
   - `npm audit --audit-level=high` (0 vulnerabilities)
   - `node scripts/run-tests.mjs --certification` (109/109 suites pass)
   - `node --test tests/hardware/*.test.mjs` (35/35 tests pass)
   - `node scripts/project-health-check.mjs --strict` (16/16 gates pass)
3. **Synchronize Ledgers:** Update `CLOSURE_LEDGER.md`, `CURRENT_STATE.md`, and `OHMS_FINAL_DELIVERY_REPORT.md` *inside the same final change set*.
4. **Single Authoritative Commit:** Commit everything together:
   ```bash
   git commit -m "release: ..."
   ```
5. **Push to Remote:**
   ```bash
   node scripts/git-sync.mjs push
   git push origin main
   ```
   Verify `git rev-parse HEAD` matches `origin/main` and `ssh-origin/main`.
6. **Generate Static Export:**
   ```bash
   npm run build
   ```
   (Outputs static HTML, JS, CSS, `_headers`, and `_redirects` to `out/`).
7. **Deploy Exact Built Output:**
   ```bash
   npx wrangler pages deploy out --project-name=onnesha-hospital --branch=main --commit-hash=<HEAD> --commit-dirty=false
   ```
8. **Verify Edge Runtime:**
   ```bash
   node scripts/smoke_test.mjs
   ```
9. **NO POST-DEPLOYMENT UN-DEPLOYED COMMITS:**
   Never create another documentation commit after deploying and leave that new commit undeployed. If any documentation changes are subsequently made, that new commit MUST be rebuilt, pushed, and redeployed.

---

### 3. Non-Negotiable Engineering Constraints

1. **Static Export Architecture:**
   The project is strictly Next.js `output: "export"`. Never introduce request-time server features (Server Actions at request time, cookies, server-side dynamic SSR, or rewrites). All dynamic capabilities interact with Supabase client-side via PostgreSQL RLS or PostgREST RPC.

2. **Zero False-Green Policy:**
   Never fake passes, credentials, physical devices, or regulatory filings. External owner gates (G1–G16) covering live merchant keys, physical ESC/POS printers, ZKTeco terminals, DICOM PACS, and EV code signing certificates must remain truthfully classified as pending owner or on-site commissioning.

3. **Privacy & PHI Protection:**
   Never cache authenticated routes (`/app/*`, `/api/*`, `/displays/*`) in the Service Worker. Never expose patient names, phone numbers, or clinical details in unauthenticated public shells or token lookup queries.
