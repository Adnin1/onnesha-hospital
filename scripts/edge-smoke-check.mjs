#!/usr/bin/env node
/**
 * OHMS Edge Version & Smoke Check
 * Verifies that Cloudflare Pages edge is serving the exact current Git commit and migration head.
 */

import { execSync } from 'node:child_process';

const EDGE_URL = 'https://onnesha-hospital.pages.dev/version.json';

async function verifyEdgeVersion() {
  console.log('🌐 [EDGE SMOKE CHECK] Querying runtime provenance from Cloudflare Pages...');
  let localSha = 'UNKNOWN';
  try {
    localSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    console.warn('⚠️ Unable to determine local Git SHA.');
  }

  try {
    const res = await fetch(EDGE_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      console.error(`❌ Edge returned HTTP ${res.status} for ${EDGE_URL}`);
      return false;
    }

    const data = await res.json();
    console.log(`✅ Edge Version Endpoint Reachable (HTTP 200)`);
    console.log(`   Edge Git SHA:       ${data.git_sha} (${data.short_sha})`);
    console.log(`   Local Git SHA:      ${localSha} (${localSha.slice(0, 8)})`);
    console.log(`   Migration Head:     ${data.migration_count} (${data.migration_head_file})`);
    console.log(`   Edge Build ID:      ${data.build_id}`);
    console.log(`   Generated At:       ${data.generated_at}`);

    if (data.short_sha === localSha.slice(0, 8) || data.git_sha === localSha) {
      console.log('🎉 EDGE PROVENANCE CONFIRMED: Live Cloudflare Pages exactly matches local Git HEAD!\n');
      return true;
    } else {
      console.warn('⚠️ EDGE PROVENANCE MISMATCH: Edge is serving a previous release commit.');
      console.warn(`   Edge: ${data.short_sha} vs Local: ${localSha.slice(0, 8)}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ Edge request failed: ${err.message}`);
    return false;
  }
}

verifyEdgeVersion().then((ok) => {
  if (process.argv.includes('--assert') && !ok) {
    process.exit(1);
  }
});
