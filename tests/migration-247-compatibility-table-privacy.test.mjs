import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20261022113000_migration_247_revoke_client_access_from_internal_compatibility_tables.sql',
), 'utf8').toLowerCase().replace(/\s+/g, ' ');

test('Migration 247 makes unused compatibility tables internal-only', () => {
  for (const table of ['ot_schedules', 'referral_commission_claims']) {
    assert.ok(sql.includes(`revoke all privileges on table public.${table} from public, anon, authenticated`));
    assert.ok(sql.includes(`drop policy if exists ${table}_tenant_isolation on public.${table}`));
  }
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
