/**
 * Lightweight Core Web Vitals measurement.
 * Collects LCP, CLS, INP with anonymous route-only context.
 * NEVER attaches patient names, NID, diagnosis, or any PII.
 */

type WebVitalMetric = {
  name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  route: string;
};

type ReportHandler = (metric: WebVitalMetric) => void;

function getRating(name: string, value: number): "good" | "needs-improvement" | "poor" {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    CLS: [0.1, 0.25],
    INP: [200, 500],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  };
  const [good, poor] = thresholds[name] || [Infinity, Infinity];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function getAnonymousRoute(): string {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname;
  // Strip any IDs or sensitive path segments
  return path.replace(/\/[0-9a-f-]{36}/g, "/[id]").replace(/\/\d+/g, "/[n]");
}

export function reportWebVitals(handler?: ReportHandler): void {
  if (typeof window === "undefined" || !window.PerformanceObserver) return;

  const report = handler || ((m: WebVitalMetric) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[WebVital] ${m.name}: ${m.value.toFixed(m.name === "CLS" ? 4 : 0)} (${m.rating}) — ${m.route}`);
    }
  });

  // LCP
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        report({ name: "LCP", value: last.startTime, rating: getRating("LCP", last.startTime), route: getAnonymousRoute() });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch { /* unsupported */ }

  // CLS
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const le = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!le.hadRecentInput && le.value) {
          clsValue += le.value;
        }
      }
      report({ name: "CLS", value: clsValue, rating: getRating("CLS", clsValue), route: getAnonymousRoute() });
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch { /* unsupported */ }
}
