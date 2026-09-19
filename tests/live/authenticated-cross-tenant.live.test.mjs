/**
 * Phase 37 (Live Security Suite): Real Authenticated Cross-Tenant Runtime Isolation
 * 
 * Executes LIVE runtime queries against remote Supabase instance:
 * 1. Creates dynamic disposable Tenant B (crypto.randomUUID()) and two disposable test users: User A (Tenant A) and User B (Tenant B).
 * 2. Authenticates both users through Supabase Auth (signInWithPassword) to obtain real cryptographic JWTs.
 * 3. Verifies runtime row-level security:
 *    - User A accessing Tenant A: ALLOWED
 *    - User B accessing Tenant B: ALLOWED
 *    - User B attempting to SELECT Tenant A data: STRICTLY SHIELDED (0 rows returned)
 *    - User B attempting to INSERT into Tenant A: REJECTED (RLS policy violation)
 *    - User B attempting to UPDATE Tenant A data: REJECTED (0 rows affected)
 *    - User B attempting to DELETE Tenant A data: REJECTED (0 rows affected)
 *    - User B attempting to access Tenant A organization_integrations: STRICTLY SHIELDED (0 rows returned)
 * 4. Cleans up all disposable test entities on completion.
 * 
 * SAFETY GUARD: Requires RUN_LIVE_SUPABASE_TESTS=true and ALLOW_MUTATING_REMOTE_TESTS=true.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

// Load live credentials from environment or local env files
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
let SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

for (const envFile of [".env.local.temp", ".env.local", ".env"]) {
  const envPath = path.join(ROOT, envFile);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!SUPABASE_URL && trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
        SUPABASE_URL = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
      } else if (!SUPABASE_ANON_KEY && trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
        SUPABASE_ANON_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
      } else if (!SERVICE_ROLE_KEY && trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
        SERVICE_ROLE_KEY = trimmed.split("=")[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const CANONICAL_ORG_A = "a0000000-0000-0000-0000-000000000001";
const DISPOSABLE_ORG_B = crypto.randomUUID();

test("Phase 37 (Live): Real Authenticated Cross-Tenant Runtime Isolation", async (t) => {
  const isEnabled = process.env.RUN_LIVE_SUPABASE_TESTS === "true" && process.env.ALLOW_MUTATING_REMOTE_TESTS === "true";
  if (!isEnabled) {
    t.skip("Skipping live security test: Set RUN_LIVE_SUPABASE_TESTS=true and ALLOW_MUTATING_REMOTE_TESTS=true to execute live mutating tests against remote Supabase.");
    return;
  }

  // Strict Production Safety Shield: Refuse execution targeting production project or canonical org
  const isProdTarget = SUPABASE_URL.includes("iuhtzahuszdkdarhxobx") || SUPABASE_URL.includes("onnesha-hospital");
  if (isProdTarget && process.env.ALLOW_MUTATING_PRODUCTION_TESTS !== "true") {
    t.skip("SAFETY INVARIANT: Refusing to run live mutating cross-tenant test against production Supabase instance (iuhtzahuszdkdarhxobx). Set ALLOW_MUTATING_PRODUCTION_TESTS=true to override.");
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    t.skip("Skipping runtime test: Supabase live credentials not configured in environment");
    return;
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Check connectivity
  const { data: pingOrg, error: pingErr } = await adminClient
    .from("organizations")
    .select("id")
    .eq("id", CANONICAL_ORG_A)
    .maybeSingle();

  if (pingErr || !pingOrg) {
    t.skip("Skipping runtime test: Supabase database unreachable or isolated");
    return;
  }

  const nonce = Math.floor(Math.random() * 1000000);
  const emailA = `test-user-a-${nonce}@onnesha-test.local`;
  const emailB = `test-user-b-${nonce}@onnesha-test.local`;
  const password = 'Sec_' + crypto.randomBytes(16).toString('hex') + '!1Aa';

  let userAId = null;
  let userBId = null;
  let testPatientAId = null;
  let clientA = null;
  let clientB = null;

  try {
    // 1. Ensure Tenant B exists in organizations with dynamic UUID
    const { error: orgBErr } = await adminClient.from("organizations").upsert({
      id: DISPOSABLE_ORG_B,
      name: "Isolation Hospital B (Disposable Dynamic Test)",
      code: `HB-${nonce}`,
      slug: `hb-test-${nonce}`,
      phone: "01700-000000",
      email: "hospital-b@test.local",
      address: "Chittagong, Bangladesh",
      status: "ACTIVE",
      is_active: true,
    });
    assert.ok(!orgBErr, `Failed to ensure Tenant B: ${orgBErr?.message}`);

    // 2. Create User A and User B in auth.users
    const { data: userARes, error: userAErr } = await adminClient.auth.admin.createUser({
      email: emailA,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: "Staff A Tenant A" }
    });
    assert.ok(!userAErr && userARes?.user, `Failed to create User A: ${userAErr?.message}`);
    userAId = userARes.user.id;

    const { data: userBRes, error: userBErr } = await adminClient.auth.admin.createUser({
      email: emailB,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: "Staff B Tenant B" }
    });
    assert.ok(!userBErr && userBRes?.user, `Failed to create User B: ${userBErr?.message}`);
    userBId = userBRes.user.id;

    // 3. Create profiles linking User A -> Tenant A and User B -> Tenant B
    const phoneA = `017${String(nonce).padStart(8, "0")}`;
    const phoneB = `018${String(nonce).padStart(8, "0")}`;

    const { error: profAErr } = await adminClient.from("profiles").upsert({
      id: userAId,
      organization_id: CANONICAL_ORG_A,
      phone: phoneA,
      full_name: "Staff A Tenant A",
      is_active: true,
    });
    assert.ok(!profAErr, `Failed to create profile A: ${profAErr?.message}`);

    const { error: profBErr } = await adminClient.from("profiles").upsert({
      id: userBId,
      organization_id: DISPOSABLE_ORG_B,
      phone: phoneB,
      full_name: "Staff B Tenant B",
      is_active: true,
    });
    assert.ok(!profBErr, `Failed to create profile B: ${profBErr?.message}`);

    // 4. Authenticate both users using anon key to obtain real authenticated JWT sessions
    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: authA, error: authAErr } = await clientA.auth.signInWithPassword({
      email: emailA,
      password: password,
    });
    assert.ok(!authAErr && authA?.session?.access_token, "User A must receive valid authenticated JWT");

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: authB, error: authBErr } = await clientB.auth.signInWithPassword({
      email: emailB,
      password: password,
    });
    assert.ok(!authBErr && authB?.session?.access_token, "User B must receive valid authenticated JWT");

    // 5. User A inserts a record in Tenant A (e.g. a test patient)
    const { data: patientA, error: patientAErr } = await clientA
      .from("patients")
      .insert({
        organization_id: CANONICAL_ORG_A,
        patient_code: `PT-TEST-${nonce}`,
        full_name: "Confidential Patient A",
        gender: "MALE",
        phone: "01700000000",
      })
      .select("id, organization_id, full_name")
      .single();

    assert.ok(!patientAErr && patientA, `User A must be able to insert in Tenant A: ${patientAErr?.message}`);
    testPatientAId = patientA.id;

    // -----------------------------------------------------------------------------------
    // RUNTIME AUTHENTICATED TESTS
    // -----------------------------------------------------------------------------------

    await t.test("1. User A can query their own tenant data (Tenant A -> Tenant A ALLOWED)", async () => {
      const { data, error } = await clientA
        .from("patients")
        .select("id, organization_id, full_name")
        .eq("id", testPatientAId);

      assert.ok(!error, `User A should read own tenant: ${error?.message}`);
      assert.equal(data.length, 1);
      assert.equal(data[0].id, testPatientAId);
    });

    await t.test("2. User B cannot SELECT Tenant A records (Tenant B -> Tenant A SHIELDED)", async () => {
      const { data, error } = await clientB
        .from("patients")
        .select("id, organization_id, full_name")
        .eq("id", testPatientAId);

      assert.ok(!error, "Query should succeed without database crash");
      assert.equal(data.length, 0, "User B must receive 0 records when querying Tenant A patient");
    });

    await t.test("3. User B cannot INSERT records into Tenant A (Tenant B -> Tenant A INSERT BLOCKED)", async () => {
      const { data, error } = await clientB
        .from("patients")
        .insert({
          organization_id: CANONICAL_ORG_A, // Attempting cross-tenant write into Tenant A
          patient_code: `PT-INTRUDER-${nonce}`,
          full_name: "Intruder Record",
          gender: "FEMALE",
          phone: "01800000000",
        })
        .select();

      assert.ok(error !== null || (data && data.length === 0), "Cross-tenant INSERT must be rejected by RLS");
    });

    await t.test("4. User B cannot UPDATE Tenant A records (Tenant B -> Tenant A UPDATE BLOCKED)", async () => {
      const { data, error } = await clientB
        .from("patients")
        .update({ full_name: "Tampered Name" })
        .eq("id", testPatientAId)
        .select();

      assert.ok(!error || error.message.includes("policy"), "Update query processed by RLS");
      assert.equal(data?.length ?? 0, 0, "Zero rows can be updated across tenant boundary");

      // Verify original name intact
      const { data: verified } = await clientA
        .from("patients")
        .select("full_name")
        .eq("id", testPatientAId)
        .single();
      assert.equal(verified?.full_name, "Confidential Patient A", "Original record must remain untampered");
    });

    await t.test("5. User B cannot DELETE Tenant A records (Tenant B -> Tenant A DELETE BLOCKED)", async () => {
      const { data, error } = await clientB
        .from("patients")
        .delete()
        .eq("id", testPatientAId)
        .select();

      assert.ok(!error || error.message.includes("policy"), "Delete query processed by RLS");
      assert.equal(data?.length ?? 0, 0, "Zero rows can be deleted across tenant boundary");

      // Verify record still exists
      const { data: verified } = await clientA
        .from("patients")
        .select("id")
        .eq("id", testPatientAId)
        .single();
      assert.ok(verified?.id, "Tenant A record must still exist after unauthorized cross-tenant delete attempt");
    });

    await t.test("6. User B cannot access Tenant A organization_integrations credentials", async () => {
      const { data, error } = await clientB
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", CANONICAL_ORG_A);

      assert.ok(!error, "Query executed with RLS");
      assert.equal(data?.length ?? 0, 0, "User B must see zero rows of Tenant A gateway integrations");
    });

    await t.test("7. User B cannot SELECT Tenant A invoices or billing data", async () => {
      const { data, error } = await clientB
        .from("invoices")
        .select("id, organization_id, grand_total")
        .eq("organization_id", CANONICAL_ORG_A);

      assert.ok(!error, "Query executed under RLS without error");
      assert.equal(data?.length ?? 0, 0, "User B must receive 0 invoices belonging to Tenant A");
    });

    await t.test("8. User B cannot SELECT Tenant A appointments", async () => {
      const { data, error } = await clientB
        .from("appointments")
        .select("id, organization_id")
        .eq("organization_id", CANONICAL_ORG_A);

      assert.ok(!error, "Query executed under RLS without error");
      assert.equal(data?.length ?? 0, 0, "User B must receive 0 appointments belonging to Tenant A");
    });

    await t.test("9. User B cannot access Tenant A payment intents or audit logs", async () => {
      const { data: intents, error: intErr } = await clientB
        .from("payment_intents")
        .select("id, organization_id")
        .eq("organization_id", CANONICAL_ORG_A);

      assert.ok(!intErr, "Query executed under RLS");
      assert.equal(intents?.length ?? 0, 0, "User B must see 0 payment intents belonging to Tenant A");

      const { data: audits, error: audErr } = await clientB
        .from("audit_logs")
        .select("id, organization_id")
        .eq("organization_id", CANONICAL_ORG_A);

      assert.ok(!audErr, "Query executed under RLS");
      assert.equal(audits?.length ?? 0, 0, "User B must see 0 audit log entries belonging to Tenant A");
    });
  } finally {
    // -----------------------------------------------------------------------------------
    // CLEANUP DISPOSABLE ENTITIES
    // -----------------------------------------------------------------------------------
    if (testPatientAId) {
      await adminClient.from("patients").delete().eq("id", testPatientAId);
    }
    if (userAId) {
      await adminClient.from("profiles").delete().eq("id", userAId);
      await adminClient.auth.admin.deleteUser(userAId);
    }
    if (userBId) {
      await adminClient.from("profiles").delete().eq("id", userBId);
      await adminClient.auth.admin.deleteUser(userBId);
    }
    await adminClient.from("organizations").delete().eq("id", DISPOSABLE_ORG_B);
  }
});
