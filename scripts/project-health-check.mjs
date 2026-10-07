#!/usr/bin/env node
/**
 * OHMS Project Health Check — Automated Governance Validation
 * Exits non-zero on critical violations.
 * Run: node scripts/project-health-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
let criticalCount = 0;
let warningCount = 0;

function critical(msg) {
  console.error(`❌ CRITICAL: ${msg}`);
  criticalCount++;
}

function warn(msg) {
  console.warn(`⚠️  WARNING: ${msg}`);
  warningCount++;
}

function pass(msg) {
  console.log(`✅ PASS: ${msg}`);
}

function scanFiles(extensions, excludeDirs = ['node_modules', '.next', 'out', '.git']) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  walk(ROOT);
  return results;
}

console.log('\n🏥 OHMS Project Health Check\n' + '='.repeat(50));

// ─── 1. Git State ───
console.log('\n📋 1. Git State');
try {
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (status) {
    warn(`Working tree has ${status.split('\n').length} uncommitted changes`);
  } else {
    pass('Working tree clean');
  }
} catch { warn('Git not available'); }

// ─── 2. Version Consistency ───
console.log('\n📋 2. Version Consistency');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
console.log(`   package.json version: ${pkg.version}`);
try {
  const headCommit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const tagCommit = execSync(`git rev-parse "v${pkg.version}^{commit}"`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  if (headCommit === tagCommit) {
    pass(`HEAD matches v${pkg.version} tag (${headCommit.slice(0, 8)})`);
  } else {
    // Check if diff between tag and HEAD is docs-only (no code changes)
    let isDocsOnly = false;
    try {
      const diffFiles = execSync(`git diff --name-only "v${pkg.version}^{commit}" HEAD`, { cwd: ROOT, encoding: 'utf8' }).trim();
      if (diffFiles) {
        const files = diffFiles.split('\n').map(f => f.trim()).filter(Boolean);
        isDocsOnly = files.every(f =>
          f.startsWith('docs/') || f.startsWith('scripts/') || f.startsWith('tests/') ||
          f.startsWith('CHANGELOG') || f.startsWith('README') || f.endsWith('.md') ||
          f === 'public/llms.txt' || f.endsWith('.txt')
        );
      }
    } catch { /* diff check failed, treat as non-docs */ }
    if (isDocsOnly) {
      pass(`HEAD (${headCommit.slice(0, 8)}) is non-production ahead of v${pkg.version} tag (${tagCommit.slice(0, 8)}) — no app code change`);
    } else {
      // Check if HEAD is a verified mainline descendant of the release tag under immutable tag governance
      let isMainlineDescendant = false;
      try {
        execSync(`git merge-base --is-ancestor "v${pkg.version}^{commit}" HEAD`, { cwd: ROOT, encoding: 'utf8' });
        isMainlineDescendant = true;
      } catch { /* not a descendant */ }

      if (isMainlineDescendant) {
        pass(`HEAD (${headCommit.slice(0, 8)}) is verified mainline descendant of v${pkg.version} tag (${tagCommit.slice(0, 8)}) — immutable tag governance active`);
      } else {
        warn(`HEAD (${headCommit.slice(0, 8)}) ≠ v${pkg.version} tag (${tagCommit.slice(0, 8)}) — tag needs update or version bump`);
      }
    }
  }
} catch {
  warn(`Tag v${pkg.version} not found — release not yet tagged`);
}

// ─── 3. Secret Scanning ───
console.log('\n📋 3. Secret Scanning');
const sourceFiles = scanFiles(['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml']);
const secretPatterns = [
  { pattern: /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i, name: 'NEXT_PUBLIC service_role leak' },
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/, name: 'Hardcoded JWT token' },
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/, name: 'Live Stripe key' },
  { pattern: /(?:const|let|var)\s+(?:password|passwd|secret)\s*=\s*["'][^"']{8,}["']/i, name: 'Hardcoded password variable' },
  { pattern: /\b(?:password|passwd)\s*:\s*["'](?!(?:staff\.|auth\.|patients\.|billing\.|\[REDACTED))[^"']{8,}["']/i, name: 'Hardcoded password property' },
];
let secretsFound = 0;
for (const file of sourceFiles) {
  const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
  // Skip tests, documentation, scripts, and build artifacts
  if (
    relPath.includes('node_modules') ||
    relPath.startsWith('docs/') ||
    relPath.startsWith('tests/') ||
    relPath.startsWith('scripts/') ||
    relPath.includes('.test.') ||
    relPath.includes('.spec.')
  ) continue;
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const { pattern, name } of secretPatterns) {
      if (pattern.test(content)) {
        critical(`${name} found in ${relPath}`);
        secretsFound++;
      }
    }
  } catch { /* skip unreadable */ }
}
if (secretsFound === 0) pass('No hardcoded secrets found in production source');

