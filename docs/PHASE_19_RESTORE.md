# Onnesha Hospital (OHMS) Disaster Recovery & Restore Protocol

## 1. Scope & Critical Architecture Context
A database backup restores PostgreSQL relational state, schemas, and RLS policies. However, in modern cloud architectures (like Supabase), a complete disaster recovery plan must account for all decoupled dependencies:
- **Relational Database:** 55 applied migrations, double-entry ledgers, patient records, auth schema.
- **Supabase Storage API Objects:** Physical files (diagnostic PDFs, radiology scans, staff documents) stored in cloud object buckets. *Note: Database backups do not automatically contain binary storage objects; buckets must be backed up / mirrored independently via Storage API or S3 protocol.*
- **Configuration & Secrets:** Supabase Vault / Edge Function environment variables (`SMS_API_KEY`, `SSLCOMMERZ_STORE_PASSWORD`, etc.).

---

## 2. Recovery Objectives (RTO & RPO)
- **Target RTO (Recovery Time Objective):** $< 60$ minutes for full database restoration to a new project.
- **Target RPO (Recovery Point Objective):**
  - Continuous WAL / Point-in-Time Recovery (PITR): $< 5$ minutes data loss window.
  - Automated Daily Snapshots: $< 24$ hours data loss window.

---

## 3. Non-Production Disaster Recovery Drill Protocol ("Restore to a New Project")
*CRITICAL: Never execute a verification drill by restoring over the active production instance.*

### Step 1: Trigger Non-Destructive Restore
1. Log into the **Supabase Dashboard** with repository/organization owner credentials.
2. Select the production project (`iuhtzahuszdkdarhxobx`).
3. Navigate to **Database** $\to$ **Backups** $\to$ **Scheduled Backups**.
4. Identify the latest daily snapshot or choose a PITR timestamp.
5. Click **Restore** and select **Restore to a new project**.
6. Provide a temporary staging name (e.g., `ohms-dr-drill-staging-2026`).

### Step 2: Post-Restore Verification Checklist
Once the new project boots, verify the restored database state:
- [ ] **Migration Parity:** Execute `npx supabase migration list` against the restored project to confirm all 55 migrations are present.
- [ ] **Ledger Integrity:** Run `SELECT * FROM get_trial_balance(NOW()::DATE)` to confirm zero debit/credit discrepancy.
- [ ] **RLS & Security Shielding:** Run the anonymous attack suite (`tests/security-rls-anonymous-write-attacks.test.mjs`) to verify RLS policies migrated active.
- [ ] **Row Count Auditing:** Compare row counts on key clinical and financial tables (`organizations`, `departments`, `doctors`, `invoices`, `journal_entries`).

### Step 3: Storage Bucket & Binary File Verification
1. Inspect the `storage.buckets` table in the restored instance.
2. For mission-critical file attachments, verify that file pointers in `medical_records` match objects in Supabase Storage.
3. If syncing storage files to the staging drill environment, use the Supabase S3-compatible API or `supabase storage download` script.

### Step 4: Drill Teardown & Evidence Archiving
1. Log the exact restore duration (Start time, Boot time, Verification completion time) to document actual RTO.
2. Record any drift in row count or missing assets.
3. Delete the temporary staging project (`ohms-dr-drill-staging-2026`) to eliminate unneeded infrastructure cost and prevent data duplication.
4. Archive the drill certificate in the SRE operations log.

