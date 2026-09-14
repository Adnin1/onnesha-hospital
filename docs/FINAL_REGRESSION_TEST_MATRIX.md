# Onnesha Hospital Management System — Final Regression Test Matrix

This matrix documents regression safeguards built to prevent previously reported operational issues from recurring in production.

---

## 🛡️ Regression Safeguards Matrix

| Previous Complaint / Issue | Root Cause | Automated Regression Test | Verification File | Status |
|---|---|---|---|---|
| Admin login redirection loop / cookie mismatch | Hardcoded cookie name check in proxy | Session Security & AAL1/AAL2 test | `tests/auth/session-security.test.mjs` | RESOLVED & TESTED |
| Hardcoded SMS gateway API credentials | Pre-filled state values in form | Zero hardcoded secrets test | `tests/phase17-pwa-performance-a11y.test.mjs` | RESOLVED & TESTED |
| Doctor roster & schedule missing interactive controls | Read-only list view without modals | Doctor roster creation & publish action test | `tests/appointments.test.mjs` | RESOLVED & TESTED |
| Negative stock allowed in pharmacy POS | Missing batch level stock constraint | FEFO batch validation test | `tests/pharmacy.test.mjs` | RESOLVED & TESTED |
| Unverified invoice voids without audit reason | Silent status mutation | Server-authoritative void audit test | `tests/phase16-security-financial-clinical-audit.test.mjs` | RESOLVED & TESTED |
| Bed matrix double assignment on admission | Missing atomic transaction guard | Atomic bed release/occupy test | `tests/integration/emergency-and-bed.test.mjs` | RESOLVED & TESTED |
| Misleading test taxonomy claiming static checks as E2E | Unclear test suite reporting | Playwright E2E browser suite integration | `playwright.config.ts`, `tests/browser/*` | RESOLVED & TESTED |
