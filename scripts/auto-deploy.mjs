import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\n🚀 [OHMS PRODUCTION RELEASE & DEPLOY PIPELINE STARTING...]');

// 1. Verify environment prerequisites
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    });
  }
} catch {
  console.log('Notice: .env.local load pass.');
}

try {
  // Step 1: Pre-deployment quality checks
  console.log('\n🔍 Step 1: Running strict TypeScript typecheck...');
  execSync('npm run typecheck', { stdio: 'inherit' });

  console.log('\n🔍 Step 2: Running ESLint zero-warning gate...');
  execSync('npx eslint . --max-warnings 0', { stdio: 'inherit' });

  console.log('\n🧪 Step 3: Running Node unit & integration test suite...');
  execSync('npm test', { stdio: 'inherit' });

  // Step 4: Ensure working tree is clean or commit changes
  console.log('\n🐙 Step 4: Checking Git working tree...');
  const status = execSync('git status --porcelain').toString().trim();
  if (status.length > 0) {
    console.log('Working tree has uncommitted modifications:\n' + status);
    const commitMsg = process.argv[2] || `release: verified production build (${new Date().toISOString()})`;
    console.log(`Committing changes: "${commitMsg}"...`);
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
  }

  // Step 5: Synchronize with GitHub main using authenticated SSH transport
  console.log('\n🐙 Step 5: Pushing exact commit to GitHub main...');
  const pushRes = execSync('node scripts/git-sync.mjs push', { stdio: 'pipe', encoding: 'utf8' });
  console.log(pushRes);
  if (pushRes.includes('error:') || pushRes.includes('fatal:')) {
    throw new Error('Git push failed to synchronize with remote origin.');
  }

  // Step 6: Verify working tree is 100% clean and retrieve exact SHA
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

  // Step 7: Build static production export
  console.log('\n📦 Step 7: Compiling Next.js production static export...');
  execSync('npm run build', { stdio: 'inherit' });

  // Step 8: Deploy exact tested commit to Cloudflare Pages (commit-dirty = false)
  console.log(`\n☁️ Step 8: Deploying to Cloudflare Pages (commit_dirty = false, SHA = ${headSha})...`);
  const deployCmd = `npx wrangler pages deploy out --project-name=onnesha-hospital --branch=main --commit-hash=${headSha} --commit-dirty=false --commit-message="${commitMsg}"`;
  execSync(deployCmd, { stdio: 'inherit' });

  // Step 9: Run production smoke tests
  console.log('\n🧪 Step 9: Running production route smoke tests...');
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
