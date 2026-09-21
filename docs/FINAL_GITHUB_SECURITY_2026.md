# OHMS ERP: GitHub Production Security & CI/CD Verification (2026)

**Repository:** `Adnin1/onnesha-hospital`  
**Pipeline File:** `.github/workflows/ci.yml`  
**Verification Date:** September 22, 2026  
**Auditor Mode:** GitHub Security & DevSecOps Engineer  

---

## 1. CI/CD Pipeline Architecture & Fail-Closed Gate Invariants

```
validate (Typecheck, Lint, Audit, Test, Build, Forensics, Playwright)
   │
   ▼
live-security-test (Dedicated Staging Gate, fail-closed on missing secrets)
   │
   ▼
tauri-windows-build (WiX MSI & NSIS EXE Compilation, Provenance Attestation)
   │
   ▼
deploy-production (Cloudflare Pages deploy, fail-closed on missing secrets)
```

- **Fail-Closed Gate Checks:**
  - `live-security-test`: Exits with status 1 if `OHMS_TEST_SUPABASE_URL` or `OHMS_TEST_SERVICE_ROLE_KEY` is absent.
  - `deploy-production`: Exits with status 1 if `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is absent.
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
  - Required checks: `Mandatory CI (Typecheck, Lint, Audit, Test, Build, Playwright)`
  - Restrictions: Block force pushes, require PR reviews.
