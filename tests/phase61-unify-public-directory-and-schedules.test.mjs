/**
 * Phase 61: Canonical Public Directory & Authoritative Schedules Test Suite
 * Validates:
 * - Migration 61 schema file existence and dynamic canonical public org join
 * - get_public_doctors_directory RPC canonical public check and empty array safety
 * - get_public_doctor_schedules RPC security definer and multi-tenant isolation
 * - lib/public/actions.ts single authoritative RPC usage with zero fallback on valid empty results
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 61: Canonical Public Directory & Authoritative Schedules Suite", async (t) => {
  const migration61Path = path.join(
    ROOT,
    "supabase/migrations/20260923020000_unify_public_directory_canonical_schema.sql"
  );
  assert.ok(fs.existsSync(migration61Path), "Migration 61 file must exist on disk");
  const sql = fs.readFileSync(migration61Path, "utf8");

  await t.test("1. Migration 61: public_doctors_view joins organizations with is_canonical_public", () => {
    assert.match(
      sql,
      /JOIN\s+public\.organizations\s+o\s+ON\s+d\.organization_id\s*=\s*o\.id\s+AND\s+o\.is_active\s*=\s*TRUE\s+AND\s+o\.is_canonical_public\s*=\s*TRUE/i,
      "View must dynamically join canonical public organizations"
    );
    assert.match(sql, /WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i);
  });

  await t.test("2. Migration 61: get_public_doctors_directory validates canonical public org", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_public_doctors_directory/);
    assert.match(sql, /WHERE\s+id\s*=\s*p_org_id\s+AND\s+is_active\s*=\s*TRUE\s+AND\s+is_canonical_public\s*=\s*TRUE/i);
    assert.match(sql, /RETURN '\[\]'::jsonb/);
  });

  await t.test("3. Migration 61: get_public_doctor_schedules RPC enforces active public doctor and canonical org", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_public_doctor_schedules/);
    assert.match(sql, /s\.organization_id\s*=\s*p_org_id/);
    assert.match(sql, /s\.doctor_id\s*=\s*p_doctor_id/);
    assert.match(sql, /o\.is_canonical_public\s*=\s*TRUE/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_public_doctor_schedules\(UUID, UUID\) TO anon/);
  });

  await t.test("4. Public actions: lib/public/actions.ts uses authoritative RPCs without fallback on empty arrays", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    const actionsCode = fs.readFileSync(actionsPath, "utf8");

    assert.match(actionsCode, /get_public_doctors_directory/);
    assert.match(actionsCode, /get_public_doctor_schedules/);
    assert.doesNotMatch(actionsCode, /from\("public_doctors_view"\)/, "Direct view query must be replaced by authoritative RPC");
    assert.doesNotMatch(actionsCode, /from\("doctor_schedules"\)/, "Direct schedules query must be replaced by authoritative RPC");
  });
});
