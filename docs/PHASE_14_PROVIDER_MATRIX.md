# Phase 14: Provider Matrix

| Channel | Provider | Adapter | Sandbox | Production | Webhook | Signature | Retry | Idempotency | Refund | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SMS** | SSL Wireless | `BangladeshSmsAdapter` | Supported | Supported | Supported | Yes | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **SMS** | Greenweb BD | `BangladeshSmsAdapter` | Supported | Supported | Supported | N/A | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **SMS** | Elitbuzz | `BangladeshSmsAdapter` | Supported | Supported | Supported | N/A | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **WhatsApp** | Meta Cloud API | `MetaWhatsAppAdapter` | Supported | Supported | Supported | HMAC-SHA256 | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **Email** | Resend | `TransactionalEmailAdapter`| Supported | Supported | Supported | TLS/DKIM | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **Email** | SendGrid | `TransactionalEmailAdapter`| Supported | Supported | Supported | TLS/DKIM | Exponential | Yes | N/A | READY FOR CONFIGURATION |
| **Payment** | bKash | `BkashAdapter` | Tokenized Sandbox | PG Live | IPN | Token-bound | Handled | Yes | Yes | READY FOR CONFIGURATION |
| **Payment** | Nagad | `NagadAdapter` | PG Sandbox | PG Live | Callback | RSA/AES | Handled | Yes | Portal | READY FOR CONFIGURATION |
| **Payment** | SSLCommerz | `SslCommerzAdapter` | Sandbox | SecurePay | IPN/Order API | MD5 Hash | Handled | Yes | Yes | READY FOR CONFIGURATION |

*Note: In production paths, adapters fail closed safely if merchant credentials are unconfigured. Zero mock confirmation is permitted.*
