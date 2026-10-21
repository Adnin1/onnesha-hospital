import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20261022110000_migration_246_harden_compatibility_table_rls_and_referral_search_path.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');

test('Migration 246 enables RLS on compatibility tables that have no client-facing workflow', () => {
  assert.match(sql, /alter table public\.ot_schedules enable row level security/);
  assert.match(sql, /alter table public\.referral_commission_claims enable row level security/);
});

test('Migration 246 removes client-role table grants and preserves service-role operations', () => {
  for (const table of ['ot_schedules', 'referral_commission_claims']) {
    assert.ok(
      sql.includes(`revoke all privileges on table public.${table} from public, anon, authenticated`),
      `PUBLIC, anon and authenticated must be revoked from ${table}`,
    );
    assert.ok(
      sql.includes(`grant all privileges on table public.${table} to service_role`),
      `trusted service processing must retain access to ${table}`,
    );
  }
});

test('Migration 246 pins search_path on the exact legacy referral SECURITY DEFINER overload', () => {
  assert.match(
    sql,
    /alter function public\.record_referral_commission_payout_atomic\( uuid, uuid, numeric, varchar, uuid, varchar, varchar, varchar \) set search_path = ''/,
  );
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
