import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const monitor = fs.readFileSync(path.join(root, 'scripts/component-truth-monitor.mjs'), 'utf8');
const scheduled = fs.readFileSync(path.join(root, 'scripts/scheduled-health-check.mjs'), 'utf8');

test('Component truth monitor only accepts CI from the exact current SHA and CI workflow', () => {
  assert.match(monitor, /actions\/runs\?branch=main&per_page=100/);
  assert.match(monitor, /run\.name === 'OHMS CI Quality, Security & Desktop Pipeline'/);
  assert.match(monitor, /run\.head_sha === gitHead/);
  assert.doesNotMatch(monitor, /else if \(ciConclusion === 'success'\)\s*\{\s*ciEvaluation = 'PREVIOUS_HEAD_PASS'/);
});

test('Local migration filenames cannot be presented as live database migration parity', () => {
  assert.match(monitor, /NOT_VERIFIED_REMOTE_CATALOG/);
  assert.doesNotMatch(monitor, /migrationCount >= 240 \? 'PASS' : 'FAIL'/);
  assert.match(monitor, /remote catalog was not queried/);
});

test('A reachable old deployment is not silently counted as current runtime provenance PASS', () => {
  assert.match(monitor, /RUNTIME_PROVENANCE/);
  assert.match(monitor, /runtimeProvenanceEvaluation/);
  assert.match(monitor, /if \(c\.status === 'PASS'\)/);
  assert.doesNotMatch(monitor, /c\.status === 'PASS' \|\| c\.status === 'PREVIOUS_HEAD_PASS'/);
});

test('Privileged role-permission query failures fail closed instead of being labeled healthy', () => {
  assert.match(scheduled, /ROLE_PERMISSION_QUERY_FAILED/);
  assert.match(scheduled, /ROLE_PERMISSION_QUERY_EXCEPTION/);
  assert.match(scheduled, /status: "RBAC_INTEGRITY_FAILED"/);
  assert.doesNotMatch(scheduled, /return \{ ok: true, note: "Non-privileged or RLS restricted query" \}/);
});

test('Scheduled monitor verifies the actual deployed SHA and never substitutes repo SHA for runtime SHA', () => {
  assert.match(scheduled, /async function checkRuntimeProvenance\(\)/);
  assert.match(scheduled, /runtimeProvenance\.status !== "MATCH"/);
  assert.match(scheduled, /runtime_sha: runtimeProvenance\.runtime_sha \|\| "UNKNOWN"/);
  assert.match(scheduled, /database_migration_head: dbMigrationHead/);
  assert.match(scheduled, /NOT_VERIFIED_BY_THIS_PROBE/);
  assert.doesNotMatch(scheduled, /runtime_sha: process\.env\.PRODUCTION_RUNTIME_SHA \|\| repoSha/);
});
