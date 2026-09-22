/// <reference lib="webworker" />

const CACHE_VERSION = 'ohms-static-v5';
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

// Sensitive query parameter keys that MUST bypass cache completely
const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'code',
  'state',
  'session',
  'auth',
  'api_key',
  'key',
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
  /notification/i,
];

function shouldNeverCache(requestOrUrl) {
  try {
    const url = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
    // Check Authorization header if request object is supplied
    if (typeof requestOrUrl === 'object' && requestOrUrl.headers) {
      if (requestOrUrl.headers.has('authorization') || requestOrUrl.headers.get('authorization')) {
        return true;
      }
    }

    const parsed = new URL(url);
    const cleanPath = parsed.pathname.replace(/\/$/, '') || '/';
    // Check exact auth paths first
    if (NEVER_CACHE_EXACT_PATHS.has(cleanPath)) return true;

    // Check for sensitive query parameters
    for (const param of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_PARAMS.has(param.toLowerCase())) return true;
    }

    const urlStr = url.toString();
    return NEVER_CACHE_PATTERNS.some(pattern => pattern.test(urlStr));
  } catch {
    return true; // If URL parsing fails, default to network-only
  }
}

function isResponseCacheable(response) {
  if (!response || !response.ok) return false;
  const cc = response.headers ? response.headers.get('Cache-Control') : null;
  if (cc) {
    const lower = cc.toLowerCase();
    if (lower.includes('no-store') || lower.includes('private') || lower.includes('no-cache')) {
      return false;
    }
  }
  return true;
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
  if (shouldNeverCache(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(request.url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok && isResponseCacheable(response)) {
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
        if (response.ok && !shouldNeverCache(request) && isResponseCacheable(response)) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
  );
});