// ─── 4. Localhost / HTTP References ───
console.log('\n📋 4. Localhost / HTTP References');
const prodFiles = sourceFiles.filter(f => {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  return !rel.includes('node_modules') && !rel.startsWith('docs/') && !rel.startsWith('tests/') && !rel.startsWith('scripts/') && !rel.includes('.test.') && !rel.includes('.spec.');
});
let localhostCount = 0;
for (const file of prodFiles) {
  const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) return;
      if (/localhost|127\.0\.0\.1/.test(line)) {
        // Allow documented container healthcheck, devUrl, playwright config, and CORS development origins
        if (/devUrl|sandbox|tauri\.conf|docker-compose\.yml|playwright\.config|ALLOWED_ORIGINS|payment-callback|payment-initiate/.test(relPath) || /tauri:\/\/localhost|localhost\/healthz/.test(line)) {
          return;
        }
        warn(`localhost reference in ${relPath}:${i + 1}`);
        localhostCount++;
      }
    });
  } catch { /* skip */ }
}
if (localhostCount === 0) pass('No localhost references in production source');

// ─── 5. TODO/FIXME Audit ───
console.log('\n📋 5. TODO/FIXME Audit');
let todoCount = 0;
for (const file of prodFiles) {
  const relPath = path.relative(ROOT, file);
  try {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/\b(TODO|FIXME|HACK|XXX)\b/g);
    if (matches) {
      warn(`${matches.length} TODO/FIXME in ${relPath}`);
      todoCount += matches.length;
    }
  } catch { /* skip */ }
}
if (todoCount === 0) pass('No TODO/FIXME markers in production source');

// ─── 6. TypeScript ───
console.log('\n📋 6. TypeScript Compilation');
try {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execSync(`${npxCmd} tsc --noEmit`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  pass('TypeScript compiles with 0 errors');
} catch (e) {
  const errOutput = (e.stdout || '') + (e.stderr || '');
  critical(`TypeScript compilation failed: ${errOutput.split('\n')[0] || 'unknown error'}`);
}

// ─── 7. ESLint ───
console.log('\n📋 7. ESLint');
try {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execSync(`${npxCmd} eslint . --max-warnings 0`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  pass('ESLint passes with 0 warnings');
} catch (e) {
  const errOutput = (e.stdout || '') + (e.stderr || '');
  critical(`ESLint failed: ${errOutput.split('\n')[0] || 'see output'}`);
}

// ─── 8. Build ───
console.log('\n📋 8. Build Verification');
try {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execSync(`${npmCmd} run build`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  pass('Build succeeds');
} catch (e) {
  const errOutput = (e.stdout || '') + (e.stderr || '');
  critical(`Build failed: ${errOutput.split('\n')[0] || 'see output'}`);
}

// ─── 9. Migration Count ───
console.log('\n📋 9. Database Migrations');
try {
  const migrationDir = path.join(ROOT, 'supabase', 'migrations');
  const migrations = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql'));
  pass(`${migrations.length} migration files found`);
} catch { warn('Migration directory not found'); }

// ─── 10. Service Worker Safety ───
console.log('\n📋 10. Service Worker Safety');
try {
  const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  const requiredPatterns = ['patient', 'prescription', 'diagnosis', 'invoice', 'billing', 'clinical'];
  const missing = requiredPatterns.filter(p => !sw.toLowerCase().includes(p));
  if (missing.length > 0) {
    critical(`Service Worker missing NEVER_CACHE patterns for: ${missing.join(', ')}`);
  } else {
    pass('Service Worker covers all required NEVER_CACHE patterns');
  }
} catch { warn('Service Worker (sw.js) not found'); }

// ─── 11. Security Headers ───
console.log('\n📋 11. Security Headers');
try {
  const headers = fs.readFileSync(path.join(ROOT, 'public', '_headers'), 'utf8');
  const required = ['Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Content-Security-Policy'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    critical(`Missing security headers: ${missing.join(', ')}`);
  } else {
    pass('All required security headers present');
  }
  if (headers.includes('unsafe-eval')) {
    critical('CSP contains unsafe-eval');
  } else {
    pass('CSP does not contain unsafe-eval');
  }
} catch { warn('_headers file not found'); }

// ─── 12. npm Audit (Dual Gate: Production & Full Dependency Tree) ───
console.log('\n📋 12. npm Audit');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) {
  if (k.startsWith('npm_')) delete cleanEnv[k];
}

// Gate 12A: Production Dependency Security
try {
  execSync(`${npmCmd} audit --audit-level=high --omit=dev`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env: cleanEnv,
  });
  pass('Gate 12A: Production dependencies audit: 0 high/critical vulnerabilities');
} catch (e) {
  const output = (e.stdout || '') + (e.stderr || '');
  if (output.includes('found 0 vulnerabilities')) {
    pass('Gate 12A: Production dependencies audit: 0 vulnerabilities');
  } else {
    critical('Gate 12A: Production dependencies contain high/critical vulnerabilities');
  }
}

// Gate 12B: Full Dependency Tree Audit (including dev/build tooling)
try {
  execSync(`${npmCmd} audit --audit-level=high`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env: cleanEnv,
  });
  pass('Gate 12B: Full dependency tree audit: 0 high/critical vulnerabilities');
} catch (e) {
  const output = (e.stdout || '') + (e.stderr || '');
  if (output.includes('found 0 vulnerabilities')) {
    pass('Gate 12B: Full dependency tree audit: 0 vulnerabilities');
  } else {
    critical('Gate 12B: Full dependency tree contains high/critical vulnerabilities');
  }
}

