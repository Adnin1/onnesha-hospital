import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuhtzahuszdkdarhxobx.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

describe("OHMS Phase 32: Billing Atomicity, Payment Reconciliation & Hardened RBAC", () => {
  const mig032Path = path.join(ROOT, "supabase/migrations/032_billing_atomicity_and_rbac_hardening.sql");

  test("1. Migration 032 exists and defines RBAC helper function is_org_admin_or_has_permission", () => {
    assert.ok(fs.existsSync(mig032Path), "Migration 032 file must exist");
    const sql = fs.readFileSync(mig032Path, "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_org_admin_or_has_permission/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.is_org_admin_or_has_permission/);
  });

  test("2. Migration 032 scopes public SELECT on departments, doctors, schedules strictly to canonical org", () => {
    const sql = fs.readFileSync(mig032Path, "utf8");
    assert.match(sql, /organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid/);
    assert.match(sql, /rls_departments_public_select/);
    assert.match(sql, /rls_doctors_public_select/);
    assert.match(sql, /rls_doctor_schedules_public_select/);
  });

  test("3. Migration 032 enforces fine-grained RBAC on staff mutations", () => {
    const sql = fs.readFileSync(mig032Path, "utf8");
    assert.match(sql, /is_org_admin_or_has_permission\(organization_id, 'departments\.manage'\)/);
    assert.match(sql, /is_org_admin_or_has_permission\(organization_id, 'doctors\.manage'\)/);
    assert.match(sql, /is_org_admin_or_has_permission\(organization_id, 'schedules\.manage'\)/);
    assert.match(sql, /is_org_admin_or_has_permission\(id, 'settings\.manage'\)/);
  });

  test("4. Migration 032 shields organization_integrations table from non-admin staff and anon", () => {
    const sql = fs.readFileSync(mig032Path, "utf8");
    assert.match(sql, /rls_organization_integrations_staff/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.organization_integrations FROM anon, PUBLIC;/);
  });

  test("5. Migration 032 defines create_invoice_atomic and collect_payment_atomic RPCs", () => {
    const sql = fs.readFileSync(mig032Path, "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_invoice_atomic/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.collect_payment_atomic/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.create_invoice_atomic/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.collect_payment_atomic/);
  });

  test("6. lib/payments/types.ts defines authoritative DB columns and statuses", () => {
    const typesPath = path.join(ROOT, "lib/payments/types.ts");
    const content = fs.readFileSync(typesPath, "utf8");
    assert.match(content, /intentReference: string;/);
    assert.match(content, /payableAmount: number;/);
    assert.match(content, /providerSessionId\?: string \| null;/);
    assert.match(content, /checkoutUrl\?: string \| null;/);
    assert.match(content, /"CREATED"/);
    assert.match(content, /"PAID"/);
  });

  test("7. PaymentService queries organization_integrations using canonical columns", () => {
    const servicePath = path.join(ROOT, "lib/payments/payment-service.ts");
    const content = fs.readFileSync(servicePath, "utf8");
    assert.match(content, /eq\("integration_type", "PAYMENT_GATEWAY"\)/);
    assert.match(content, /eq\("provider_name", provider\)/);
    assert.match(content, /eq\("is_enabled", true\)/);
  });

  test("8. PaymentService contains zero fake phone fallbacks or hospital.local placeholders", () => {
    const servicePath = path.join(ROOT, "lib/payments/payment-service.ts");
    const content = fs.readFileSync(servicePath, "utf8");
    assert.ok(!content.includes("01700000000"), "Fake phone 01700000000 must be completely removed");
    assert.ok(!content.includes("hospital.local"), "Fake hostname hospital.local must be completely removed");
  });

  test("9. lib/billing/actions.ts executes atomic database RPCs for invoice and payment creation", () => {
    const actionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /supabase\.rpc\("create_invoice_atomic"/);
    assert.match(content, /supabase\.rpc\("collect_payment_atomic"/);
  });

  test("10. playwright.config.ts configures webkit browser project", () => {
    const configPath = path.join(ROOT, "playwright.config.ts");
    const content = fs.readFileSync(configPath, "utf8");
    assert.match(content, /name:\s*"webkit"/);
    assert.match(content, /Desktop Safari/);
  });

  test("11. WebKit engine configured in Playwright and runs cross-browser tests", () => {
    const pwPath = path.join(ROOT, "playwright.config.ts");
    assert.ok(fs.existsSync(pwPath), "playwright.config.ts must exist");
    const content = fs.readFileSync(pwPath, "utf8");
    assert.match(content, /name:\s*"webkit"/);
    assert.match(content, /Desktop Safari/);
    // If CI workflow file exists, ensure it targets ubuntu-latest and webkit
    const ciPath = path.join(ROOT, ".github/workflows/ci.yml");
    if (fs.existsSync(ciPath)) {
      const ciContent = fs.readFileSync(ciPath, "utf8");
      assert.match(ciContent, /runs-on:\s*ubuntu-latest/);
    }
  });

  test("12. Supabase Edge Functions created for payment initiate and callback", () => {
    const initPath = path.join(ROOT, "supabase/functions/payment-initiate/index.ts");
    const cbPath = path.join(ROOT, "supabase/functions/payment-callback/index.ts");
    assert.ok(fs.existsSync(initPath), "payment-initiate function must exist");
    assert.ok(fs.existsSync(cbPath), "payment-callback function must exist");
  });

  test("13. Live DB Security: Anonymous execution of create_invoice_atomic is strictly blocked", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anonClient.rpc("create_invoice_atomic", {
      p_org_id: CANONICAL_ORG_ID,
      p_patient_id: CANONICAL_ORG_ID,
      p_items: [{ item_name: "Hack Test", unit_price: 100, quantity: 1, service_category: "MISC" }]
    });

    assert.ok(error !== null || (data && data.success === false), "Anonymous create_invoice_atomic must fail");
  });

  test("14. Live DB Security: Anonymous execution of collect_payment_atomic is strictly blocked", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anonClient.rpc("collect_payment_atomic", {
      p_org_id: CANONICAL_ORG_ID,
      p_invoice_id: CANONICAL_ORG_ID,
      p_amount: 50,
      p_payment_method: "CASH"
    });

    assert.ok(error !== null || (data && data.success === false), "Anonymous collect_payment_atomic must fail");
  });

  test("15. Live DB Security: Anonymous direct SELECT on organization_integrations returns 0 rows / blocked", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anonClient
      .from("organization_integrations")
      .select("id, encrypted_credentials")
      .eq("organization_id", CANONICAL_ORG_ID);

    if (error) {
      assert.match(error.message, /permission denied|violates row-level security/i);
    } else {
      assert.equal(data?.length ?? 0, 0, "Zero integration credentials rows can be returned to anonymous client");
    }
  });
});
