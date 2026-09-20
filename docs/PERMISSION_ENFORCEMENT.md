# OHMS Permission Enforcement Guide

This document details the multi-layered authorization and permission enforcement patterns applied across Onnesha Hospital Management System (OHMS).

---

## 1. Multi-Layered Enforcement Architecture

In OHMS, permission enforcement follows a defense-in-depth model across three tiers:
1. **Network / Edge Tier (`proxy.ts` / Next.js middleware)**: Validates session presence and redirects unauthenticated requests away from protected `/app/*` routes.
2. **Server Execution Tier (Server Actions & Server Components)**: Cryptographically verifies caller identity, fetches permissions directly from Supabase, and aborts execution if required permissions are missing.
3. **Database Tier (PostgreSQL RLS)**: Row-Level Security policies ensure that even if application-level checks fail, queries cannot read or mutate records outside the user's hospital organization or role scope.

---

## 2. Server-Side Permission Assertions

All server assertions are centralized in `lib/auth/session.ts`:

### 2.1 Route & Action Gatekeeper (`requirePermission`)

Used in Server Actions, Route Handlers, and Server Components before any data access:

```typescript
import { requirePermission } from '@/lib/auth/session';

export async function dischargePatientAction(patientId: string) {
  // Throws an Error if caller lacks the permission or has no active session
  const session = await requirePermission('patients:discharge');
  
  // Proceed with discharge logic knowing session and role are verified
  ...
}
```

### 2.2 Non-throwing Check (`hasPermission`)

Used for conditional rendering in Server Components or branch logic:

```typescript
import { hasPermission } from '@/lib/auth/session';

export default async function BillingDashboard() {
  const canRefund = await hasPermission('billing:refund');
  
  return (
    <div>
      {canRefund && <RefundBatchButton />}
    </div>
  );
}
```

---

## 3. Client Component Enforcement & UI State

Client-side permission checks are treated as **purely cosmetic UX conveniences**. 
- Hiding or disabling buttons on the client prevents accidental user friction.
- The actual security boundary is always enforced by the corresponding Server Action.

```tsx
// Pattern for client UI components
'use client';

interface ActionProps {
  canEdit: boolean;
  onEdit: () => void;
}

export function ActionMenu({ canEdit, onEdit }: ActionProps) {
  if (!canEdit) return null; // Or render disabled state with tooltip

  return (
    <button onClick={onEdit} className="btn-primary">
      Edit Record
    </button>
  );
}
```

---

## 4. Permission Resolution Workflow

```
[ Incoming Request ]
         │
         ▼
[ proxy.ts ] ─── Missing Session? ───► Redirect to /login
         │
         ▼
[ Server Component / Action ]
         │
         ▼
[ requirePermission(key) ]
         │
         ├── Fetch User Profile & Role from Supabase Auth & public.users
         ├── Query role_permissions for matched permission key
         └── Permission Denied? ───► Abort & throw Unauthorized
         │
         ▼
[ Database Query to Supabase ]
         │
         ▼
[ PostgreSQL RLS Policy ] ─── Tenant ID Mismatch? ───► Zero Rows / Abort
         │
         ▼
[ Return Data / Result to User ]
```

---

## 5. Audit Logging on Permission Checks

All mutating administrative, clinical, and financial actions log an immutable entry in the `audit_logs` table via `lib/audit/logger.ts`:
- Actor User ID & Role
- Hospital Organization ID
- Action Key (e.g. `auth:login`, `patient:discharge`, `billing:refund`)
- IP Address and User Agent
- Timestamp & Mutation Delta
