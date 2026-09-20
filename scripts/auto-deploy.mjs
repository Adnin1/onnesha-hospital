import { execSync } from 'child_process';

console.log('\n🚀 [OHMS PRODUCTION RELEASE & DEPLOY PIPELINE STARTING...]');

try {
  // Step 1: Pre-deployment quality checks
  console.log('\n🔍 Step 1: Running strict TypeScript typecheck...');
  execSync('npm run typecheck', { stdio: 'inherit' });

  console.log('\n🔍 Step 2: Running ESLint zero-warning gate...');
  execSync('npx eslint . --max-warnings 0', { stdio: 'inherit' });

  console.log('\n🔒 Step 3: Running dependency security audit (high/critical level)...');
  execSync('npm audit --audit-level=high', { stdio: 'inherit' });

  console.log('\n🧪 Step 4: Running Node unit & integration test suite in strict certification mode...');
  execSync('npm run test:certification', { stdio: 'inherit' });

  console.log('\n🗄️ Step 5: Verifying Supabase remote migration parity...');
  const migrationOutput = execSync('npx supabase migration list', { encoding: 'utf8' });
  if (migrationOutput.includes('"remote":null') || migrationOutput.includes('"local":null')) {
    throw new Error('Database migration parity mismatch between local and remote Supabase.');
  }
  console.log('✓ Remote database migrations are 100% in parity with local set.');

  console.log('\n🛡️ Step 6: Running Supabase database linting across linked instance...');
  const lintOutput = execSync('npx supabase db lint --linked', { encoding: 'utf8' });
  const lintParsed = JSON.parse(lintOutput.substring(lintOutput.indexOf('{')));
  const errors = (lintParsed.results || []).flatMap(r => (r.issues || []).filter(i => i.level && i.level.toLowerCase().includes('error')));
  if (errors.length > 0) {
    throw new Error(`Database linting found ${errors.length} fatal error(s):\n${JSON.stringify(errors, null, 2)}`);
  }
  console.log('✓ Database schema, functions, and RLS policies passed lint checks.');

  console.log('\n🎭 Step 7: Running Playwright Chromium E2E browser tests...');
  execSync('npx playwright test --project=chromium', { stdio: 'inherit' });

  // Step 8: Ensure working tree is clean (fail closed if dirty; no auto-commit)
  console.log('\n🐙 Step 8: Verifying Git working tree is clean...');
  const status = execSync('git status --porcelain').toString().trim();
  if (status.length > 0) {
    throw new Error(
      `Working tree has uncommitted modifications:\n${status}\nProduction deployment requires an explicitly reviewed, committed, and clean working tree. Auto-commit is disabled.`
    );
  }

  // Step 9: Synchronize with GitHub main using authenticated SSH transport
  console.log('\n🐙 Step 9: Pushing exact commit to GitHub main...');
  const pushRes = execSync('node scripts/git-sync.mjs push', { stdio: 'pipe', encoding: 'utf8' });
  console.log(pushRes);
  if (pushRes.includes('error:') || pushRes.includes('fatal:')) {
    throw new Error('Git push failed to synchronize with remote origin.');
  }

  // Step 10: Verify working tree is 100% clean and retrieve exact SHA
  const finalStatus = execSync('git status --porcelain').toString().trim();
  if (finalStatus.length > 0) {
    throw new Error(`Working tree is dirty after push: ${finalStatus}. Deployment aborted.`);
  }

  const headSha = execSync('git rev-parse HEAD').toString().trim();
  const remoteSha = execSync('node scripts/git-sync.mjs ls-remote').toString().trim().split(/\s+/)[0];
  if (headSha !== remoteSha) {
    throw new Error(`SHA parity mismatch: local HEAD (${headSha}) != remote main (${remoteSha}). Deployment aborted.`);
  }

  const commitMsg = execSync('git log -1 --pretty=%B').toString().trim().replace(/["\r\n]+/g, ' ');
  console.log(`\n📌 Authoritative Synchronized Commit SHA: ${headSha}`);

  // Step 11: Build static production export
  console.log('\n📦 Step 11: Compiling Next.js production static export...');
  execSync('npm run build', { stdio: 'inherit' });

  // Step 12: Deploy exact tested commit to Cloudflare Pages (commit-dirty = false)
  console.log(`\n☁️ Step 12: Deploying to Cloudflare Pages (commit_dirty = false, SHA = ${headSha})...`);
  const deployCmd = `npx wrangler pages deploy out --project-name=onnesha-hospital --branch=main --commit-hash=${headSha} --commit-dirty=false --commit-message="${commitMsg}"`;
  execSync(deployCmd, { stdio: 'inherit' });

  // Step 13: Run production smoke tests
  console.log('\n🧪 Step 13: Running production route smoke tests...');
  execSync('node scripts/smoke_test.mjs', { stdio: 'inherit' });

  console.log('\n🎉 PRODUCTION RELEASE SUCCESSFUL:');
  console.log(`  • Commit SHA:       ${headSha}`);
  console.log(`  • Commit Dirty:     false`);
  console.log(`  • GitHub Main:      Synced`);
  console.log(`  • Cloudflare Pages: Deployed & Verified`);
  console.log(`  • Production URL:   https://onnesha-hospital.pages.dev\n`);
} catch (error) {
  console.error('\n❌ Deployment pipeline aborted with error:', error.message);
  process.exit(1);
}
