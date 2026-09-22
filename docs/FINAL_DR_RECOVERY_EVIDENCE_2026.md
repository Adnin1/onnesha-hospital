# Onnesha Hospital Management System (OHMS v1.1.5)
## Final Disaster Recovery (DR) & Business Continuity Evidence (2026)

**Document ID:** `DOC-DR-EVIDENCE-2026`  
**Evaluation Date:** September 22, 2026  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. Multi-Tier Disaster Recovery Architecture

Hospital systems must survive catastrophic database corruption, regional cloud provider outages, or accidental administrative deletion. Disaster recovery is segmented across all architectural tiers:

| Infrastructure Tier | Recovery Mechanism | Storage Location | Retention / RPO | Recovery Procedure |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Managed WAL-G continuous physical archiving & daily snapshots (`walg_enabled: true`) | Multi-region AWS/GCP storage | **RPO < 5 Minutes**<br/>30-Day PITR window | Supabase Console $\rightarrow$ Project Settings $\rightarrow$ Database $\rightarrow$ Backups $\rightarrow$ Restore Point-in-Time. |
| **Storage Objects** | Medical files, prescriptions, and lab attachments | Supabase Storage (Private S3 buckets) | Real-time object versioning | Replicated independently of database snapshots. Restore via S3 bucket sync. |
| **Auth & User Accounts** | Supabase Auth (`auth.users` & identities) | Managed Auth cluster | Point-in-Time with DB | Restored automatically alongside physical database snapshot. |
| **Edge Functions & API** | TypeScript Deno Edge Functions | Git repository (`supabase/functions`) | Git commit history | Redeployed via `npx supabase functions deploy`. |
| **Frontend & Edge Hosting** | Next.js Static Export on Cloudflare Pages | Cloudflare Global Anycast Edge | Immutable deployment history | Instant rollback via Cloudflare Pages deployment rollbacks. |
| **Database Migrations** | 58 declarative SQL migrations | Git repository (`supabase/migrations`) | Git commit history | Applied via `npx supabase db push`. |

---

## 2. Disaster Recovery Metrics & Target Verification

- **Recovery Point Objective (RPO):** $< 5\text{ minutes}$
  - Grounded in active WAL-G continuous log shipping. Transaction loss in an unplanned failure is bounded by the last WAL file segment flush ($< 5\text{ minutes}$).
- **Recovery Time Objective (RTO):** $< 1\text{ hour}$
  - Estimated time to provision a new database instance from snapshot, verify data integrity with automated test suite, and update frontend connection strings.

---

## 3. Physical Restore Drill Status

- **Status:** **BLOCKED (Owner Action Required)**
- **Rationale:** While managed WAL-G continuous backups are active on the remote database (`iuhtzahuszdkdarhxobx`), an empirical end-to-end restore drill ("Restore to a new project") requires administrative access to the Supabase Cloud Console.
- **Owner Verification Step:**
  1. Navigate to **Supabase Dashboard** $\rightarrow$ **Database** $\rightarrow$ **Backups**.
  2. Select the latest backup or choose a PITR timestamp.
  3. Click **Restore to a new project** (staging project).
  4. Once provisioned, execute `npm run test:certification` targeting the restored staging database to empirically verify table row counts, trial balance balancing, and 3-way match invariants.