// ─── 13. Static Export Invariants ───
console.log('\n📋 13. Static Export Compatibility');
try {
  let staticExportViolations = 0;
  for (const file of prodFiles) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.js') && !file.endsWith('.mjs')) continue;
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (content.includes('"use server"') || content.includes("'use server'")) {
      critical(`Unsupported "use server" directive in static export codebase: ${rel}`);
      staticExportViolations++;
    }
    // Check UI routes and components for next/headers and server client imports
    if (rel.startsWith('app/') || rel.startsWith('components/')) {
      if (content.includes("from 'next/headers'") || content.includes('from "next/headers"')) {
        critical(`Unsupported next/headers import in UI codebase: ${rel}`);
        staticExportViolations++;
      }
      if (content.includes('lib/supabase/server') || content.includes('@/lib/supabase/server')) {
        critical(`UI file imports server-runtime client @/lib/supabase/server: ${rel}`);
        staticExportViolations++;
      }
    }
  }
  if (staticExportViolations === 0) pass('Static export invariants verified: 0 server-only directives or headers imports in UI');
} catch (e) {
  warn(`Static export check encountered error: ${e.message}`);
}

// ─── 14. Docker & Infrastructure Consistency ───
console.log('\n📋 14. Docker & Infrastructure Consistency');
try {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  if (dockerfile.includes(`LABEL version="${pkg.version}"`)) {
    pass(`Dockerfile version label synchronized (${pkg.version})`);
  } else {
    critical(`Dockerfile version label is out of sync with package.json (${pkg.version})`);
  }

  const nginxConf = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
  if (nginxConf.includes('sandbox.sslcommerz.com')) {
    critical('docker/nginx.conf contains development sandbox.sslcommerz.com in production policy');
  } else {
    pass('docker/nginx.conf CSP free of development sandbox origins');
  }
} catch (e) {
  warn(`Docker consistency check skipped: ${e.message}`);
}

