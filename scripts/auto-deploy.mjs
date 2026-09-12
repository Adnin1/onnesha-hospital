import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\n🚀 [FULL AGENT AUTO-DEPLOY STARTING...]');

// Read environment variables manually without external dependencies
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
} catch (e) {
  console.log('Notice: .env.local read pass.');
}

const gitCmd = 'C:\\Users\\mahin khan\\AppData\\Local\\GitHubDesktop\\app-3.6.4\\resources\\app\\git\\cmd';
process.env.PATH = `${gitCmd};${process.env.PATH}`;

try {
  // 1. Build Next.js
  console.log('📦 Step 1: Building optimized production bundle...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. Deploy to Cloudflare Pages
  console.log('\n☁️ Step 2: Deploying to Cloudflare Pages (onnesha-hospital)...');
  execSync('npx wrangler pages deploy out --project-name=onnesha-hospital --commit-dirty=true', { stdio: 'inherit' });

  // 3. Sync to GitHub
  console.log('\n🐙 Step 3: Syncing changes to GitHub repository (Adnin1/onnesha-hospital)...');
  try {
    execSync('git add -A', { stdio: 'inherit' });
    const status = execSync('git status --porcelain').toString();
    if (status.trim().length > 0) {
      const commitMsg = process.argv[2] || `auto: website update by AI Agent (${new Date().toLocaleString()})`;
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
      execSync('git push origin main', { stdio: 'inherit' });
      console.log('✅ GitHub synced successfully!');
    } else {
      console.log('ℹ️ GitHub is already synchronized with latest code.');
    }
  } catch (gitErr) {
    console.warn('⚠️ GitHub push status:', gitErr.message);
  }

  console.log('\n🎉 ALL DONE! Everything updated automatically:');
  console.log('🌐 Live Production Website: https://onnesha-hospital.pages.dev');
  console.log('🐙 Permanent GitHub Code:  https://github.com/Adnin1/onnesha-hospital');
  console.log('🗄️ Supabase PostgreSQL DB: iuhtzahuszdkdarhxobx (Live)\n');
} catch (error) {
  console.error('\n❌ Deployment pipeline failed:', error.message);
  process.exit(1);
}
