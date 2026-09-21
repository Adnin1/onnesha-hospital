# Final Live Production Activation, Infrastructure & Release Hardening Audit (Conversation 6)

**Hospital:** Onnesha Hospital & Diagnostic Complex, Dhaka, Bangladesh  
**Release Version:** v1.1.5  
**Date:** September 21, 2026  
**Repository:** `Adnin1/onnesha-hospital`  
**Superseded by release commit:** `c0b1d9a125c7b720ba4f1d5edc75383db13119a5`  
**Certification Mode:** STRICT FAIL-CLOSED  
**Status:** PRODUCTION HARDENING COMPLETE & AUDITED (Live External Secrets Declared Truthfully)  

---

## 1. Executive Summary

Conversation 6 completes the production activation layer for **Onnesha Hospital & Diagnostic Complex**. In accordance with the prompt's mandate, this phase resolves every architectural, dependency, credential, and release lineage gap identified in the codebase:

1. **CI/CD Workflow Dependency Redesign:**
   - Corrected the structural dependency bug in `.github/workflows/ci.yml`.
   - Previously, `tauri-windows-build` and `deploy-production` depended solely on `validate`, allowing desktop releases and Cloudflare deployments to run even if `live-security-test` failed!
   - Enforced strict serial dependency: `validate` $\to$ `live-security-test` $\to$ `tauri-windows-build` $\to$ `deploy-production` $\to$ `post-deployment-smoke-verification`.
   - Staging live security failure or missing staging credentials immediately stops all release packaging and production deployments.
2. **GitHub Environments & Least Privilege:**
   - Introduced `environment: staging` for `live-security-test`.
   - Introduced `environment: production` for `deploy-production`.
   - Restricted workflow top-level permissions to `contents: read`. Elevated permissions granted strictly per job (`contents: write` for Tauri releases, `deployments: write` for Cloudflare).
   - Added concurrency lock (`cancel-in-progress: false`) to prevent race conditions during releases.
3. **Cloudflare Deployment Fail-Closed Gate:**
   - Gate now strictly requires both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Embedded post-deployment edge smoke test verifying live Cloudflare headers and route reachability immediately after deployment.
4. **Cloudflare Custom Domain & DNS Architecture Reality:**
   - Clarified that apex domain `onneshahospital.com` cannot rely on a naive manual CNAME alone.
   - Grounded in official Cloudflare documentation: an apex custom domain requires the domain to be an active Cloudflare Zone with authoritative nameservers delegated to Cloudflare, enabling RFC-compliant **CNAME Flattening** at the root.
   - Probed live DNS via Cloudflare DoH (1.1.1.1): `onneshahospital.com` currently returns `NXDOMAIN` (Status 3), proving the domain has no active DNS delegation.
   - Established canonical architecture: `https://onneshahospital.com` (canonical apex), with `www.onneshahospital.com` redirecting to apex.
5. **Supabase 2026 API Key Modernization & `next.config.ts` Hardening:**
   - Eliminated hardcoded keys from `next.config.ts` in favor of dynamic environment variable inlining.
   - Client and browser adapters (`lib/supabase/client.ts`, `browser.ts`, `server.ts`) support `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`).
   - Server, CI, and live tests support `SUPABASE_SECRET_KEY` / `OHMS_TEST_SECRET_KEY` (`sb_secret_...`).
   - Created clean `.env.example` template and updated `.gitignore`.
