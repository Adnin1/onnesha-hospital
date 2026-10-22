#!/usr/bin/env node
/**
 * OHMS Runtime Version Generator
 * Generates public/version.json before build with runtime provenance telemetry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function getGitSha() {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function getMigrationHead() {
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return { count: 0, latestFile: null };
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  // Migration timestamps are normally monotonic, but an applied migration can
  // legitimately receive an earlier timestamp than an already-committed file
  // (for example when a remote migration tool allocates the applied version).
  // Prefer the highest explicit migration ordinal when filenames carry
  // "_migration_NNN_", then fall back to timestamp/filename ordering.
  const numbered = files
    .map((file) => {
      const match = file.match(/(?:^|_)migration_(\d+)(?:_|\.sql$)/i);
      return match ? { file, ordinal: Number.parseInt(match[1], 10) } : null;
    })
    .filter(Boolean);

  let latestFile = files[files.length - 1] || null;
  if (numbered.length > 0) {
    numbered.sort((a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file));
    latestFile = numbered[numbered.length - 1].file;
  }

  return {
    count: files.length,
    latestFile,
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gitSha = getGitSha();
const migrations = getMigrationHead();
const timestamp = new Date().toISOString();
const buildId = `ohms-${pkg.version}-${gitSha.slice(0, 8)}-${Date.now()}`;

const versionPayload = {
  name: pkg.name,
  version: pkg.version,
  git_sha: gitSha,
  short_sha: gitSha.slice(0, 8),
  build_id: buildId,
  migration_count: migrations.count,
  migration_head_file: migrations.latestFile,
  generated_at: timestamp,
};

const targetPath = path.join(ROOT, 'public', 'version.json');
fs.writeFileSync(targetPath, JSON.stringify(versionPayload, null, 2) + '\n', 'utf8');

console.log(`✅ [OHMS VERSION] Generated ${targetPath}`);
console.log(`   SHA: ${versionPayload.short_sha} | Migrations: ${versionPayload.migration_count} | Version: ${versionPayload.version}`);
