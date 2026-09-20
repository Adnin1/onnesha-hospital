import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

console.log('🧪 [OHMS TEST RUNNER] Starting test discovery across tests/ ...');

function findTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (item.name === 'live' || item.name.endsWith('.live.test.mjs')) {
      continue;
    }
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findTestFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.test.mjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findTestFiles('tests');
console.log(`Discovered ${testFiles.length} test files to execute.\n`);

let failCount = 0;
let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
let totalSkipped = 0;
let totalCancelled = 0;

let notConfiguredCount = 0;
let deferredCount = 0;
let blockedCount = 0;
let standardSkippedCount = 0;

for (const file of testFiles) {
  const relPath = file.replace(/\\/g, '/');
  const res = spawnSync('node', ['--test', relPath], {
    encoding: 'utf8',
    env: { ...process.env }
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';

  // Extract metrics from test output
  const testsMatch = stdout.match(/(?:#|ℹ)\s+tests\s+(\d+)/);
  const passMatch = stdout.match(/(?:#|ℹ)\s+pass\s+(\d+)/);
  const failMatch = stdout.match(/(?:#|ℹ)\s+fail\s+(\d+)/);
  const skippedMatch = stdout.match(/(?:#|ℹ)\s+skipped\s+(\d+)/);
  const cancelledMatch = stdout.match(/(?:#|ℹ)\s+cancelled\s+(\d+)/);

  if (testsMatch) totalTests += parseInt(testsMatch[1], 10);
  if (passMatch) totalPass += parseInt(passMatch[1], 10);
  if (failMatch) totalFail += parseInt(failMatch[1], 10);
  if (skippedMatch) {
    const skipNum = parseInt(skippedMatch[1], 10);
    totalSkipped += skipNum;

    // Classify skip reasons from output lines
    const skipLines = stdout.split('\n').filter(line => line.includes('# SKIP') || line.includes('# STATUS:'));
    for (const sLine of skipLines) {
      const lower = sLine.toLowerCase();
      if (lower.includes('not configured') || lower.includes('not_configured')) {
        notConfiguredCount++;
      } else if (lower.includes('deferred') || lower.includes('pending activation') || lower.includes('live_merchant')) {
        deferredCount++;
      } else if (lower.includes('blocked')) {
        blockedCount++;
      } else {
        standardSkippedCount++;
      }
    }
  }
  if (cancelledMatch) totalCancelled += parseInt(cancelledMatch[1], 10);

  if (res.status !== 0) {
    failCount++;
    console.error(`\n========================================`);
    console.error(`❌ FAILED: ${relPath} (exit code: ${res.status})`);
    console.error(`========================================`);
    console.error(`STDOUT:\n${stdout}`);
    console.error(`STDERR:\n${stderr}`);
    console.error(`========================================\n`);
  } else {
    process.stdout.write('✓');
  }
}

// Reconcile skip breakdown if counts don't match
if (totalSkipped > 0 && (notConfiguredCount + deferredCount + blockedCount + standardSkippedCount) !== totalSkipped) {
  standardSkippedCount = Math.max(0, totalSkipped - (notConfiguredCount + deferredCount + blockedCount));
}

console.log(`\n\n========================================`);
console.log(`           OHMS TEST SUMMARY            `);
console.log(`========================================`);
console.log(`Total Test Suites:    ${testFiles.length}`);
console.log(`Passed Suites:        ${testFiles.length - failCount}`);
console.log(`Failed Suites:        ${failCount}`);
console.log(`----------------------------------------`);
console.log(`Total Test Cases:     ${totalTests}`);
console.log(`  • PASSED:           ${totalPass}`);
console.log(`  • FAILED:           ${totalFail}`);
console.log(`  • SKIPPED / OTHER:  ${totalSkipped}`);
if (totalSkipped > 0) {
  console.log(`    - DEFERRED:       ${deferredCount} (e.g. pending external merchant activation)`);
  console.log(`    - NOT_CONFIGURED: ${notConfiguredCount} (e.g. optional local staging envs)`);
  console.log(`    - BLOCKED:        ${blockedCount}`);
  console.log(`    - STANDARD_SKIP:  ${standardSkippedCount}`);
}
if (totalCancelled > 0) {
  console.log(`  • CANCELLED:        ${totalCancelled}`);
}
console.log(`========================================\n`);

if (failCount > 0 || totalFail > 0) {
  console.error('❌ Test suite finished with failures.\n');
  process.exit(1);
} else if (totalSkipped > 0) {
  console.log(`✅ All active test suites passed (${totalPass} passed, ${totalSkipped} deferred/skipped with explicit rationale).\n`);
} else {
  console.log('🎉 All test suites executed and verified with zero gaps!\n');
}
