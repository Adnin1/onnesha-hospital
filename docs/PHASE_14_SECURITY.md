# Phase 14: Security, RLS & Financial Segregation

## 1. Multi-Tenant Row Level Security (RLS)
Every new table in Phase 14 enforces RLS policies checking `organization_id = get_current_org_id()`:
- `organization_integrations` (Admin/Finance only)
- `notification_outbox`
- `notification_preferences`
- `payment_intents`
- `webhook_events`
- `payment_reconciliations`

## 2. Zero-Leakage Credential Protection
- Provider secrets (`appSecret`, `storePassword`, `privateKey`, `accessToken`) are stored in `organization_integrations.encrypted_credentials` and are never serialized or returned to browser clients.
- Webhook endpoints accept raw payloads without exposing internal tenant keys.
- Application error messages return sanitized failure notices without exposing internal database stack traces or credentials.
