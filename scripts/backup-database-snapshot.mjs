/**
 * OHMS Application-Level Supplemental Snapshot Utility
 * 
 * IMPORTANT ARCHITECTURAL DISTINCTION:
 * 1. Migration/Schema Baseline: Version-controlled in Git (111 SQL migration files).
 * 2. Full Production Database Backups: Managed platform-level daily backups / PostgreSQL pg_dump.
 * 3. Point-in-Time Recovery (PITR): Managed continuous physical WAL-G recovery (Supabase Pro plan tier).
 * 4. This Script: Supplemental application-level selective snapshot export.
 * 
 * SECURITY MANDATE:
 * - Requires explicit, uncommitted SUPABASE_SERVICE_ROLE_KEY from external environment.
 * - NEVER falls back to public/publishable anon keys (which fail RLS and emit partial/empty data).
 * - Output files are strictly ignored by .gitignore and must NEVER be committed to Git.
 * - Sensitive patient, financial, or clinical records are never emitted to logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iuhtzahuszdkdarhxobx.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OHMS_BACKUP_SERVICE_ROLE_KEY;

const BACKUP_DIR = path.resolve('supabase', 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Canonical application tables for selective snapshot
const AUDITED_TABLES = [
  'organizations',
  'organization_settings',
  'profiles',
  'patients',
  'patient_visits',
  'doctors',
  'doctor_schedules',
  'beds',
  'admissions',
  'referral_agents',
  'referral_rate_history',
  'patient_referral_attributions',
  'invoices',
  'invoice_items',
  'payments',
  'referral_commissions',
  'referral_commission_settlements',
  'general_ledger_entries',
  'journal_entries',
  'audit_logs'
];

async function takeSelectiveSnapshot() {
  if (!SERVICE_ROLE_KEY) {
    console.error('========================================================================');
    console.error('❌ [OHMS SNAPSHOT UTILITY] AUTHENTICATION REQUIRED');
    console.error('========================================================================');
    console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required to take an');
    console.error('authorized application-level data snapshot.');
    console.error('');
    console.error('Security Enforcement:');
    console.error('• Public/publishable keys are strictly prohibited for database backups.');
    console.error('• Using public keys fails RLS boundary checks (SQLSTATE 42501).');
    console.error('• Full production disaster recovery relies on Supabase Managed Backups / PITR.');
    console.error('========================================================================');
    process.exit(1);
  }

  console.log(`[OHMS SNAPSHOT UTILITY] Connecting to Supabase Host: ${SUPABASE_URL}`);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotData = {
    metadata: {
      type: 'SUPPLEMENTAL_APPLICATION_LEVEL_SNAPSHOT',
      description: 'Selective application-level logical export. Not a substitute for managed physical backups/PITR.',
      timestamp: new Date().toISOString(),
      target_host: SUPABASE_URL,
      tables_requested: AUDITED_TABLES.length
    },
    tables: {}
  };

  let totalArchivedRows = 0;

  for (const table of AUDITED_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*');

      if (error) {
        snapshotData.tables[table] = {
          count: 0,
          status: 'ERROR',
          error_code: error.code || error.message
        };
      } else {
        const rows = data || [];
        snapshotData.tables[table] = {
          count: rows.length,
          rows: rows,
          status: 'EXPORTED'
        };
        totalArchivedRows += rows.length;
      }
    } catch (err) {
      snapshotData.tables[table] = {
        count: 0,
        status: 'EXCEPTION',
        error: err.message
      };
    }
  }

  snapshotData.metadata.total_rows = totalArchivedRows;
  const serialized = JSON.stringify(snapshotData, null, 2);
  const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  snapshotData.metadata.sha256 = sha256;

  const fileName = `ohms-snapshot-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2), 'utf-8');

  console.log(`[OHMS SNAPSHOT UTILITY] Selective snapshot saved locally to: ${fileName}`);
  console.log(`[OHMS SNAPSHOT UTILITY] SHA-256 Checksum: ${sha256}`);
  console.log(`[OHMS SNAPSHOT UTILITY] Tables Processed: ${AUDITED_TABLES.length}`);
  console.log(`[OHMS SNAPSHOT UTILITY] Total Rows Archived: ${totalArchivedRows}`);
  console.log(`[OHMS SNAPSHOT UTILITY] Status: SUCCESS (Local Uncommitted File)`);
}

takeSelectiveSnapshot().catch((err) => {
  console.error('[OHMS SNAPSHOT UTILITY] Unexpected failure:', err);
  process.exit(1);
});
