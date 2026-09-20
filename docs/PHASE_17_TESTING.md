# Phase 17 — Testing

## Test Suite
- **File**: `tests/phase17-pwa-performance-a11y.test.mjs`
- **Scenarios**: 15

## Test Coverage

| # | Test | Category |
|---|------|----------|
| 1 | Manifest has required PWA fields | PWA |
| 2 | Service worker has versioned cache | PWA |
| 3 | SW never caches sensitive data | Security |
| 4 | NetworkStatus detects navigator.onLine | Offline |
| 5 | InstallPrompt detects standalone/beforeinstallprompt | PWA |
| 6 | Error boundaries exist for all route groups | UX |
| 7 | Error boundaries use role=alert, no stack exposure | A11y/Security |
| 8 | Root layout has skip-to-content and main-content | A11y |
| 9 | CSS has focus-visible, touch targets, reduced-motion | A11y/Mobile |
| 10 | Push migration has RLS and tenant isolation | Security |
| 11 | Push library never exposes VAPID private key | Security |
| 12 | No hardcoded API keys in settings page | Security |
| 13 | Web vitals module exports without PII | Performance |
| 14 | Print styles exclude PWA elements | Print Safety |
| 15 | Static export mode preserved | Cloudflare |

## Running Tests
```bash
npm test                    # All tests (154 previous + 15 Phase 17)
npm run typecheck           # TypeScript verification
npx eslint . --quiet        # Lint verification
npm run build               # Build verification
```
