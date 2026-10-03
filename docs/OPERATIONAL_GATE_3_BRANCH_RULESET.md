# Operational Gate 3: GitHub Main Branch Protection & Ruleset Setup

## 1. Context & Purpose
To maintain zero-compromise code quality, avoid accidental force-pushes, and enforce mandatory CI pass before any PR merges into `main`, GitHub branch rulesets must be configured.

---

## 2. Configuration Steps in GitHub

### Step 1: Open Rulesets in Repository Settings
1. Navigate to: `https://github.com/MD-SOHANUR-RAHMAN-0/onnesha-hospital/settings/rules`
2. Click **New ruleset** -> **New branch ruleset**.

### Step 2: Configure Ruleset Details
- **Ruleset Name**: `production-release-safeguard`
- **Enforcement status**: `Active`

### Step 3: Target Branches
- Under **Target branches**, click **Add target** -> **Include default branch** (targets `main`).

### Step 4: Branch Protections
Check the following checkboxes:
1. **Restrict deletions**: ON (Prevents deleting `main`).
2. **Block force pushes**: ON (Prevents history rewriting or `--force`).
3. **Require a pull request before merging**:
   - Required approvals: `1`
   - Dismiss stale pull request approvals when new commits are pushed: ON
   - Require review from Code Owners: Optional
4. **Require status checks to pass**:
   - Status checks required:
     - `Mandatory CI: Lint, Typecheck, Audit, Security Gates & Production Test Suites`
   - Require branches to be up to date before merging: ON
5. **Require signed commits**: Recommended if GPG signing is enabled.

### Step 5: Save
Click **Save changes** to enforce the ruleset immediately across the repository.