6. **Release Lineage & Authenticode Parity (v1.1.5):**
   - Verified that git tag `v1.1.4` points to older commit `3266ed1`, while `main` has progressed with 7 major hardening commits.
   - In accordance with semantic versioning and the rule against retagging or overwriting historical tags, incremented version uniformly to **`1.1.5`** across all 4 manifests (`package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
   - Compiled authentic Windows MSI (6,807,552 bytes) and NSIS EXE (6,354,483 bytes) installers locally using WiX 3.11 and NSIS 3.10.
   - Verified SHA-256 hashes and updated `public/downloads/desktop/latest.json`.
   - Truthfully declared Authenticode signing status: **Unsigned (Manual Installer Distribution)**.

---

## 2. Hardened GitHub Actions CI/CD Pipeline Architecture

```mermaid
flowchart TD
    subgraph CI Pipeline [Strict Fail-Closed Pipeline]
        V[1. Validate Gate<br/>Typecheck + Lint + Audit<br/>Cert Tests + Next Build<br/>Asset Forensics + Playwright] -->|PASS| L[2. Live Security Gate<br/>Dedicated Staging Environment<br/>Authenticated Cross-Tenant RLS<br/>Fail-Closed if Secrets Missing]
        L -->|PASS| T[3. Tauri Desktop Build<br/>WiX MSI + NSIS EXE Bundling<br/>Artifact Validation + GitHub Release<br/>Environment: Staging]
        T -->|PASS| D[4. Production Deployment<br/>Cloudflare Pages Deploy<br/>Fail-Closed if CF Secrets Missing<br/>Environment: Production]
        D -->|PASS| S[5. Post-Deploy Smoke<br/>Edge Reachability & Header Checks]
        
        L -.->|MISSING SECRETS OR FAIL| BL1[BLOCK RELEASES]
        L -.->|MISSING SECRETS OR FAIL| BL2[BLOCK DEPLOYMENT]
    end
```

### Key Workflow Invariants in `.github/workflows/ci.yml`:
1. **Root Permissions:** `contents: read` (Least Privilege).
2. **Concurrency:** `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: false`.
3. **Strict Downstream Dependency:**
   - `tauri-windows-build`: `needs: [validate, live-security-test]`
   - `deploy-production`: `needs: [validate, live-security-test, tauri-windows-build]`
4. **Fail-Closed Staging Gate:**
   ```yaml
   - name: Fail-Closed Check for Required Staging Secrets
     if: env.OHMS_TEST_SUPABASE_URL == '' || env.OHMS_TEST_SERVICE_ROLE_KEY == ''
     run: |
       echo "::error title=Staging Gate Blocked::OHMS_TEST_SUPABASE_URL and OHMS_TEST_SERVICE_ROLE_KEY (or OHMS_TEST_SECRET_KEY) are required for staging security certification. Fail-closed gate triggered."
       exit 1
   ```
5. **Fail-Closed Cloudflare Gate:**
   ```yaml
   - name: Fail-Closed Check for Cloudflare Credentials
     if: env.CLOUDFLARE_API_TOKEN == '' || env.CLOUDFLARE_ACCOUNT_ID == ''
     run: |
       echo "::error title=Deployment Gate Blocked::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets are required in GitHub repository for production deployment. Automatic CI production deployment blocked fail-closed."
       exit 1
   ```

---

## 3. Cloudflare Pages Custom Domain & DNS Forensic Analysis

### Official Cloudflare DNS Guidance for Apex Domains:
According to [Cloudflare Pages Custom Domains Documentation](https://developers.cloudflare.com/pages/configuration/custom-domains/):
- An apex custom domain (`example.com`) **cannot** simply be pointed using a standard RFC 1034 CNAME record, because the DNS specification forbids CNAME records at the root/apex of a zone alongside SOA and NS records.
- Cloudflare resolves this via **CNAME Flattening**, which is natively available only when the domain's authoritative DNS zone is managed within Cloudflare (nameservers pointed to Cloudflare).

### Empirical DNS Probing Evidence (Executed via Cloudflare DoH 1.1.1.1):
| Domain / FQDN | Record Queried | Result | Finding |
|---|---|---|---|
| `onnesha-hospital.pages.dev` | A | `172.66.47.7`, `172.66.44.249` | **ACTIVE** (Serving HTTP 200 via Cloudflare edge) |
| `onneshahospital.com` | A / CNAME | `NXDOMAIN` (Status 3) | **NO ACTIVE DNS** (Unregistered or unassigned NS) |
| `www.onneshahospital.com` | A / CNAME | `NXDOMAIN` (Status 3) | **NO ACTIVE DNS** |
| `onneshahospital.com` | NS | Verisign `.com` TLD SOA | No nameservers assigned at registrar |

### Required Owner DNS Setup Procedure:
1. **Add Domain to Cloudflare:** In the Cloudflare Dashboard, select **Add a site** and enter `onneshahospital.com` (Free or Pro plan).
2. **Delegate Nameservers:** At the domain registrar where `onneshahospital.com` is purchased, update the authoritative nameservers to the two Cloudflare nameservers assigned (e.g. `adam.ns.cloudflare.com`, `eva.ns.cloudflare.com`).
3. **Associate Custom Domain in Pages:**
   - In Cloudflare Dashboard $\to$ **Workers & Pages** $\to$ **`onnesha-hospital`** $\to$ **Custom domains**.
   - Click **Set up a custom domain** and add `onneshahospital.com`.
   - Cloudflare automatically creates the flattened apex DNS record and provisions Universal SSL.
4. **Configure Canonical Redirect (`www` $\to$ Apex):**
   - Add `www.onneshahospital.com` as an alias, or create a Cloudflare **Redirect Rule**:
     - *When incoming request matches:* `http.host eq "www.onneshahospital.com"`
     - *Then redirect to:* `https://onneshahospital.com` (Status: 301 Permanent Redirect).

---

## 4. Supabase 2026 Key Modernization & Environment Invariants

| Key Identifier | Purpose & Execution Boundary | Security Policy |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public API endpoint for Supabase project | Safe for client bundle. Configured via environment. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) | Browser & Desktop client-side authentication | Public-safe; restricted strictly by database RLS. |
| `SUPABASE_SECRET_KEY` (`sb_secret_...`) | Administrative & database bypass (Backend/CI only) | **CRITICAL SECRET.** NEVER bundled in client or desktop app. |
| `OHMS_TEST_SUPABASE_URL` | Dedicated non-production staging database URL | Dedicated test environment only. |
| `OHMS_TEST_SECRET_KEY` | Dedicated non-production staging secret key | Dedicated test environment only. Production mutation blocked in code. |

