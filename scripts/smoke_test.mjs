const routes = [
  '/',
  '/login',
  '/appointment',
  '/doctors',
  '/check-token',
  '/services',
  '/about',
  '/contact',
  '/app/dashboard',
  '/app/billing',
  '/app/patients',
  '/app/appointments',
  '/app/ot',
  '/app/hr',
  '/app/settings'
];

const base = 'https://onnesha-hospital.pages.dev';

async function testRoutes() {
  console.log('Testing production routes on ' + base + ':\n');
  let passed = 0;
  for (const r of routes) {
    try {
      const res = await fetch(base + r, { redirect: 'manual' });
      const ok = res.status >= 200 && res.status < 400;
      console.log(`  [${ok ? '✓' : '✗'}] ${r.padEnd(20)} HTTP ${res.status}`);
      if (ok) passed++;
    } catch (e) {
      console.error(`  [✗] ${r.padEnd(20)} ERROR: ${e.message}`);
    }
  }
  console.log(`\nResult: ${passed}/${routes.length} production routes verified healthy.`);
  if (passed !== routes.length) process.exit(1);
}

testRoutes();
