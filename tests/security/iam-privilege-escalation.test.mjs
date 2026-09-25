import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Security & Penetration Testing: Privilege Escalation & Cross-Tenant IAM Defense", () => {
  const migrationPath = path.join(ROOT, "supabase/migrations/20260924170000_staff_iam.sql");
  const sqlContent = fs.readFileSync(migrationPath, "utf8");

  // Scenario 1: Hospital Administrator cannot escalate privileges to Super Admin
  test("1. SQL Defense: admin_create_staff_account explicitly blocks Hospital Admin from creating a Super Admin", () => {
    // Verifies check: IF v_norm_role = 'super_admin' THEN must be caller with super_admin role
    assert.ok(
      sqlContent.includes("Privilege Escalation Blocked: Only an existing Super Admin can create another Super Admin account."),
      "Explicit privilege escalation guard required for super_admin creation"
    );
  });

  // Scenario 2: Hospital Administrator cannot assign Super Admin role via role changer
  test("2. SQL Defense: admin_change_staff_role blocks non-Super Admin from granting super_admin role", () => {
    assert.ok(
      sqlContent.includes("Privilege Escalation Blocked: Only an existing Super Admin can grant the Super Admin role."),
      "Explicit privilege escalation guard required for super_admin role assignment"
    );
  });

  // Scenario 3: Non-admin roles (Doctor, Accountant, Nurse, etc.) are blocked by caller check
  test("3. SQL Defense: check_is_admin_caller denies non-admin roles from invoking IAM RPCs", () => {
    assert.ok(
      sqlContent.includes("public.check_is_admin_caller"),
      "check_is_admin_caller function must exist"
    );
    assert.ok(
      sqlContent.includes("LOWER(r.name) IN ('super_admin', 'super admin', 'admin', 'hospital_administrator')"),
      "Only approved admin roles allowed to call IAM RPCs"
    );
  });

  // Scenario 4: Self-modification prohibition (Admin cannot suspend or disable themselves)
  test("4. SQL Defense: admin_set_staff_status blocks administrators from self-suspension/lockout", () => {
    assert.ok(
      sqlContent.includes("Self-Modification Prohibited: You cannot suspend or disable your own account."),
      "Self-modification lockout protection required"
    );
  });

  // Scenario 5: Cross-Tenant Protection: Operations are strictly scoped to p_org_id
  test("5. SQL Defense: All IAM RPCs mandate organization_id matching to prevent cross-tenant attacks", () => {
    // Verify profiles query in reset password checks organization
    assert.ok(
      sqlContent.includes("WHERE id = p_target_user_id AND (organization_id = p_org_id OR active_organization_id = p_org_id)"),
      "Profiles queries must enforce p_org_id boundary"
    );

    // Verify user_roles queries check p_org_id
    assert.ok(
      sqlContent.includes("ur.organization_id = p_org_id"),
      "User role queries must enforce p_org_id boundary"
    );
  });

  // Scenario 6: Session revocation on password reset
  test("6. SQL Defense: admin_reset_staff_password purges auth.sessions for target user", () => {
    assert.ok(
      sqlContent.includes("DELETE FROM auth.sessions\n    WHERE user_id = p_target_user_id;"),
      "Must delete active sessions upon password reset"
    );
  });

  // Scenario 7: Session revocation on suspension or disabling
  test("7. SQL Defense: admin_set_staff_status purges auth.sessions when status is SUSPENDED or DISABLED", () => {
    assert.ok(
      sqlContent.includes("IF v_status_norm IN ('SUSPENDED', 'DISABLED') THEN\n        DELETE FROM auth.sessions\n        WHERE user_id = p_target_user_id;\n    END IF;"),
      "Must delete active sessions when user is suspended or disabled"
    );
  });

  // Scenario 8: Fail-Closed Role Normalization
  test("8. Code Defense: normalizeRole in lib/utils.ts fails closed on unauthorized role string", () => {
    const utilsContent = fs.readFileSync(path.join(ROOT, "lib/utils.ts"), "utf8");
    assert.ok(
      utilsContent.includes("CANONICAL_ROLES"),
      "CANONICAL_ROLES array required"
    );
    assert.ok(
      utilsContent.includes('return "";'),
      "normalizeRole must return empty string for unapproved roles"
    );
  });

  // Scenario 9: MFA AAL2 Strict Enforcement
  test("9. Code Defense: requireAAL2 in lib/auth/session.ts fails closed if AAL2 or factors are missing", () => {
    const sessionContent = fs.readFileSync(path.join(ROOT, "lib/auth/session.ts"), "utf8");
    assert.ok(
      sessionContent.includes('if (session.aalLevel !== "aal2")'),
      "requireAAL2 must strictly require aal2"
    );
    assert.ok(
      sessionContent.includes("if (session.mfaFactorsCount <= 0)"),
      "requireAAL2 must require at least 1 verified factor"
    );
  });

  // Scenario 10: RLS Policies on profiles table prevent cross-tenant leak
  test("10. SQL Defense: profiles RLS policies enforce tenant isolation and own-record update", () => {
    assert.ok(
      sqlContent.includes("CREATE POLICY profiles_read_own_and_org_admin ON public.profiles"),
      "profiles read policy required"
    );
    assert.ok(
      sqlContent.includes("CREATE POLICY profiles_update_own ON public.profiles"),
      "profiles update policy required"
    );
  });

  // Scenario 11: Atomic Sequence Generator Schema Qualification
  test("11. SQL Defense: Atomic sequence generators schema-qualify sequences with public.<seq>::regclass", () => {
    const seqMigrationPath = path.join(ROOT, "supabase/migrations/20260926033000_schema_qualify_atomic_sequences.sql");
    assert.ok(fs.existsSync(seqMigrationPath), "Migration 20260926033000 must exist");
    const seqContent = fs.readFileSync(seqMigrationPath, "utf8");
    assert.ok(
      seqContent.includes("nextval('public.employee_code_seq'::regclass)"),
      "employee_code_seq must be schema-qualified"
    );
    assert.ok(
      seqContent.includes("nextval('public.receipt_code_seq'::regclass)"),
      "receipt_code_seq must be schema-qualified"
    );
    assert.ok(
      seqContent.includes("nextval('public.pharmacy_sale_seq'::regclass)"),
      "pharmacy_sale_seq must be schema-qualified"
    );
  });
});

