# AUDIT LOGGING ARCHITECTURE & FORENSIC SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  
**Standard:** HIPAA & Bangladesh Medical Practice Forensic Integrity  

---

## 1. Overview
The OHMS Audit Logging system guarantees non-repudiation, traceability, and tamper-resistant logging across all tenant hospitals. Audit records are written immutably to the `audit_logs` table.

---

## 2. Core Audit Fields

Every audit log entry captures:
- `id`: UUID Primary Key (auto-generated)
- `organization_id`: Hospital tenant context (UUID)
- `actor_user_id`: Authenticated user UUID performing the action (NULL for failed logins)
- `action`: Standardized dot/colon action identifier (e.g., `auth:login`, `patient:create`, `billing:refund`)
- `entity_type`: Target domain object (`patient`, `invoice`, `medical_record`, `role`, `user`)
- `entity_id`: Primary key of the affected entity
- `request_id`: Tracing correlation ID (`lib/correlation/tracer.ts`)
- `metadata`: JSONB payload capturing non-PHI contextual details (e.g., IP address, user agent, change reason)
- `before_data`: State prior to mutation (where applicable)
- `after_data`: State after mutation (where applicable)
- `created_at`: Immutable timestamp (PostgreSQL default `NOW()`)

---

## 3. Audited Event Categories

### 3.1 Authentication & User Lifecycle
- `auth:login` (Successful sign-in)
- `auth:logout` (Staff sign-out)
- `auth:failed_login` (Failed attempt with IP address and attempted email)
- `auth:password_reset_request` (Password reset email dispatch)
- `user:create` (Staff account creation)
- `user:disable` (Staff account deactivation)
- `user:role_change` (Staff role reassignment)

### 3.2 Clinical Operations
- `patient:create` (Patient master record creation)
- `patient:update` (Demographic or contact modification)
- `patient:archive` (Soft deletion / archival)
- `opd:consultation_complete` (Doctor consultation closure)
- `prescription:sign` (Electronic prescription generation)

### 3.3 Financial Mutations
- `billing:invoice_create` (New invoice generation)
- `billing:discount_apply` (Discount approved with reason)
- `billing:refund` (Refund authorization with manager sign-off)
- `billing:void` (Erroneous invoice cancellation)

### 3.4 File & Storage Access
- `file:view` (Signed URL generation for document viewing)
- `file:download` (Signed URL generation for document export)
- `file:archive` (File deactivation)

---

## 4. Privacy & PHI Protection Rule

> [!CAUTION]
> Audit logs must **NEVER** record plain-text Protected Health Information (PHI) such as clinical diagnosis narratives, patient passwords, payment card numbers, or national identification numbers. The `entity_id` reference provides linkage without polluting audit streams with sensitive data.

---

## 5. Implementation Code Reference
Audit logging is centralized in [`lib/audit/logger.ts`](../lib/audit/logger.ts) and enforced across Server Actions.
