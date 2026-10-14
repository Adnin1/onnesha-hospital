import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || "";
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[match[1]] = process.env[match[1]] || val;
    }
  });
}

describe("OHMS Multi-Tenant Security & Direct Outbox Mutation Prevention Matrix", () => {
  const TENANT_A = "6b78e524-b1e3-4c43-8944-1a5a0248bff8";
  const TENANT_B = "a0000000-0000-0000-0000-000000000002";

  // Check 1: Migration 192 DDL & Revocation Directives
  test("1. Migration 192 revokes direct mutations on system_notification_outbox and enforces queue_system_notification_atomic", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    assert.ok(fs.existsSync(migPath), "Migration 192 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Revocation of direct mutation
    assert.match(sql, /REVOKE INSERT,\s*UPDATE,\s*DELETE ON public\.system_notification_outbox FROM authenticated,\s*anon,\s*PUBLIC/i);
    assert.match(sql, /GRANT SELECT ON public\.system_notification_outbox TO authenticated/i);
    assert.match(sql, /GRANT ALL ON public\.system_notification_outbox TO service_role/i);

    // Controlled queue RPC
    assert.match(sql, /FUNCTION public\.queue_system_notification_atomic/i);
    assert.match(sql, /FORBIDDEN: Insufficient privileges to enqueue authoritative system notifications/i);
    assert.match(sql, /destination,\s*payload,\s*status/i);
  });

  // Check 2: Cross-Tenant Isolation in record_outbox_delivery_attempt_atomic
  test("2. record_outbox_delivery_attempt_atomic strictly blocks cross-tenant tampering", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /FUNCTION public\.record_outbox_delivery_attempt_atomic/i);
    assert.match(sql, /FOR UPDATE/i, "Must lock outbox row with FOR UPDATE");
    assert.match(sql, /ur\.organization_id\s*=\s*v_outbox\.organization_id/i, "Must verify admin belongs to outbox organization");
    assert.match(sql, /FORBIDDEN: Cross-tenant or unauthorized attempt to modify notification outbox/i);
  });

  // Check 3: Cross-Tenant Isolation in check_system_health_diagnostics
  test("3. check_system_health_diagnostics strictly isolates audit scope per tenant organization", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /ORGANIZATION_CONTEXT_UNAUTHORIZED: Caller does not have access to specified organization/i);
    assert.match(sql, /AUDIT_UNAUTHORIZED/i);
    assert.match(sql, /PUBLIC_PORTAL_ONLY/i);
    assert.match(sql, /DIAGNOSTIC_PRIVILEGE_REQUIRED/i);
  });

  // Check 4: Remote Supabase Direct Outbox Mutation Prohibition (Live Execution)
  test("4. Remote database rejects direct browser INSERT into system_notification_outbox", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || !supabaseUrl.startsWith("https://")) {
      console.log("   [Hermetic CI Mode] Skipping live network direct insert test");
      return;
    }

    const client = createClient(supabaseUrl, anonKey);

    // Direct insertion by unauthenticated/anon client MUST fail with 42501 permission denied
    const { data, error } = await client
      .from("system_notification_outbox")
      .insert({
        organization_id: TENANT_A,
        channel: "EMAIL",
        destination: "attacker@external.com",
        payload: { title: "Unsanitized Attack Notification" },
        status: "PENDING"
      });

    assert.ok(error, "Direct INSERT on system_notification_outbox must be denied");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501 (permission denied)");
  });

  // Check 5: Remote Supabase Fail-Closed Anonymous Diagnostic Probe
  test("5. Remote database check_system_health_diagnostics fails closed for anonymous calls", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || !supabaseUrl.startsWith("https://")) {
      console.log("   [Hermetic CI Mode] Skipping live network diagnostic check");
      return;
    }

    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.rpc("check_system_health_diagnostics");

    assert.ifError(error);
    assert.ok(data, "Diagnostic data must be returned");
    assert.equal(data.is_healthy, false, "Anon check must never claim healthy");
    assert.equal(data.status, "AUDIT_UNAUTHORIZED");
    assert.equal(data.audit_scope, "PUBLIC_PORTAL_ONLY");
    assert.equal(data.health_score, 0);
    assert.ok(data.issues.some((i) => i.id === "DIAGNOSTIC_PRIVILEGE_REQUIRED"));
  });

  // Check 6: Remote Supabase Cross-Tenant Diagnostic Tampering Block
  test("6. Remote database blocks cross-tenant diagnostics access", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || !supabaseUrl.startsWith("https://")) {
      return;
    }

    const client = createClient(supabaseUrl, anonKey);
    // Explicit cross-tenant probe by unauthenticated caller must fail closed
    const { data, error } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: TENANT_B
    });

    assert.ifError(error);
    assert.equal(data.is_healthy, false);
    assert.equal(data.status, "AUDIT_UNAUTHORIZED");
  });
});