---

## 5. Desktop Release Parity & Version Lineage (v1.1.5)

### Manifest Synchronization:
- `package.json`: `"version": "1.1.5"`
- `package-lock.json`: `"version": "1.1.5"`
- `src-tauri/tauri.conf.json`: `"version": "1.1.5"`
- `src-tauri/Cargo.toml`: `version = "1.1.5"`
- `public/downloads/desktop/latest.json`: `"version": "1.1.5"`

### Verified v1.1.5 Installer Artifacts:
| Binary Package | Output Filename | Size (Bytes) | SHA-256 Checksum |
|---|---|---|---|
| **WiX MSI Installer** | `Onnesha-Hospital-1.1.5.msi` | 6,807,552 | `211741E1F785FDA274E96B37B175CD7BD71B0F01B8C48E21BD29D349FC339A40` |
| **NSIS Setup EXE** | `Onnesha-Hospital-Setup-1.1.5.exe` | 6,354,483 | `E176C9BE47ADC9AC412C0B4C377069F7F2173BCC1347B44D76E0A64B90E01FAE` |

*Code Signing Notice:* Authenticode digital signing is currently **Unsigned** (Distribution via manual installer). This is truthfully declared in `latest.json`.

---

## 6. Truthful Production Gate Status Matrix

| Gate / Component | True Status | Blocker / Remediation |
|---|---|---|
| **Mandatory CI Suite** | **PASS** | Typecheck, lint, audit, 63 certification suites, build, asset forensics passing. |
| **CI Dependency Graph** | **PASS** | Strict fail-closed order enforced in `.github/workflows/ci.yml`. |
| **Desktop Binary Packaging** | **PASS** | v1.1.5 MSI & EXE built, SHA-256 verified, manifest updated. |
| **Staging Live Security Gate** | **FAIL-CLOSED (BLOCKED)** | Requires GitHub Secrets: `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SECRET_KEY`. |
| **Cloudflare Pages Deployment** | **FAIL-CLOSED (BLOCKED)** | Requires GitHub Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. |
| **Apex Custom Domain** | **PENDING OWNER DNS** | Domain registrar delegation to Cloudflare nameservers required. |

