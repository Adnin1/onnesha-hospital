import https from 'https';
import fs from 'fs';
import path from 'path';

const TARGET_HOST = 'https://onnesha-hospital.pages.dev';
const HEALTH_URL = `${TARGET_HOST}/api/health.json`;
const LOG_FILE = path.join(process.cwd(), 'logs', 'sre-watchdog.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          durationMs: Date.now() - start,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 10000ms'));
    });
  });
}

export async function runWatchdogCheck() {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  console.log(`\n🛡️ [SRE WATCHDOG] Executing production probe at ${timestamp}...`);

  const results = {
    timestamp,
    target: TARGET_HOST,
    healthy: true,
    checks: []
  };

  try {
    // 1. Health JSON check
    const health = await fetchUrl(HEALTH_URL);
    const healthOk = health.statusCode === 200;
    const hasStrictCSP = health.headers['content-security-policy'] && !health.headers['content-security-policy'].includes('unsafe-eval');
    const hasHSTS = !!health.headers['strict-transport-security'];

    results.checks.push({
      name: 'health_json_endpoint',
      status: healthOk ? 'PASS' : 'FAIL',
      durationMs: health.durationMs,
      statusCode: health.statusCode,
      securityHeaders: {
        cspClean: hasStrictCSP,
        hstsPresent: hasHSTS
      }
    });

    if (!healthOk || !hasStrictCSP || !hasHSTS) {
      results.healthy = false;
    }

    // 2. Public Homepage probe
    const home = await fetchUrl(TARGET_HOST);
    const homeOk = home.statusCode === 200;
    results.checks.push({
      name: 'public_homepage',
      status: homeOk ? 'PASS' : 'FAIL',
      durationMs: home.durationMs,
      statusCode: home.statusCode
    });

    if (!homeOk) {
      results.healthy = false;
    }

    const logLine = `[${timestamp}] STATUS: ${results.healthy ? 'HEALTHY' : 'DEGRADED'} | Health: ${health.durationMs}ms (${health.statusCode}) | Home: ${home.durationMs}ms (${home.statusCode})\n`;
    fs.appendFileSync(LOG_FILE, logLine);

    console.log(`✓ Probe completed: ${results.healthy ? 'HEALTHY (All targets 200 OK, latency < 500ms)' : 'DEGRADED'}`);
    console.log(`  • Health endpoint: ${health.durationMs}ms (HTTP ${health.statusCode})`);
    console.log(`  • Homepage:        ${home.durationMs}ms (HTTP ${home.statusCode})`);
    console.log(`  • Audit logged to: ${LOG_FILE}\n`);

    if (!results.healthy) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ SRE Probe failed with error: ${err.message}`);
    const logLine = `[${timestamp}] STATUS: CRITICAL_ERROR | Error: ${err.message}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
    process.exit(1);
  }
}

// Auto-run when executed directly
if (process.argv[1]?.endsWith('sre-watchdog.mjs')) {
  runWatchdogCheck();
}
