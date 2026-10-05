import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROGRESS_FILE = path.join(process.cwd(), 'progress.txt');

export function logProgress(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(PROGRESS_FILE, line);
  console.log(line.trim());
}

export function runRalphLoopIteration(taskName, executeFn, testCommand) {
  console.log(`\n🔁 [RALPH LOOP] Iteration starting for task: "${taskName}"...`);
  logProgress(`STARTING: ${taskName}`);

  try {
    // 1. Execute task
    if (executeFn) {
      executeFn();
    }

    // 2. Run verification test
    if (testCommand) {
      console.log(`🧪 Running verification: ${testCommand}`);
      execSync(testCommand, { stdio: 'inherit' });
    }

    // 3. Commit changes if dirty
    const status = execSync('git status --porcelain').toString().trim();
    if (status.length > 0) {
      execSync('git add -A');
      execSync(`git commit -m "feat(ralph-loop): complete ${taskName}"`);
      const sha = execSync('git rev-parse --short HEAD').toString().trim();
      logProgress(`COMPLETED: ${taskName} (Commit: ${sha})`);
      console.log(`✅ [RALPH LOOP] Task "${taskName}" completed and committed (${sha}).`);
    } else {
      logProgress(`VERIFIED: ${taskName} (No file changes needed)`);
      console.log(`✅ [RALPH LOOP] Task "${taskName}" verified.`);
    }

    return true;
  } catch (err) {
    logProgress(`FAILED: ${taskName} - Error: ${err.message}`);
    console.error(`❌ [RALPH LOOP] Iteration failed for "${taskName}": ${err.message}`);
    return false;
  }
}

if (process.argv[1]?.endsWith('ralph-loop.mjs')) {
  console.log('🔁 [RALPH LOOP ENGINE] Operational and ready for autonomous dispatch.');
}