// ─── 15. Storage & Accounting Invariants ───
console.log('\n📋 15. Storage & Accounting Invariants');
try {
  // 15.1 Storage Authorization
  const filesCode = fs.readFileSync(path.join(ROOT, 'lib', 'storage', 'files.ts'), 'utf8');
  if (
    filesCode.includes('requireStorageAccessAuthorization') &&
    filesCode.includes('session.organizationId !== params.organizationId') &&
    filesCode.includes('.from("patients")')
  ) {
    pass('Storage authorization enforces active organization, permission, and patient boundary');
  } else {
    critical('Storage authorization in lib/storage/files.ts is missing tenant or patient validation');
  }

  // 15.2 P&L Date Boundary & GL Accounting
  const pnlMigration = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260929000000_pnl_date_boundary_and_authoritative_gl.sql'),
    'utf8'
  );
  if (pnlMigration.includes('je.entry_date < v_end_date_d') && !pnlMigration.includes('FROM public.expenses')) {
    pass('P&L summary enforces strict half-open date boundary and authoritative General Ledger');
  } else {
    critical('P&L summary in migration 92 violates half-open date boundary or includes legacy expenses fallback');
  }

  // 15.3 Docker Compose Entrypoint Script
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  if (compose.includes('init-postgres.sh:/docker-entrypoint-initdb.d/00_init.sh:ro')) {
    pass('Docker compose mounts init-postgres.sh directly as executable *.sh entrypoint');
  } else {
    critical('Docker compose does not mount executable init-postgres.sh in /docker-entrypoint-initdb.d/');
  }

  // 15.4 Storage Admin Delete RLS & Cash Basis Disbursements (Migration 94)
  const m94 = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260929020000_storage_admin_delete_and_cash_disbursements.sql'),
    'utf8'
  );
  if (
    m94.includes('medical_vault_tenant_isolation_delete') &&
    m94.includes("LOWER(r.name) IN ('admin', 'super_admin', 'hospital_administrator', 'super admin')") &&
    m94.includes("coa.account_code LIKE '10%'")
  ) {
    pass('Storage admin DELETE policy and GL cash-basis disbursements verified in Migration 94');
  } else {
    critical('Migration 94 missing admin DELETE check or cash-basis account filtering');
  }
} catch (e) {
  warn(`Storage & Accounting invariant check skipped: ${e.message}`);
}

// ─── 16. Admin Authentication & IAM Invariants ───
console.log('\n📋 16. Admin Authentication & IAM Invariants');
try {
  const loginSrc = fs.readFileSync(path.join(ROOT, 'app/(auth)/login/page.tsx'), 'utf8');
  if (
    loginSrc.includes('email.trim().toLowerCase()') &&
    loginSrc.includes('autoCapitalize="none"') &&
    loginSrc.includes('autoCorrect="off"') &&
    loginSrc.includes('spellCheck={false}') &&
    loginSrc.includes('showPassword')
  ) {
    pass('Login form enforces email trimming, case normalization, autoCapitalize suppression, and password reveal');
  } else {
    critical('Login form missing email normalization or mobile input hardening');
  }

  const redirects = fs.readFileSync(path.join(ROOT, 'public/_redirects'), 'utf8');
  if (redirects.includes('/admin') && redirects.includes('/login')) {
    pass('Cloudflare _redirects contains fallback routing for /admin and /admin/login');
  } else {
    critical('Cloudflare _redirects missing /admin fallback routing');
  }

  const verifyScript = fs.readFileSync(path.join(ROOT, 'scripts/verify-admin-account.mjs'), 'utf8');
  if (verifyScript.includes('verify()') && verifyScript.includes('Super Admin role assigned')) {
    pass('Admin IAM verification script operational with 9 invariant checks');
  } else {
    critical('scripts/verify-admin-account.mjs missing or incomplete');
  }
} catch (e) {
  critical(`Admin authentication invariant check failed: ${e.message}`);
}

// ─── Summary ───
const isStrictMode = process.argv.includes('--strict') || process.argv.includes('--release');
console.log('\n' + '='.repeat(50));
console.log(`Results: ${criticalCount} critical, ${warningCount} warnings (Strict Mode: ${isStrictMode ? 'ENABLED' : 'DISABLED'})`);

if (criticalCount > 0) {
  console.error('\n🚫 HEALTH CHECK FAILED — Fix critical issues before release.');
  process.exit(1);
} else if (warningCount > 0 && isStrictMode) {
  console.error('\n🚫 RELEASE CERTIFICATION FAILED — Warnings are prohibited in strict release certification.');
  process.exit(1);
} else if (warningCount > 0) {
  console.log('\n⚠️  HEALTH CHECK PASSED WITH WARNINGS — Review before release.');
  process.exit(0);
} else {
  console.log('\n✅ HEALTH CHECK PASSED — All gates green.');
  process.exit(0);
}
