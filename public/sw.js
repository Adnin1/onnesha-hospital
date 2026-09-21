/// <reference lib="webworker" />

const CACHE_VERSION = 'ohms-static-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Explicit auth/private page paths — network-only, NEVER cached
// These are checked first before pattern matching to prevent any accidental caching
const NEVER_CACHE_EXACT_PATHS = new Set([
  '/login',
  '/mfa',
  '/forgot-password',
  '/reset-password',
  '/auth',
]);

// Paths that must NEVER be cached (clinical, financial, private, and all authenticated app routes)
const NEVER_CACHE_PATTERNS = [
  /\/app(\/|$)/,
  /\/api\//,
  /supabase\.co/,
  /\.supabase\./,
  /\/auth(\/|$)/,
  /patient/i,
  /prescription/i,
  /diagnosis/i,
  /invoice/i,
  /payment/i,
  /billing/i,
  /clinical/i,
  /\/lab(\/|$)/,
  /pharmacy/i,
  /payroll/i,
  /\/audit(\/|$)/,
  /\/hr(\/|$)/,
  /notification/i,
];

function shouldNeverCache(url) {
  try {
    const parsed = new URL(url);
    const cleanPath = parsed.pathname.replace(/\/$/, '') || '/';
    // Check exact auth paths first
    if (NEVER_CACHE_EXACT_PATHS.has(cleanPath)) return true;
    const urlStr = url.toString();
    return NEVER_CACHE_PATTERNS.some(pattern => pattern.test(urlStr));
  } catch {
    return true; // If URL parsing fails, default to network-only
  }
}

function isStaticAsset(url) {
  const path = new URL(url).pathname;
  return (
    path.startsWith('/_next/static/') ||
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.woff2') ||
    path.endsWith('.woff') ||
    path.endsWith('.png') ||
    path.endsWith('.ico') ||
    path.endsWith('.svg') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp')
  );
}

// Install: pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for API/dynamic, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== 'GET') return;

  // NEVER cache sensitive data
  if (shouldNeverCache(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(request.url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && !shouldNeverCache(request.url)) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
  );
});
