# Operational Gate 7: Bangladesh SMS Gateway Production Configuration

## 1. Context & Purpose
OHMS sends automated clinical notifications, queue token alerts, appointment confirmations, lab report notifications, and billing receipts to patient mobile numbers (`01xxxxxxxxx` normalized to `8801xxxxxxxxx`).

---

## 2. Supported Bangladesh Telecom Gateways

| Provider Name | API Type | Sender ID Masking Support | Environment Variables |
| :--- | :--- | :--- | :--- |
| **SSL Wireless** | REST JSON (POST) | Yes (e.g. `ONNESHA`) | `SMS_PROVIDER="ssl_wireless"`<br>`SMS_API_KEY="<api_token>"`<br>`SMS_SENDER_ID="<sid>"` |
| **Greenweb BD** | HTTP POST Form | Yes | `SMS_PROVIDER="greenweb"`<br>`SMS_API_KEY="<token>"` |
| **Elitbuzz BD** | HTTP GET/POST | Yes | `SMS_PROVIDER="elitbuzz"`<br>`SMS_API_KEY="<key>"` |

---

## 3. Configuring Production Cloudflare Environment Variables
In Cloudflare Dashboard -> **Environment variables**:
```env
SMS_PROVIDER="ssl_wireless"
SMS_API_KEY="<YOUR_OFFICIAL_GATEWAY_TOKEN>"
SMS_SENDER_ID="ONNESHAHOSP"
SMS_GATEWAY_URL="https://smsplus.sslwireless.com/api/v3/send-sms"
```

The system automatically performs E.164 phone normalization, character count optimization, and fails closed safely if keys are absent or invalid.
