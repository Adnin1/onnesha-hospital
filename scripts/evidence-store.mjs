#!/usr/bin/env node
/**
 * OHMS HEALTH EVIDENCE STORE (Rule 28 & Rule 29)
 * Manages persistent evidence ledgers with cryptographic SHA binding and temporal expiry.
 * 
 * Expiry Windows:
 * - Current SHA + <24h evidence     --> PASS
 * - 24h - 72h evidence               --> STALE
 * - >72h or missing evidence        --> NOT_RECENTLY_VERIFIED
 * - Git SHA or Migration mismatch   --> INVALIDATED
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const EVIDENCE_FILE = path.join(ROOT, 'generated', 'health-evidence.json');

export function getCurrentGitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

export function getCurrentMigrationHead() {
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return { count: 0, latestFile: null };
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  return {
    count: files.length,
    latestFile: files[files.length - 1] || null
  };
}

export function loadEvidenceStore() {
  if (fs.existsSync(EVIDENCE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8'));
    } catch {
      return { records: [] };
    }
  }
  return { records: [] };
}

export function saveEvidenceStore(store) {
  const dir = path.dirname(EVIDENCE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function recordEvidence({
  component,
  workflow,
  level = 'L1_UNIT_INVARIANT',
  result = 'PASS',
  environment = 'LOCAL_HERMETIC',
  evidenceJson = {}
}) {
  const currentSha = getCurrentGitSha();
  const migrations = getCurrentMigrationHead();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const record = {
    id: `ev-${component.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    component: component.toUpperCase(),
    workflow,
    level,
    git_sha: currentSha,
    short_sha: currentSha.slice(0, 8),
    migration_count: migrations.count,
    migration_head: migrations.latestFile,
    environment,
    result,
    executed_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    evidence_json: evidenceJson
  };

  const store = loadEvidenceStore();
  // Filter out older records for the same component to keep store lean
  store.records = store.records.filter(r => r.component !== component.toUpperCase());
  store.records.push(record);
  store.last_updated = now.toISOString();
  saveEvidenceStore(store);

  return record;
}

export function evaluateComponentHealth(component) {
  const store = loadEvidenceStore();
  const currentSha = getCurrentGitSha();
  const migrations = getCurrentMigrationHead();
  const record = store.records.find(r => r.component === component.toUpperCase());

  if (!record) {
    return { status: 'NOT_RECENTLY_VERIFIED', reason: 'No evidence recorded' };
  }

  if (record.result === 'FAIL') {
    return { status: 'FAIL', reason: 'Test failure recorded', record };
  }

  // Check SHA match
  if (record.git_sha !== currentSha && !record.git_sha.startsWith(currentSha.slice(0, 8))) {
    return { status: 'INVALIDATED', reason: `Git SHA mismatch (record: ${record.short_sha}, current: ${currentSha.slice(0, 8)})`, record };
  }

  // Check migration head match
  if (record.migration_count !== migrations.count) {
    return { status: 'INVALIDATED', reason: `Migration count mismatch (record: ${record.migration_count}, current: ${migrations.count})`, record };
  }

  const now = Date.now();
  const executedAt = new Date(record.executed_at).getTime();
  const ageHours = (now - executedAt) / (1000 * 60 * 60);

  if (ageHours < 24) {
    return { status: 'PASS', ageHours: ageHours.toFixed(1), record };
  } else if (ageHours < 72) {
    return { status: 'STALE', ageHours: ageHours.toFixed(1), record };
  } else {
    return { status: 'NOT_RECENTLY_VERIFIED', ageHours: ageHours.toFixed(1), record };
  }
}

// CLI Execution: populate or dump evidence
if (process.argv[1] && process.argv[1].endsWith('evidence-store.mjs')) {
  console.log('🏛️  [OHMS HEALTH EVIDENCE STORE]');
  const store = loadEvidenceStore();
  console.log(`Active records: ${store.records.length} | File: ${EVIDENCE_FILE}`);
  for (const r of store.records) {
    const evalResult = evaluateComponentHealth(r.component);
    console.log(`  • ${r.component.padEnd(16)}: ${evalResult.status} [${r.level}] (Age: ${evalResult.ageHours || 0}h, SHA: ${r.short_sha})`);
  }
}
