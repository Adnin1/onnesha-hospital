# OHMS Runtime Diagnostics, Alerts & Expense Voucher Runbook

## Purpose and scope

OHMS uses two separate mechanisms:

1. **Interactive runtime capture** inside an authenticated hospital app session. The browser monitor observes otherwise-unhandled JavaScript errors and unhandled promise rejections, and explicitly instrumented server/database mutations can report a failed operation.
2. **Scheduled production health checks** through GitHub Actions. The scheduled workflow checks selected public routes and invokes the configured database diagnostic checks for each organization.

Neither mechanism can detect every conceivable bug. Browser listeners do not capture every handled `{ success: false }` result unless the relevant action reports it; health checks only detect the invariants implemented in the diagnostic function; route HTTP 200 does not prove that a protected workflow works. Critical business actions therefore need explicit error instrumentation and regression tests.

## State and operator behavior

- A health RPC error, null response, malformed response, missing authenticated organization or authorization mismatch must appear as an unavailable/degraded state, never as a confirmed healthy 100/100 result.
- An interactive error may be shown locally immediately while its database incident write is pending.
- The local event is replaced by its persisted record only after the incident logger confirms a durable incident ID.
- A failed incident write must remain visible in the current page and must be investigated; it cannot be represented as durable/persisted.
- Dismissing or hiding a banner must not delete or resolve the incident. The unresolved alert stays visible until the stored incident is resolved or the underlying health finding no longer exists on a successful rescan.
- A computed finding such as an unbalanced journal cannot be manually “solved” by changing its alert status. Correct the underlying transaction/data, then rescan.
- A persisted runtime incident can be acknowledged by an authorized user only by its exact incident ID. Module-wide resolution without an ID is rejected to avoid silently clearing unrelated failures.
- “Issue solved” is shown only after an exact incident was resolved and a follow-up health read confirms that incident is no longer active. If other health problems remain, the UI must say so rather than claiming that the entire system is healthy.

## Production scheduled monitoring

Workflow: `.github/workflows/ohms-production-monitor.yml`

Script: `scripts/monitor-production.mjs`

Cadence: every five minutes plus manual workflow dispatch, after the workflow has been merged into the default branch and enabled by GitHub Actions.

Required GitHub repository secrets:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — private Actions secret only; never a `NEXT_PUBLIC_*` variable and never browser code.
- `OHMS_ALERT_WEBHOOK_URL` — required for notifications outside GitHub Actions. Until configured, a failed run is visible in Actions and its step summary, but independent webhook delivery is blocked.

The service-role key bypasses Supabase RLS; it must never be exposed in client bundles, issue details, screenshots, or logs. Restrict repository and secret access to trusted maintainers. Rotate the key if it has ever been pasted into chat, committed, or exposed to a public build.

Workflow evidence is not complete until the workflow is merged, the secrets are configured, an on-demand run succeeds against a safe environment, and a synthetic alert proves the outbound channel. A passing scheduled job is a periodic monitor, not a guarantee that every possible operational defect is detected.

## Expense voucher behavior

The expense page performs a **void** operation, not an unconditional hard delete.

- Draft/unposted records with no linked posted journal may be voided.
- A posted voucher must preserve the original posted journal. The void RPC verifies organization ownership, accounting permission, source journal state, balanced headers and lines, and account ownership. It creates a separate balanced reversing journal, posts it, marks the source journal as reversed, and marks the voucher voided in the same transaction.
- The same voucher is idempotent: an already-voided voucher does not generate another reversal.
- If the source journal is missing, malformed, unbalanced, from another tenant, already reversed, or inconsistent with a previous reversal, the RPC fails closed and the user must reconcile it instead of retrying blindly.
- The client verifies the stored expense status after the RPC and never trusts a success-shaped transport response alone.
- Voided vouchers remain in the database audit trail and can be selected using the “Voided history” filter.

Do not delete posted journals or journal lines to silence an immutability error. Use the approved reversal/credit/adjustment process and retain the reason and audit metadata.

## How to operate the monitor

1. Sign in to OHMS and open `/app/system-health`.
2. Use the rescan action and inspect the issue's severity, module, location, reason, timestamp and recommendation.
3. For database/ledger findings, correct the source record through its proper authorized workflow. Rescan afterward.
4. For persisted runtime incidents, resolve the exact incident only after the underlying failure has been corrected. Check that the follow-up scan no longer lists it.
5. Open GitHub Actions → **OHMS Production Monitor** to inspect five-minute checks, step summaries and failures.
6. For independent alerts, configure `OHMS_ALERT_WEBHOOK_URL` and test it with a controlled synthetic event. Do not include patient identifiers or secrets in test messages.
7. When a health check fails but no specific invariant is emitted, treat the result as UNKNOWN/degraded and investigate the RPC or test coverage. Never convert the missing explanation into a green state.

## Verification required before production release

Before merging/deploying the related migration and UI:

- Run `npm run typecheck`, `npm run lint`, targeted regression tests, `npm test`, `npm run build`, `npx supabase db push --dry-run` and `npx supabase db lint --linked` where supported by configured credentials.
- Review the complete migration against the current live table/function schema and confirm a recoverable backup is available.
- Verify a service-role scheduled diagnostic call using an explicitly supplied valid organization, and verify anonymous callers cannot obtain private health findings or a false green state.
- In isolated staging with synthetic data, test: eligible draft void; posted voucher void with balanced reversal; repeat void; missing journal; unbalanced source; wrong-tenant request; unauthorized user; audit write failure; and post-void persistence.
- Verify alerts for: null RPC response, malformed result, network error, handled action failure, unhandled browser error, rejected promise, failed durable write, and successful verified resolution.
- Verify GitHub CI against the exact merge SHA. Only deploy the reviewed SHA after required gates pass.
- Never use a real patient, real paid voucher or production ledger record as disposable regression data.

## Limitations and future coverage

The scheduled monitor currently evaluates selected URL reachability and the database checks represented by `check_system_health_diagnostics`. It does not execute real login, patient registration, billing, laboratory, pharmacy, printer or payment workflows. Those need isolated staging users, synthetic data and explicit end-to-end acceptance tests.

A static-export Cloudflare deployment cannot itself run a permanent server process. Scheduled background checking therefore runs outside the browser through GitHub Actions; near-real-time checks in the hospital UI run only while a staff user has an active session/page open. A fifth-minute schedule gives periodic monitoring, not instantaneous server-side observation of every database event.

Any dashboard score must reflect only checks that actually ran. Report absent credentials, unexecuted checks, unavailable integrations and hardware commissioning as UNKNOWN / NOT_RUN / BLOCKED_EXTERNAL_OWNER—not PASS.
