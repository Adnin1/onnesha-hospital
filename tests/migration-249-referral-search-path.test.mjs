import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20261022123000_migration_249_fix_referral_fixed_search_path_auth_schema.sql',
), 'utf8').toLowerCase().replace(/\s+/g, ' ');

test('Migration 249 keeps referral SECURITY DEFINER functions on an explicit trusted search_path', () => {
  assert.equal(
    (sql.match(/set search_path = public, auth, pg_temp/g) || []).length,
    3,
    'both payout overloads and the authorization trigger must include public, auth, pg_temp',
  );
  assert.doesNotMatch(sql, /set search_path = public, pg_temp/);
});
