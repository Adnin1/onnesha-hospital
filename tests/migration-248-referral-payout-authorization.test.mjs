import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20261022120000_migration_248_enforce_referral_payout_database_authorization.sql',
), 'utf8').toLowerCase().replace(/\s+/g, ' ');

test('Migration 248 adds a database-boundary authorization guard before settlement inserts', () => {
  assert.match(sql, /create or replace function public\.enforce_referral_commission_settlement_authorization\(\)/);
  assert.match(sql, /before insert on public\.referral_commission_settlements/);
  assert.match(sql, /referral\.commission\.pay/);
  assert.match(sql, /referral\.manage/);
  assert.match(sql, /from public\.user_roles/);
  assert.match(sql, /from public\.profiles/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /auth\.jwt\(\)/);
  assert.match(sql, /using errcode = '42501'/);
  assert.match(sql, /revoke all on function public\.enforce_referral_commission_settlement_authorization\(\) from public, anon, authenticated/);
});
