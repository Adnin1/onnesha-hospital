# Operational Gate 1: Supabase Privileged Key & JWT Secret Rotation

## 1. Context & Purpose
In earlier setup phases, the Supabase project privileged key or connection credentials were held in deployment configs. As required by **ISO 27001 Annex A.9** and **Supabase Production Security Hardening Guidelines**, privileged keys (`service_role` and `JWT Secret`) must undergo rotation before statutory live launch.

---

## 2. Step-by-Step Dashboard Rotation Protocol

### Step 1: Log in to Supabase Dashboard
1. Navigate to: [https://supabase.com/dashboard/project/iuhtzahuszdkdarhxobx](https://supabase.com/dashboard/project/iuhtzahuszdkdarhxobx)
2. Verify you are logged in as the project owner.

### Step 2: Rotate the JWT Secret
1. Go to **Project Settings** (Gear icon in bottom left).
2. Click **API** under the Configuration section.
3. Scroll down to **JWT Settings** -> **JWT Secret**.
4. Click **Generate a new secret** or paste a 64-character cryptographically secure token:
   - Command to generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. Confirm the rotation. This immediately invalidates all existing active tokens.

### Step 3: Copy the New `service_role` Secret
1. Under **Project API keys**, locate the newly generated `service_role` secret (marked with a red warning badge "Bypasses Row Level Security").
2. Copy this key into your secure password manager (e.g., 1Password, Bitwarden).
3. **DO NOT** commit this key to Git or expose it in client-side code.

### Step 4: Update Production Cloudflare Pages Environment Variables
1. Navigate to Cloudflare Dashboard -> **Workers & Pages** -> **onnesha-hospital** -> **Settings** -> **Environment variables**.
2. Locate `SUPABASE_SERVICE_ROLE_KEY`.
3. Click **Edit variables**, paste the new rotated secret, and click **Save and deploy**.

### Step 5: Update Local `.env.local`
1. Update `SUPABASE_SERVICE_ROLE_KEY` in local `.env.local` for administrative scripts.
2. Run health check to verify connectivity:
   ```bash
   npm run health:check
   ```
