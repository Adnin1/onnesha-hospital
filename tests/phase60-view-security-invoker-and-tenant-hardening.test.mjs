/**
 * Phase 60: View Security Invoker & Tenant Hardening Test Suite
 * Validates:
 * - Migration 60 existence and WITH (security_invoker = true) syntax
 * - Canonical organization boundary enforcement in view WHERE clause
 * - Strict omission of salary and commission columns from public_doctors_view
 * - Multi-tenant isolation preventing cross-tenant leakage via public views
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 60: View Security Invoker & Tenant Hardening Suite", async (t) => {
  const migration60Path = path.join(
    ROOT,
    "supabase/migrations/20260922213000_doctors_view_security_invoker_and_anon_shield.sql"
  );
  assert.ok(fs.existsSync(migration60Path), "Migration 60 file must exist on disk");
  const sql = fs.readFileSync(migration60Path, "utf8");

  await t.test("1. Migration 60: public_doctors_view specifies WITH (security_invoker = true)", () => {
    assert.match(
      sql,
      /CREATE OR REPLACE VIEW public\.public_doctors_view\s+WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
      "View must be defined with security_invoker = true"
    );
  });

  await t.test("2. Migration 60: public_doctors_view enforces canonical public org filter", () => {
    assert.match(
      sql,
      /d\.organization_id\s*=\s*'a0000000-0000-0000-0000-000000000001'::uuid/i,
      "View must restrict rows to the canonical public organization UUID"
    );
  });

  await t.test("3. Migration 60: View excludes salary and commission columns", () => {
    const viewMatch = sql.match(/CREATE OR REPLACE VIEW public\.public_doctors_view[\s\S]*?WHERE/i);
    assert.ok(viewMatch, "view definition must be extractable");
    assert.doesNotMatch(viewMatch[0], /commission/i, "view must not select commission fields");
    assert.doesNotMatch(viewMatch[0], /salary/i, "view must not select salary fields");
  });

  await t.test("4. Migration 60: Grants strictly configured for anon, authenticated, service_role", () => {
    assert.match(sql, /REVOKE ALL ON public\.public_doctors_view FROM PUBLIC;/);
    assert.match(sql, /GRANT SELECT ON public\.public_doctors_view TO anon, authenticated, service_role;/);
  });
});
