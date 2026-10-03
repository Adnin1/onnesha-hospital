# Operational Gate 2: GitHub Actions Staging Secrets Configuration

## 1. Context & Purpose
In the GitHub CI/CD workflow (`.github/workflows/production-pipeline.yml`), the `staging-live-security-gate` job performs black-box and grey-box security scans against a live staging Supabase instance.
Because production secrets are strictly barred from GitHub repository variables, the staging gate fails closed unless repository secrets `OHMS_TEST_SUPABASE_URL` and `OHMS_TEST_SERVICE_ROLE_KEY` are provided.

---

## 2. Setting Up GitHub Actions Staging Secrets

### Step 1: Open GitHub Repository Settings
1. Navigate to: `https://github.com/MD-SOHANUR-RAHMAN-0/onnesha-hospital/settings/secrets/actions`
2. Under **Repository secrets**, click **New repository secret**.

### Step 2: Add Staging Environment Secrets

1. **Secret 1: `OHMS_TEST_SUPABASE_URL`**
   - Value: URL of your Supabase staging or branch project (e.g., `https://iuhtzahuszdkdarhxobx.supabase.co` or a dedicated test branch instance).

2. **Secret 2: `OHMS_TEST_SERVICE_ROLE_KEY`**
   - Value: Service role secret key of the staging/test instance.

3. **Secret 3: `CLOUDFLARE_API_TOKEN` (Optional for CI automated deploy)**
   - Value: Cloudflare API token with `Cloudflare Pages:Edit` permissions.

4. **Secret 4: `CLOUDFLARE_ACCOUNT_ID`**
   - Value: Cloudflare Account ID from your dashboard.

---

## 3. Verifying the Pipeline
Once secrets are added:
1. Re-run the latest GitHub Actions workflow run, or push a commit.
2. The `staging-live-security-gate` job will transition from skipped/fail-closed to green, enabling automated Tauri desktop release builds and automated Cloudflare deployments.
