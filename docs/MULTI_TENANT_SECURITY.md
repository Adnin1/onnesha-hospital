# MULTI-TENANT DATA ISOLATION & CONTEXT ARCHITECTURE
**Project:** Onnesha Hospital Management System (OHMS)  
**Security Level:** Zero Cross-Tenant Data Leakage  

---

## 1. Multi-Tenant Architectural Model

```
[Incoming Request]
        │
        ▼
[Supabase Auth JWT Token] ──► Extracts user_id
        │
        ▼
[profiles & user_roles Query] ──► Resolves active organization_id
        │
        ▼
[PostgreSQL Session Variable Injection]
SET LOCAL app.current_organization_id = '<user-active-organization-uuid>';
        │
        ▼
[PostgreSQL Row Level Security (RLS) Engine]
WHERE organization_id = get_current_org_id()
```

---

## 2. Hardened Isolation Guarantees
1. **Never Trust Client Parameter:** The client browser cannot pass `organization_id` as a trusted query parameter to bypass boundaries. The active tenant is **always derived on the server** from the authenticated user's session record in `user_roles`.
2. **PostgreSQL RLS Kernel Enforcement:** Every query against tenant tables (`patients`, `patient_visits`, `invoices`, `payments`, `beds`, `medicines`, etc.) is intercepted by PostgreSQL RLS. If a user from Hospital A attempts to execute `SELECT * FROM patients WHERE id = '<hospital-B-patient-id>'`, PostgreSQL returns **0 rows**.
3. **Multi-Organization Membership:** Users with access to multiple hospital branches switch organizations via a dedicated server action that validates active membership in `user_roles` before updating session context.
