# FINAL SECURITY MODEL

## Multi-Tenant RLS & RBAC
- **Multi-Tenancy**: Postgres Row Level Security (RLS) policies enforce `organization_id` matching on all queries.
- **RBAC**: Strict role-based access control (Admin, Doctor, Nurse, Pharmacist, Lab Tech, Receptionist).
- **Audit Vault**: All critical actions (billing voids, patient records modifications) are written to a tamper-evident audit log table.
- **Data Protection**: Encryption at rest for PHI (Patient Health Information).
