import { chromium } from '@playwright/test';

const ROUTES = [
  '/',
  '/about',
  '/services',
  '/doctors',
  '/appointment',
  '/contact',
  '/downloads/desktop',
];

const BASE_URL = process.env.BASE_URL || 'https://onnesha-hospital.pages.dev';

async function measureRoute(page, url) {
  await page.addInitScript(() => {
    window.__webVitals = { lcp: 0, cls: 0 };
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) window.__webVitals.lcp = lastEntry.startTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__webVitals.cls += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Observer error handling
    }
  });

  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1000);

  const metrics = await page.evaluate(() => {
    const navEntries = performance.getEntriesByType('navigation');
    const nav = navEntries.length > 0 ? navEntries[0] : null;

    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(p => p.name === 'first-contentful-paint');

    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
      domInteractive: nav ? Math.round(nav.domInteractive) : 0,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : 0,
      lcp: Math.round(window.__webVitals?.lcp || fcpEntry?.startTime || 0),
      cls: Number((window.__webVitals?.cls || 0).toFixed(4)),
    };
  });

  metrics.totalTime = Date.now() - startTime;
  return metrics;
}

async function run() {
  console.log('='.repeat(70));
  console.log(`🚀 OHMS REAL CORE WEB VITALS MEASUREMENT`);
  console.log(`Target: ${BASE_URL}`);
  console.log('='.repeat(70));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OHMS-PerfBot',
  });

  const results = [];

  for (const route of ROUTES) {
    const page = await context.newPage();
    const fullUrl = `${BASE_URL}${route}`;
    try {
      const metrics = await measureRoute(page, fullUrl);
      results.push({ route, ...metrics, status: 'SUCCESS' });
      console.log(`✓ ${route.padEnd(20)} | TTFB: ${String(metrics.ttfb).padStart(4)}ms | FCP: ${String(metrics.fcp).padStart(4)}ms | LCP: ${String(metrics.lcp).padStart(4)}ms | CLS: ${metrics.cls}`);
    } catch (err) {
      console.error(`✗ ${route.padEnd(20)} | FAILED: ${err.message}`);
      results.push({ route, status: 'FAILED', error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('='.repeat(70));
  console.log('Core Web Vitals Thresholds (Good / Needs Improvement / Poor):');
  console.log('  • LCP: <= 2500ms (Good)  |  <= 4000ms (Needs Improvement)  |  > 4000ms (Poor)');
  console.log('  • FCP: <= 1800ms (Good)  |  <= 3000ms (Needs Improvement)  |  > 3000ms (Poor)');
  console.log('  • CLS: <= 0.100 (Good)   |  <= 0.250 (Needs Improvement)   |  > 0.250 (Poor)');
  console.log('='.repeat(70));

  const allGood = results.every(r => r.status === 'SUCCESS' && r.lcp <= 2500 && r.cls <= 0.1);
  console.log(`Overall Assessment: ${allGood ? '✅ ALL ROUTES MEET "GOOD" WEB VITALS' : '⚠️ SOME ROUTES REQUIRE OPTIMIZATION'}`);
}

run().catch(console.error);
