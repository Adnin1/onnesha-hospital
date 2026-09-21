# OHMS ERP: GitHub Production Security & CI/CD Verification (2026)

**Repository:** `Adnin1/onnesha-hospital`
**Pipeline File:** `.github/workflows/ci.yml`
**Verification Date:** September 22, 2026
**Auditor Mode:** GitHub Security & DevSecOps Engineer
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`

---

## 1. CI/CD Pipeline Architecture & Fail-Closed Gate Invariants

```
validate (Typecheck, Lint, Audit, Build, Assets, Test, Playwright)
   │
   ▼
live-security-test (Dedicated Staging Gate, fail-closed on missing secrets)
   ├──► deploy-production (Cloudflare Pages deploy, fail-closed on missing secrets) [On push to main]
   └──► tauri-windows-build (WiX MSI & NSIS EXE Compilation, Provenance Attestation) [On tag v*.*.* or workflow_dispatch]
```

- **Fail-Closed Gate Checks:**
  - `live-security-test`: Exits with status 1 if `OHMS_TEST_SUPABASE_URL` or `OHMS_TEST_SERVICE_ROLE_KEY` is absent.
  - `deploy-production`: Exits with status 1 if `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent. Zero mock credentials allowed in production deployment.
  - `tauri-windows-build`: Exits with status 1 if real `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent. Strictly asserts tag version parity with `package.json`.
- **Permissions:** Restricted strictly to `contents: read` at top level; job-specific permissions (`contents: write`, `id-token: write`, `attestations: write`, `deployments: write`) explicitly declared.
- **Secret Redaction:** No secrets printed to console or step logs.

---

## 2. Branch Protection Status

- **Status:** **BLOCKED (Requires Repository Administrator Setup in GitHub UI)**
- **Reason:** Repository automation is authenticated via SSH deploy key (`id_ed25519_deploy`), which possesses git transfer privileges but lacks administrative GitHub REST API permissions for branch rule enforcement.
- **Required Admin Settings:**
  - Repository: `Adnin1/onnesha-hospital`
  - URL: `https://github.com/Adnin1/onnesha-hospital/settings/branches`
  - Branch Pattern: `main`
  - Required checks: `Mandatory CI (Typecheck, Lint, Audit, Build, Assets, Test, Playwright)`
  - Restrictions: Block force pushes, require PR reviews.
