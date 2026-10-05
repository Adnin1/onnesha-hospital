import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CONFIG_PATH = path.join(process.cwd(), '.agents', 'fleet', 'fleet.config.json');

export async function runFleetHealthCheck() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Fleet config not found at ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  console.log(`\n🚢 [FLEET MANAGER] Orchestrating: ${config.fleet_name} (v${config.version})`);
  console.log(`----------------------------------------------------------------------`);

  const report = [];

  for (const svc of config.services) {
    console.log(`\n🔍 Checking Service: [${svc.name.toUpperCase()}] (${svc.role})...`);
    const serviceCwd = path.resolve(process.cwd(), svc.path);

    let status = 'PASS';
    let output = '';
    const start = Date.now();

    try {
      if (svc.health_check) {
        output = execSync(svc.health_check, { cwd: serviceCwd, encoding: 'utf8', stdio: 'pipe' });
      }
    } catch (err) {
      status = 'FAIL';
      output = err.message;
    }

    const duration = Date.now() - start;
    console.log(`  • Status:   ${status === 'PASS' ? '✅ HEALTHY' : '❌ UNHEALTHY'} (${duration}ms)`);
    console.log(`  • Role:     ${svc.role}`);
    console.log(`  • Declared: ${svc.status}`);

    report.push({
      name: svc.name,
      status,
      durationMs: duration,
      declaredStatus: svc.status
    });
  }

  console.log(`\n======================================================================`);
  console.log(`FLEET HEALTH MATRIX:`);
  console.log(`----------------------------------------------------------------------`);
  console.table(report);
  console.log(`✓ Fleet orchestration check complete.\n`);
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('fleet-manager.mjs')) {
  runFleetHealthCheck();
}
