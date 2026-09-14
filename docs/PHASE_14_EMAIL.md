# Phase 14: Transactional Email Specification

## 1. Supported Providers
- **Resend** (`https://api.resend.com/emails`)
- **SendGrid**

## 2. Deliverability & Security
- **HTML Sanitization**: All variable interpolations undergo HTML entity encoding to prevent stored or reflected XSS attacks.
- **Controlled Document Access**: Diagnostic reports and financial bills are referenced via authenticated patient portal links (`https://hospital.local/portal/invoices/...`) rather than unencrypted public PDF attachments.
- **SPF/DKIM/DMARC**: Requires verified sender domain authentication in production before activation.
