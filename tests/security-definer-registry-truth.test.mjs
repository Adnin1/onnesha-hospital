import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const generatorPath = path.join(root, 'scripts/generate-secdef-registry.mjs');

test('SECURITY DEFINER registry parses the matching dollar-quote tag and ALTER FUNCTION path overrides', () => {
  const generator = fs.readFileSync(generatorPath, 'utf8');
  assert.match(generator, /\\k<dollarTag>/);
  assert.match(generator, /alterSearchPathRegex/);
  assert.match(generator, /search_path_last_altered_in/);
});

test('Static SECURITY DEFINER inventory never claims live ACL verification or automatic security approval', () => {
  const generator = fs.readFileSync(generatorPath, 'utf8');
  assert.match(generator, /live_catalog_status: 'NOT_QUERIED'/);
  assert.match(generator, /authorization_review_status: 'NOT_CERTIFIED'/);
  assert.match(generator, /anon_executable_count: null/);
  assert.match(generator, /mutable_search_path_count: null/);
  assert.match(generator, /MANUAL_REVIEW_REQUIRED_STATIC_SCAN_NOT_AUTHORIZATION_PROOF/);
  assert.equal(generator.includes("review_result: func.search_path.includes('EMPTY_SAFE') ? 'HARDENED_SAFE'"), false);
});

test('Generated source inventory reflects Migration 249 and labels live grants as unverified', () => {
  const result = spawnSync(process.execPath, [generatorPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const generatedPath = path.join(root, 'generated/security-definer-registry.json');
  const registry = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
  assert.equal(registry.source_scope, 'REPOSITORY_MIGRATION_STATIC_SCAN_ONLY');
  assert.equal(registry.live_catalog_status, 'NOT_QUERIED');
  assert.equal(registry.authorization_review_status, 'NOT_CERTIFIED');
  assert.equal(registry.anon_executable_count, null);
  assert.equal(registry.mutable_search_path_count, null);
  assert.ok(registry.migration_source_estimates);
  assert.ok(registry.functions.every((fn) => fn.review_result === 'MANUAL_REVIEW_REQUIRED_STATIC_SCAN_NOT_AUTHORIZATION_PROOF'));

  const payoutOverloads = registry.functions.filter((fn) => fn.name === 'record_referral_commission_payout_atomic');
  assert.equal(payoutOverloads.length, 2, 'Both compatibility and canonical overloads must be inventoried');
  for (const fn of payoutOverloads) {
    if (fn.signature.includes('numeric, numeric')) {
      assert.equal(fn.search_path, "'' (EMPTY_SAFE)", 'Canonical 10-param overload must be EMPTY_SAFE from Migration 260');
    } else {
      assert.equal(fn.search_path, 'public, auth, pg_temp', 'Compatibility overload retains search_path from Migration 249');
    }
  }

  const payoutGuard = registry.functions.find((fn) => fn.name === 'enforce_referral_commission_settlement_authorization');
  assert.ok(payoutGuard, 'Settlement authorization trigger function must be inventoried');
  assert.equal(payoutGuard.search_path, 'public, auth, pg_temp');
  assert.equal(payoutGuard.authorization_evidence.auth_uid_token_found, true);
  assert.equal(payoutGuard.authorization_evidence.permission_guard_token_found, true);
});
