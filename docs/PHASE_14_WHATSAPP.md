# Phase 14: Meta WhatsApp Business Cloud API Specification

## 1. Official Architecture
- **Adapter**: `MetaWhatsAppAdapter` (`lib/notifications/adapters/whatsapp-adapter.ts`).
- **Endpoint**: Meta Graph API `https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages`.
- **Authentication**: Bearer System User Token.
- **Messaging Model**: Pre-approved Highly Structured Message (HSM) templates.

## 2. HSM Template Compliance
- Only official WhatsApp templates approved by Meta Business Manager are dispatched.
- Marketing broadcasts are strictly segregated from transactional notifications.
- Inbound status webhooks (`messages`, `statuses`: `sent`, `delivered`, `read`, `failed`) are mapped in `WebhookProcessor`.
