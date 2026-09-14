# Phase 17 — Push Notifications

## Architecture

### Database
- Table: `push_subscriptions` (Migration 026)
- Tenant-isolated via RLS (`organization_id` policy)
- Unique constraint on `endpoint`
- Indexes: `org_id`, `user_id`, `active subscriptions`

### Client Library (`lib/push/subscription.ts`)
- `subscribeToPush(organizationId, userId)` — Creates/upserts subscription
- `revokePushSubscription()` — Unsubscribes and marks revoked
- `getVapidPublicKey()` — Returns public key from env
- `SAFE_NOTIFICATION_TEMPLATES` — Pre-defined safe message templates

### Security Rules
1. VAPID public key: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (env only)
2. VAPID private key: Server-side only, NEVER in client code
3. Notification content: Generic safe messages only
4. **NEVER include in push notifications**:
   - Patient names, NID, diagnoses
   - Prescription contents, disease names
   - Invoice amounts, payment details
   - Lab results, pathology reports
5. Tenant isolation: All subscriptions scoped to `organization_id`
6. Consent: User must explicitly subscribe
7. Revocation: Clean unsubscribe + database update

### Environment Variables Required
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key (server-only, NOT NEXT_PUBLIC_)
```

### Status
- Foundation implemented (database + client library)
- Server-side push sending not yet implemented (requires Phase 18+ with actual VAPID key setup)
- No push notifications are currently being sent
