import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("v1.1.24 Security Definer Hardening, SMS Consolidation & Integration Truth (10 Scenarios)", () => {
  test("1. Migration 98 exists and hardens ingest_analyzer_transmission_atomic with empty search_path", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261001030000_harden_secdef_search_path_and_grants.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 98 must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("ingest_analyzer_transmission_atomic"));
    assert.ok(content.includes("SET search_path = ''"), "Must enforce empty search_path on LIS atomic function");
    assert.ok(content.includes("public.lab_analyzer_transmissions"), "Must use schema-qualified table references");
    assert.ok(content.includes("public.diagnostic_results"), "Must use schema-qualified results reference");
  });

  test("2. Migration 98 hardens update_hospital_master_profile with empty search_path and tenant awareness", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261001030000_harden_secdef_search_path_and_grants.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("update_hospital_master_profile"));
    assert.ok(content.includes("public.organizations"), "Must use schema-qualified organizations reference");
    assert.ok(content.includes("public.organization_settings"), "Must use schema-qualified settings reference");
    assert.ok(content.includes("public.audit_logs"), "Must record audit log in schema-qualified audit_logs");
  });

  test("3. Migration 98 enforces explicit REVOKE from PUBLIC/anon and GRANT only to authenticated", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261001030000_harden_secdef_search_path_and_grants.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("REVOKE ALL ON FUNCTION public.ingest_analyzer_transmission_atomic"));
    assert.ok(content.includes("FROM PUBLIC"));
    assert.ok(content.includes("FROM anon"));
    assert.ok(content.includes("TO authenticated"));

    assert.ok(content.includes("REVOKE ALL ON FUNCTION public.update_hospital_master_profile"));
  });

  test("4. Migration 98 disables legacy testbox/qwerty placeholder credentials", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261001030000_harden_secdef_search_path_and_grants.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("UPDATE public.organization_integrations"));
    assert.ok(content.includes("is_enabled = FALSE"));
    assert.ok(content.includes("testbox"));
    assert.ok(content.includes("qwerty"));
  });

  test("5. lib/sms/sms-service.ts delegates directly to authoritative BangladeshSmsAdapter", () => {
    const smsServicePath = path.join(ROOT, "lib/sms/sms-service.ts");
    assert.ok(fs.existsSync(smsServicePath), "lib/sms/sms-service.ts must exist");
    const content = fs.readFileSync(smsServicePath, "utf8");

    assert.ok(content.includes("BangladeshSmsAdapter"), "Must import BangladeshSmsAdapter");
    assert.ok(content.includes("adapter.send"), "Must delegate sending to adapter");
    assert.ok(!content.includes("providerResponseId: data?.msg_id || data?.message_id || \"OK\""), "Must NOT have false-green fallback");
  });

  test("6. lib/notifications/adapters/email-adapter.ts contains zero synthetic Date.now() IDs", () => {
    const emailAdapterPath = path.join(ROOT, "lib/notifications/adapters/email-adapter.ts");
    const content = fs.readFileSync(emailAdapterPath, "utf8");

    assert.ok(!content.includes("sg_${Date.now()}"), "Must NOT fabricate synthetic SendGrid message id");
    assert.ok(!content.includes("em_${Date.now()}"), "Must NOT fabricate synthetic email id");
  });

  test("7. lib/notifications/adapters/sms-adapter.ts contains zero synthetic Date.now() IDs", () => {
    const smsAdapterPath = path.join(ROOT, "lib/notifications/adapters/sms-adapter.ts");
    const content = fs.readFileSync(smsAdapterPath, "utf8");

    assert.ok(!content.includes("gw_${Date.now()}"), "Must NOT fabricate synthetic Greenweb message id");
    assert.ok(!content.includes("elit_${Date.now()}"), "Must NOT fabricate synthetic Elitbuzz message id");
  });

  test("8. lib/hospital/actions.ts fails closed if organization record is missing", () => {
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(content.includes("if (!org)"), "Must check for null organization record");
    assert.ok(content.includes("success: false"), "Must return success: false when org not in database");
  });

  test("9. lib/payments/adapters/sslcommerz-adapter.ts documents server-side authoritative architecture", () => {
    const adapterPath = path.join(ROOT, "lib/payments/adapters/sslcommerz-adapter.ts");
    const content = fs.readFileSync(adapterPath, "utf8");

    assert.ok(content.includes("ARCHITECTURAL CONTRACT:"), "Must declare architectural contract");
    assert.ok(content.includes("payment-initiate"), "Must reference server-side payment-initiate");
    assert.ok(content.includes("payment-callback"), "Must reference server-side payment-callback");
  });

  test("10. deploy.yml is designated as supplementary and does not duplicate primary CI release gates", () => {
    const deployYmlPath = path.join(ROOT, ".github/workflows/deploy.yml");
    const content = fs.readFileSync(deployYmlPath, "utf8");

    assert.ok(content.includes("Supplementary — Primary CI is ci.yml"), "Must state supplementary role");
    assert.ok(!content.includes("project-health-check.mjs --strict"), "Must NOT run strict health check in manual dispatch");
  });
});
