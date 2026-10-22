import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync("lib/auth/session.ts", "utf8");
const server = fs.readFileSync("lib/auth/server-session.ts", "utf8");
const m257 = fs.readFileSync(
  "supabase/migrations/20261022202233_migration_257_authoritative_tenant_scoped_rbac_permission_revocation.sql",
  "utf8"
);
const m258 = fs.readFileSync(
  "supabase/migrations/20261022202320_migration_258_permission_authoritative_rpc_and_anon_grant_hardening.sql",
  "utf8"
);

test("authoritative empty permission set is not repopulated from defaults", () => {
  assert.match(client, /authoritativePermissionsLoaded = true/);
  assert.match(client, /permissions\.size === 0 && !authoritativePermissionsLoaded/);
  assert.match(client, /Session permissions are authoritative\. An empty list is an intentional deny-all state/);

  assert.match(server, /authoritativePermissionsLoaded = true/);
  assert.match(server, /permissionSet\.size === 0 && !authoritativePermissionsLoaded/);
});

test("migration 257 removes legacy global metadata policies and validates tenant membership", () => {
  assert.match(m257, /drop policy if exists rls_roles on public\.roles/i);
  assert.match(m257, /drop policy if exists rls_role_permissions on public\.role_permissions/i);
  assert.match(m257, /403 Forbidden: cross-tenant organization context/);
  assert.match(m257, /set search_path = ''/i);
});

test("receptionist access is permission-driven instead of role-hardcoded", () => {
  assert.doesNotMatch(m257, /ARRAY\[[^\]]*'receptionist'/i);
  assert.doesNotMatch(m258, /'receptionist'/i);
  assert.match(m258, /Caller lacks configured referral\/billing authority/);
});

test("anonymous roles, role_permissions and expenses table grants are revoked", () => {
  assert.match(m258, /revoke all privileges on table public\.roles from anon/i);
  assert.match(m258, /revoke all privileges on table public\.role_permissions from anon/i);
  assert.match(m258, /revoke all privileges on table public\.expenses from anon/i);
});
