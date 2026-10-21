#!/usr/bin/env node
/**
 * =====================================================================================
 * OHMS Change Impact Map Engine (Phase 42)
 * =====================================================================================
 * Analyzes modified files, schemas, or actions and computes blast radius:
 * changed file → table → RPC → server action → route → workflow → required tests.
 * Prevents untested code releases by identifying required test suites automatically.
 * =====================================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const CONTRACTS_PATH = path.join(ROOT, 'config', 'component-contracts.json');

function getChangedFiles(base = 'HEAD~1') {
  try {
    const output = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: 'utf8' });
    return output.split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function computeChangeImpact(changedFiles = []) {
  if (!fs.existsSync(CONTRACTS_PATH)) {
    console.error('❌ config/component-contracts.json not found!');
    return null;
  }

  const contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
  const components = contracts.components;

  const files = changedFiles.length > 0 ? changedFiles : getChangedFiles();
  console.log(`🗺️  [CHANGE IMPACT MAP] Analyzing ${files.length} changed files...`);

  const affectedComponents = new Set();
  const requiredTests = new Set();
  const affectedTables = new Set();
  const affectedRpcs = new Set();

  for (const file of files) {
    const lower = file.toLowerCase();

    // Map by folder / file path
    for (const [name, contract] of Object.entries(components)) {
      const matchModule = lower.includes(name.toLowerCase().replace(/\s+/g, '-')) ||
                          lower.includes(name.toLowerCase());
      
      const matchTable = contract.tables.some(t => lower.includes(t));
      const matchRoute = contract.routes.some(r => lower.includes(r.replace(/^\//, '')));

      if (matchModule || matchTable || matchRoute) {
        affectedComponents.add(name);
        contract.tables.forEach(t => affectedTables.add(t));
        contract.rpcs.forEach(r => affectedRpcs.add(r));
        contract.required_tests.forEach(testFile => requiredTests.add(testFile));
      }
    }
  }

  // If core infrastructure / schema changed, add all tests
  const isCoreChange = files.some(f => 
    f.startsWith('supabase/migrations') || 
    f.startsWith('lib/permissions.ts') || 
    f.startsWith('lib/auth') || 
    f === 'package.json'
  );

  if (isCoreChange || affectedComponents.size === 0) {
    requiredTests.add('tests/hospital-domain-invariants.test.mjs');
    requiredTests.add('tests/database-schema-contracts.test.mjs');
    requiredTests.add('tests/multi-tenant-security-matrix.test.mjs');
    requiredTests.add('tests/rbac-matrix-invariants.test.mjs');
  }

  const result = {
    changed_files: files,
    affected_components: Array.from(affectedComponents),
    affected_tables: Array.from(affectedTables),
    affected_rpcs: Array.from(affectedRpcs),
    required_tests: Array.from(requiredTests)
  };

  console.log(`   Affected Modules: ${result.affected_components.join(', ') || 'None (Default Core Scope)'}`);
  console.log(`   Required Tests:   ${result.required_tests.join(', ')}`);
  return result;
}

if (process.argv[1].endsWith('change-impact-map.mjs')) {
  computeChangeImpact();
}
