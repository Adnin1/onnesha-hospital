#!/usr/bin/env node
/**
 * =====================================================================================
 * OHMS COMPONENT TRUTH HEALTH MONITOR (Rule 2 & Rule 28 — Zero False-Green)
 * =====================================================================================
 * Evaluates component-level operational health using live execution telemetry.
 * Tracks distinct software and operational components with explicit test levels:
 * - L1_UNIT_INVARIANT: Pure domain math / invariants (no DB)
 * - L2_STATIC_CONTRACT: AST / Schema / Code contracts
 * - L3_REAL_DATABASE_INTEGRATION: Live PostgREST / RPC contracts
 * - L4_REAL_SYNTHETIC_WORKFLOW: Full multi-role hospital journey (staging)
 * - L5_PRODUCTION_READ_ONLY: Edge reachability & read-only probes
 * =====================================================================================
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { recordEvidence, evaluateComponentHealth } from './evidence-store.mjs';

const ROOT = process.cwd();

function runNodeTest(testPath) {
  try {
    const res = spawnSync(process.execPath, ['--no-warnings', '--test', testPath], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 15000,
    });
    return {
      status: res.status === 0 ? 'PASS' : 'FAIL',
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      exitCode: res.status,
    };
  } catch (err) {
    return { status: 'FAIL', stdout: '', stderr: err.message, exitCode: -1 };
  }
}

async function runComponentTruth() {
  console.log('🏥 [OHMS COMPONENT TRUTH MONITOR] Running Multi-Level Telemetry & Evidence Verification...\n');

  // 1. Git HEAD SHA
  let gitHead = 'UNKNOWN';
  try {
    gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    gitHead = 'ERROR';
  }

  // 2. GitHub Actions CI Telemetry
  let ciRunNumber = null;
  let ciStatus = 'UNKNOWN';
  let ciConclusion = null;
  let ciHeadSha = null;
  try {
    const res = await fetch('https://api.github.com/repos/Adnin1/onnesha-hospital/actions/runs?branch=main&per_page=100', {
      headers: { 'User-Agent': 'OHMS-Truth-Monitor' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      const ciRuns = (data.workflow_runs || []).filter(
        (run) => run.name === 'OHMS CI Quality, Security & Desktop Pipeline',
      );
      // Only CI for the exact checked-out SHA can certify this checkout.
      const exactShaRun = ciRuns.find((run) => run.head_sha === gitHead);
      if (exactShaRun) {
        ciRunNumber = exactShaRun.run_number;
        ciStatus = exactShaRun.status;
        ciConclusion = exactShaRun.conclusion;
        ciHeadSha = exactShaRun.head_sha;
      } else {
        const previous = ciRuns[0];
        ciRunNumber = previous?.run_number ?? null;
        ciStatus = 'NO_CURRENT_SHA_RUN';
        ciConclusion = previous?.conclusion ?? null;
        ciHeadSha = previous?.head_sha ?? null;
      }
    }
  } catch {
    ciStatus = 'FETCH_TIMEOUT';
  }

  let ciEvaluation = 'PENDING_NEW_COMMIT';
  if (ciHeadSha === gitHead) {
    if (ciConclusion === 'success') {
      ciEvaluation = 'PASS';
    } else if (ciStatus === 'in_progress' || ciStatus === 'queued' || ciStatus === 'pending') {
      ciEvaluation = 'IN_PROGRESS';
    } else {
      ciEvaluation = 'FAIL';
    }
  }

  // 3. Database Migration Catalog Verification
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    : [];
  const migrationCount = migrationFiles.length;
  // Local migration filenames are not evidence of the live database catalog.
  const databaseEvaluation = 'NOT_VERIFIED_REMOTE_CATALOG';

  // 4. Live Edge Check (https://onnesha-hospital.pages.dev)
  let edgeEvaluation = 'FAIL';
  let edgeDetails = '';
  let runtimeProvenanceEvaluation = 'NOT_VERIFIED';
  try {
    const versionRes = await fetch('https://onnesha-hospital.pages.dev/version.json', {
      signal: AbortSignal.timeout(5000),
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (versionRes.ok) {
      const verData = await versionRes.json();
      edgeEvaluation = 'PASS';
      edgeDetails = `v${verData.version} (${verData.short_sha})`;
      runtimeProvenanceEvaluation =
        (verData.short_sha === gitHead.slice(0, 8) || verData.git_sha === gitHead)
          ? 'PASS'
          : 'MISMATCH';
    } else {
      const rootRes = await fetch('https://onnesha-hospital.pages.dev', {
        signal: AbortSignal.timeout(5000),
      });
      if (rootRes.status === 200) {
        edgeEvaluation = 'PASS';
        edgeDetails = 'HTTP 200; version.json unavailable';
      }
    }
  } catch {
    edgeEvaluation = 'FAIL';
    edgeDetails = 'Connection timeout';
  }

  // 5. RPC Registry Verification
  let rpcRegistryEvaluation = 'FAIL';
  try {
    const rpcRes = spawnSync(process.execPath, ['scripts/generate-rpc-registry.mjs'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    if (rpcRes.status === 0) {
      const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'generated', 'rpc-registry.json'), 'utf8'));
      rpcRegistryEvaluation = reg.critical_rpc_overload_count === 0 ? 'PASS' : 'FAIL';
    }
  } catch {
    rpcRegistryEvaluation = 'FAIL';
  }

  // 6. Dynamic Execution of 13 Core Domain Invariants (L1)
  const invariantsResult = runNodeTest('tests/hospital-domain-invariants.test.mjs');
  const invariantOutput = invariantsResult.stdout;

  function parseInvariant(pattern) {
    if (invariantsResult.status !== 'PASS') return 'FAIL';
    return invariantOutput.includes(pattern) ? 'PASS' : 'FAIL';
  }

  const regPass = parseInvariant('Canary 1: REGISTRATION');
  const opdPass = parseInvariant('Canary 2: APPOINTMENT & OPD');
  const rxPass = parseInvariant('Canary 3: PRESCRIPTION');
  const ipdPass = parseInvariant('Canary 4: IPD');
  const diagPass = parseInvariant('Canary 5: DIAGNOSTICS & LAB');
  const billPass = parseInvariant('Canary 6: BILLING');
  const expPass = parseInvariant('Canary 7: EXPENSE & GL');
  const refPass = parseInvariant('Canary 8: REFERRAL');
  const bbPass = parseInvariant('Canary 9: BLOOD BANK');
  const pharmPass = parseInvariant('Canary 10: PHARMACY');
  const hrPass = parseInvariant('Canary 11: HR & PAYROLL');
  const procPass = parseInvariant('Canary 12: PROCUREMENT');

  // Record evidence
  recordEvidence({ component: 'REGISTRATION', workflow: 'phone_normalization', level: 'L1_UNIT_INVARIANT', result: regPass });
  recordEvidence({ component: 'OPD', workflow: 'queue_state_machine', level: 'L1_UNIT_INVARIANT', result: opdPass });
  recordEvidence({ component: 'PRESCRIPTION', workflow: 'take_home_schedule', level: 'L1_UNIT_INVARIANT', result: rxPass });
  recordEvidence({ component: 'IPD', workflow: 'bed_cabin_dual_vacancy', level: 'L1_UNIT_INVARIANT', result: ipdPass });
  recordEvidence({ component: 'DIAGNOSTICS', workflow: 'critical_limit_boundaries', level: 'L1_UNIT_INVARIANT', result: diagPass });
  recordEvidence({ component: 'LAB', workflow: 'order_accessioning', level: 'L1_UNIT_INVARIANT', result: diagPass });
  recordEvidence({ component: 'BILLING', workflow: 'line_item_math', level: 'L1_UNIT_INVARIANT', result: billPass });
  recordEvidence({ component: 'FINANCE', workflow: 'double_entry_equality', level: 'L1_UNIT_INVARIANT', result: expPass });
  recordEvidence({ component: 'EXPENSE', workflow: 'gl_synchronization', level: 'L1_UNIT_INVARIANT', result: expPass });
  recordEvidence({ component: 'REFERRAL', workflow: 'commission_percentage', level: 'L1_UNIT_INVARIANT', result: refPass });
  recordEvidence({ component: 'BLOOD_BANK', workflow: 'abo_rh_compatibility', level: 'L1_UNIT_INVARIANT', result: bbPass });
  recordEvidence({ component: 'PHARMACY', workflow: 'stock_decrement_invariant', level: 'L1_UNIT_INVARIANT', result: pharmPass });
  recordEvidence({ component: 'INVENTORY', workflow: 'three_way_match', level: 'L1_UNIT_INVARIANT', result: procPass });
  recordEvidence({ component: 'HR', workflow: 'payroll_calculations', level: 'L1_UNIT_INVARIANT', result: hrPass });
  recordEvidence({ component: 'PAYROLL', workflow: 'net_salary_non_negative', level: 'L1_UNIT_INVARIANT', result: hrPass });

  // 7. Schema Contracts Dynamic Execution (L2)
  const schemaResult = runNodeTest('tests/database-schema-contracts.test.mjs');
  const schemaPass = schemaResult.status === 'PASS' ? 'PASS' : 'FAIL';
  recordEvidence({ component: 'SCHEMA', workflow: 'schema_contracts', level: 'L2_STATIC_CONTRACT', result: schemaPass });

  // 8. Auth & RLS Dynamic Security Matrix Execution (L3)
  const secMatrixResult = runNodeTest('tests/multi-tenant-security-matrix.test.mjs');
  const authPass = secMatrixResult.status === 'PASS' ? 'PASS' : 'FAIL';
  const rlsPass = secMatrixResult.status === 'PASS' ? 'PASS' : 'FAIL';
  recordEvidence({ component: 'AUTH', workflow: 'role_matrix', level: 'L3_REAL_DATABASE_INTEGRATION', result: authPass });
  recordEvidence({ component: 'RLS', workflow: 'tenant_isolation', level: 'L3_REAL_DATABASE_INTEGRATION', result: rlsPass });

  // 9. Status Vocabulary Parity (L2)
  const vocabResult = runNodeTest('tests/status-vocabulary-sync.test.mjs');
  const vocabPass = vocabResult.status === 'PASS' ? 'PASS' : 'FAIL';

  // 10. Printing Engine Contract Dynamic Execution (L2)
  const printResult = runNodeTest('tests/phase15-printing-engine.test.mjs');
  const printPass = printResult.status === 'PASS' ? 'PASS' : 'FAIL';
  recordEvidence({ component: 'PRINT', workflow: 'document_print_engine', level: 'L2_STATIC_CONTRACT', result: printPass });

  // Component Matrix with Explicit Testing Levels
  const components = [
    { name: 'EDGE', status: edgeEvaluation, level: 'L5_PRODUCTION_READ_ONLY', note: edgeDetails },
    { name: 'RUNTIME_PROVENANCE', status: runtimeProvenanceEvaluation, level: 'L5_PRODUCTION_READ_ONLY', note: 'Full deployed SHA compared with current checkout' },
    { name: 'DATABASE', status: databaseEvaluation, level: 'L3_REMOTE_DATABASE_CATALOG', note: `Local migration files: ${migrationCount}; remote catalog was not queried` },
    { name: 'SCHEMA', status: schemaPass, level: 'L2_STATIC_CONTRACT', note: 'Column & signature contracts' },
    { name: 'RPC_REGISTRY', status: rpcRegistryEvaluation, level: 'L2_STATIC_CONTRACT', note: '0 critical overloads' },
    { name: 'AUTH', status: authPass, level: 'L3_REAL_DATABASE_INTEGRATION', note: 'Fail-closed session' },
    { name: 'RLS', status: rlsPass, level: 'L3_REAL_DATABASE_INTEGRATION', note: 'Multi-tenant isolation' },
    { name: 'STATUS_SYNC', status: vocabPass, level: 'L2_STATIC_CONTRACT', note: 'DB CHECK constraints' },
    { name: 'REGISTRATION', status: regPass, level: 'L1_UNIT_INVARIANT', note: 'Demographic invariants' },
    { name: 'OPD', status: opdPass, level: 'L1_UNIT_INVARIANT', note: 'Queue state machine' },
    { name: 'IPD', status: ipdPass, level: 'L1_UNIT_INVARIANT', note: 'Dual bed/cabin vacancy' },
    { name: 'PRESCRIPTION', status: rxPass, level: 'L1_UNIT_INVARIANT', note: 'Formulation schedule' },
    { name: 'DIAGNOSTICS', status: diagPass, level: 'L1_UNIT_INVARIANT', note: 'Critical limit alerts' },
    { name: 'LAB', status: diagPass, level: 'L1_UNIT_INVARIANT', note: 'Order accessioning' },
    { name: 'BILLING', status: billPass, level: 'L1_UNIT_INVARIANT', note: 'Item arithmetic & discount' },
    { name: 'FINANCE', status: expPass, level: 'L1_UNIT_INVARIANT', note: 'Debit === Credit invariant' },
    { name: 'EXPENSE', status: expPass, level: 'L1_UNIT_INVARIANT', note: 'GL sync invariant' },
    { name: 'REFERRAL', status: refPass, level: 'L1_UNIT_INVARIANT', note: 'Commission calculation' },
    { name: 'BLOOD_BANK', status: bbPass, level: 'L1_UNIT_INVARIANT', note: 'ABO/Rh compatibility' },
    { name: 'PHARMACY', status: pharmPass, level: 'L1_UNIT_INVARIANT', note: 'Stock decrement invariant' },
    { name: 'INVENTORY', status: procPass, level: 'L1_UNIT_INVARIANT', note: '3-way match invariant' },
    { name: 'HR', status: hrPass, level: 'L1_UNIT_INVARIANT', note: 'Allowance & deductions' },
    { name: 'PAYROLL', status: hrPass, level: 'L1_UNIT_INVARIANT', note: 'Net salary invariant' },
    { name: 'PRINT', status: printPass, level: 'L2_STATIC_CONTRACT', note: 'Zero-dep barcode & pad' },
    { name: 'REMOTE_STAGING', status: 'BLOCKED_EXTERNAL', level: 'L4_REAL_SYNTHETIC_WORKFLOW', note: 'Gate G10: OHMS_TEST_SUPABASE_URL' },
    { name: 'NOTIFICATIONS', status: 'BLOCKED_EXTERNAL', level: 'L5_PRODUCTION_READ_ONLY', note: 'Gate G2/G3: Bulk SMS/WhatsApp keys' },
    { name: 'BACKUPS', status: 'BLOCKED_EXTERNAL', level: 'L5_PRODUCTION_READ_ONLY', note: 'Gate G11: Supabase PITR' },
    { name: 'CURRENT_SHA_CI', status: ciEvaluation, level: 'L5_PRODUCTION_READ_ONLY', note: `Run #${ciRunNumber || 'N/A'}` },
  ];

  console.log('========================================================================================');
  console.log('              OHMS DYNAMIC COMPONENT TRUTH LEDGER (CLASSIFIED BY TEST LEVEL)           ');
  console.log('========================================================================================');
  console.log(`Git HEAD SHA:          ${gitHead.substring(0, 8)} (${gitHead})`);
  console.log(`Repository Migrations: ${migrationCount} local SQL files (not proof of remote DB state)`);
  console.log(`Remote DB Catalog:     ${databaseEvaluation}`);
  console.log(`Live Edge Health:      ${edgeEvaluation} ${edgeDetails ? `[${edgeDetails}]` : ''}`);
  console.log(`GitHub Actions CI:     #${ciRunNumber || 'N/A'} (State: ${ciStatus}${ciConclusion ? ', Conclusion: ' + ciConclusion : ''})`);
  console.log('----------------------------------------------------------------------------------------');
  console.log('COMPONENT'.padEnd(18) + 'STATUS'.padEnd(20) + 'LEVEL'.padEnd(30) + 'EVIDENCE / NOTE');
  console.log('----------------------------------------------------------------------------------------');

  let passCount = 0;
  let blockedCount = 0;
  let failCount = 0;

  for (const c of components) {
    let icon = '❌';
    if (c.status === 'PASS') {
      icon = '✅';
      passCount++;
    } else if (c.status === 'BLOCKED_EXTERNAL') {
      icon = '🔒';
      blockedCount++;
    } else if (c.status === 'IN_PROGRESS' || c.status === 'PENDING_NEW_COMMIT') {
      icon = '⏳';
    } else {
      failCount++;
    }
    console.log(`${icon} ${c.name.padEnd(16)} : ${c.status.padEnd(18)} [${c.level.padEnd(28)}] ${c.note}`);
  }

  console.log('========================================================================================');
  console.log(`Total: ${components.length} | Verified Pass: ${passCount} | Blocked External: ${blockedCount} | Fail: ${failCount}`);
  console.log('========================================================================================\n');

  return { components, passCount, blockedCount, failCount };
}

runComponentTruth().catch(console.error);
