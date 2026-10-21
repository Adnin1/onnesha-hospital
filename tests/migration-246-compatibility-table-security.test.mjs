import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20261022110000_migration_246_enable_rls_ot_referral_and_harden_search_path.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');

test('Applied Migration 246 enables tenant RLS on the two compatibility tables', () => {
  assert.match(sql, /alter table public\.ot_schedules enable row level security/);
  assert.match(sql, /alter table public\.referral_commission_claims enable row level security/);
  assert.match(sql, /create policy ot_schedules_tenant_isolation/);
  assert.match(sql, /create policy referral_commission_claims_tenant_isolation/);
});

test('Applied Migration 246 denies anon access to compatibility tables', () => {
  for (const table of ['ot_schedules', 'referral_commission_claims']) {
    assert.ok(
      sql.includes(`revoke all privileges on table public.${table} from public, anon`),
      `PUBLIC and anon must be revoked from ${table}`,
    );
  }
});

test('Applied Migration 246 pins search_path on both referral payout SECURITY DEFINER overloads', () => {
  assert.match(
    sql,
    /alter function public\.record_referral_commission_payout_atomic\( uuid, uuid, numeric, varchar, uuid, varchar, varchar, varchar \) set search_path = ''/,
  );
  assert.match(
    sql,
    /alter function public\.record_referral_commission_payout_atomic\( uuid, uuid, numeric, varchar, uuid, numeric, numeric, varchar, varchar, varchar \) set search_path = ''/,
  );
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
