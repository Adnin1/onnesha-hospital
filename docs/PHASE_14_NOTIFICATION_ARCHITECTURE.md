# Phase 14: Enterprise Notification Architecture

## 1. Overview
The Onnesha Hospital Management System (OHMS) notification infrastructure follows the **Transactional Outbox Pattern** to ensure zero notification loss, multi-tenant isolation, idempotency, and strict Patient Health Information (PHI) privacy.

## 2. Notification Pipeline
```
[Clinical / Financial Event]
           ↓
[Template Engine (EN/BN)] ──> Strict PHI Guardrail (No clinical diagnoses / lab values)
           ↓
[Patient Notification Preference Check]
           ↓
[Transactional Outbox (`notification_outbox`)] (Unique Idempotency Key)
           ↓
[Outbox Dispatcher Service]
   ├── SMS Adapter (SSL Wireless / Greenweb / Elitbuzz)
   ├── WhatsApp Business Cloud Adapter (Meta Graph API v19.0)
   └── Email Adapter (Resend / SendGrid)
           ↓
[Provider Webhook / DLR Callback] ──> Status: SENT → DELIVERED / FAILED
```

## 3. Database Schema
- **`notification_outbox`**: Stores pending, processing, sent, and delivered notifications.
- **`notification_templates`**: Bilingual templates (Bangla and English) with strict variable placeholders.
- **`notification_preferences`**: Patient opt-in/opt-out consent (`sms_consent`, `whatsapp_consent`, `email_consent`).

## 4. Invariants
- **Downstream Decoupling**: A failure in sending an SMS, WhatsApp message, or Email will **never** rollback or corrupt an appointment, payment, invoice, or admission.
- **Fail-Closed**: If a provider is not configured with valid merchant credentials in `organization_integrations`, it transitions to `FAILED` with explicit reason `READY FOR CONFIGURATION`.
- **Zero Mock**: No fake notification delivery.
