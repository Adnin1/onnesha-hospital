import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

console.log('🧪 [OHMS TEST RUNNER] Starting test discovery across tests/ ...');

function findTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
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
for (const file of testFiles) {
  const relPath = file.replace(/\\/g, '/');
  const res = spawnSync('node', ['--test', relPath], {
    encoding: 'utf8',
    env: { ...process.env }
  });

  if (res.status !== 0) {
    failCount++;
    console.error(`\n========================================`);
    console.error(`❌ FAILED: ${relPath} (exit code: ${res.status})`);
    console.error(`========================================`);
    console.error(`STDOUT:\n${res.stdout}`);
    console.error(`STDERR:\n${res.stderr}`);
    console.error(`========================================\n`);
  } else {
    process.stdout.write('✓');
  }
}

console.log(`\n\n========================================`);
console.log(`Total Test Suites: ${testFiles.length}`);
console.log(`Failed Suites:     ${failCount}`);
console.log(`Passed Suites:     ${testFiles.length - failCount}`);
console.log(`========================================\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 All test suites executed and passed successfully!\n');
}
