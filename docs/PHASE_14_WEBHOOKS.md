# Phase 14: Webhooks & Signature Verification Specification

## 1. Webhook Security Invariants
- **Cryptographic Signatures**: Constant-time `crypto.timingSafeEqual` HMAC-SHA256 signature verification (`WebhookSecurity.verifyHmacSha256`).
- **Replay Protection**: Strict 300-second timestamp drift tolerance window (`WebhookSecurity.isTimestampValid`).
- **Deduplication**: Inbound webhooks log to `webhook_events` with partial unique index on `(provider, provider_event_id)`. Duplicate webhook deliveries are safely acknowledged as duplicates without side effects.
- **Session Independence**: Webhooks execute on public endpoints without dependency on browser cookies or active user sessions.
