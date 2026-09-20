# Phase 14: Automated Testing & Verification Suite

## 1. Test Suite: `tests/phase14-notification-payment.test.mjs`
Covers 12 mission-critical scenarios:
1. Migration 023 schema verification (tables, RPC, RLS).
2. Permission matrix additions (`NOTIFICATIONS_VIEW`, `PAYMENTS_ONLINE_CREATE`, etc.).
3. Template engine Bangla Unicode rendering, variable substitution, and HTML escaping.
4. Outbox service idempotency and exponential retry backoff.
5. Bangladesh SMS adapter phone normalization and fail-closed validation.
6. Meta WhatsApp adapter Graph API compliance and phone normalization.
7. Transactional email adapter format validation and fail-closed check.
8. PaymentService server-side due amount enforcement.
9. bKash Tokenized adapter lifecycle (create, execute, refund).
10. Nagad and SSLCommerz payment adapter validation.
11. Webhook HMAC-SHA256 constant-time verification and replay protection.
12. Zero-mock scan on UI components (`OnlinePaymentModal`, reconciliation, settings).

## 2. Test Execution Command
```bash
node --test tests/phase14-notification-payment.test.mjs
```
Total Test Count: **134/134 passing across all 10 suites**.
