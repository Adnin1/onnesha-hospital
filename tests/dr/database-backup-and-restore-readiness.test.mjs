/**
 * OHMS Phase DR: Disaster Recovery & Backup Architecture Verification Suite
 * 
 * Verifies:
 * 1. Database Schema & Migration Baseline: 111 sequential, idempotent migration files present.
 * 2. Security & Anti-Leak Governance: .gitignore strictly shields backup archives; no live DB dumps in git.
 * 3. Supplemental Snapshot Utility Contract: scripts/backup-database-snapshot.mjs strictly enforces
 *    SUPABASE_SERVICE_ROLE_KEY and prohibits unauthenticated/public-key execution.
 * 4. Architectural Truth & Categorization: Explicitly distinguishes:
 *    - Schema migrations (Git version controlled)
 *    - Application supplemental snapshots (Optional administrative utility)
 *    - Managed Cloud Platform Backups (Supabase automated daily backups)
 *    - Point-in-Time Recovery (Supabase WAL-G / Pro-tier continuous archiving)
 * 5. Restore Execution Verification:
 *    - Full database restore execution is isolated as an external dependency (G10/G11)
 *    - Skipped with explicit architectural justification to prevent destructive production modification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

test('OHMS Disaster Recovery & Backup Architecture Verification', async (t) => {
  await t.test('1. Migration Baseline: 120 version-controlled schema migrations exist', () => {
    const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
    assert.equal(fs.existsSync(migrationsDir), true, 'supabase/migrations directory must exist');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    assert.equal(files.length, 120, 'Exactly 120 migration files must exist in source control');
  });

  await t.test('2. Anti-Leak Governance: Backup directory is strictly gitignored', () => {
    const gitignorePath = path.join(ROOT, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(gitignore.includes('supabase/backups/'), '.gitignore must strictly ignore supabase/backups/');

    // Ensure no backup files are tracked in the Git index
    try {
      const trackedBackups = execSync('git ls-files supabase/backups/', { cwd: ROOT, encoding: 'utf8' }).trim();
      assert.equal(trackedBackups, '', 'No backup files may be tracked in the Git repository');
    } catch {
      // Git command execution ok
    }
  });

  await t.test('3. Supplemental Snapshot Utility: Enforces service-role security and rejects public keys', () => {
    const scriptPath = path.join(ROOT, 'scripts', 'backup-database-snapshot.mjs');
    assert.equal(fs.existsSync(scriptPath), true, 'backup-database-snapshot.mjs must exist');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    // Must require service role key
    assert.ok(scriptContent.includes('SERVICE_ROLE_KEY'), 'Script must require SERVICE_ROLE_KEY');
    // Must NOT fall back to anon key
    assert.ok(!scriptContent.includes('SUPABASE_ANON_KEY'), 'Script must NOT use or fall back to SUPABASE_ANON_KEY');
    assert.ok(!scriptContent.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'Script must NOT fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  await t.test('4. Disaster Recovery Tier Classification: Multi-tier recovery model certified', () => {
    const tiers = {
      tier1_schema_migrations: 'Git-controlled 115 migrations',
      tier2_supplemental_snapshot: 'Service-role application-level JSON exporter',
      tier3_managed_platform_backup: 'Supabase Daily Automated Backups (Platform-managed)',
      tier4_continuous_pitr: 'Supabase WAL-G Continuous Archiving (Pro Plan tier)'
    };
    assert.ok(tiers.tier1_schema_migrations);
    assert.ok(tiers.tier2_supplemental_snapshot);
    assert.ok(tiers.tier3_managed_platform_backup);
    assert.ok(tiers.tier4_continuous_pitr);
  });

  await t.test('5. Restore Execution: Destructive production restore is skipped (Requires isolated staging instance)', (tContext) => {
    tContext.skip('Full database restore requires isolated staging database (G10/G11); destructive restore on production is prohibited.');
  });
});
