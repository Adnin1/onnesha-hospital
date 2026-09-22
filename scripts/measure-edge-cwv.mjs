import { chromium } from 'playwright';

const routes = [
  '/',
  '/doctors',
  '/services',
  '/appointment',
  '/check-token',
  '/contact',
  '/login'
];

const baseUrl = 'https://onnesha-hospital.pages.dev';

async function measureRoute(browser, route) {
  const page = await browser.newPage();
  
  // Inject web-vitals measurement observer before load
  await page.addInitScript(() => {
    window.__metrics = {
      cls: 0,
      lcp: 0,
      fcp: 0,
      ttfb: 0
    };

    // TTFB & Navigation timing
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        window.__metrics.ttfb = navEntries[0].responseStart;
      }
    } catch {}

    // FCP
    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            window.__metrics.fcp = entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
    } catch {}

    // LCP
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          window.__metrics.lcp = lastEntry.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // CLS
    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__metrics.cls += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  const url = `${baseUrl}${route}`;
  const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000); // Allow LCP and CLS to register

  const metrics = await page.evaluate(() => {
    // If navigation entry was finalized after init
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      window.__metrics.ttfb = navEntries[0].responseStart;
    }
    return window.__metrics;
  });

  const status = response ? response.status() : 0;
  await page.close();

  return {
    route,
    status,
    ttfb: Math.round(metrics.ttfb),
    fcp: Math.round(metrics.fcp),
    lcp: Math.round(metrics.lcp),
    cls: parseFloat(metrics.cls.toFixed(4))
  };
}

async function main() {
  console.log('========================================================================');
  console.log('REAL BROWSER CORE WEB VITALS (CWV) & RUNTIME LATENCY MEASUREMENT');
  console.log(`Environment: PRODUCTION EDGE (${baseUrl})`);
  console.log('Standard: Google Web Vitals (LCP <= 2.5s, CLS <= 0.1, FCP <= 1.8s)');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of routes) {
    try {
      const data = await measureRoute(browser, route);
      results.push(data);
      const lcpOk = data.lcp <= 2500 ? 'GOOD' : 'POOR';
      const clsOk = data.cls <= 0.1 ? 'GOOD' : 'POOR';
      console.log(`Route: ${data.route.padEnd(16)} | HTTP ${data.status} | TTFB: ${data.ttfb}ms | FCP: ${data.fcp}ms | LCP: ${data.lcp}ms [${lcpOk}] | CLS: ${data.cls} [${clsOk}]`);
    } catch (err) {
      console.error(`Route: ${route.padEnd(16)} | ERROR: ${err.message}`);
    }
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log('SUMMARY TABLE:');
  console.table(results);
  console.log('========================================================================');
}

main().catch(err => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
