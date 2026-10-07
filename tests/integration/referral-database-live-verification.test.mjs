import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const envPath = path.resolve(ROOT, ".env.local");

let supabaseUrl = "";
let anonKey = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      anonKey = trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
  }
}

describe("OHMS Live Supabase Database & Real RLS Penetration Certification", () => {
  const isConfigured = Boolean(supabaseUrl && anonKey);

  test("1. Live Database Target & Connection Verification", () => {
    assert.ok(isConfigured, "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured in .env.local");
    assert.match(supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/, "Must target valid Supabase URL");
  });

  test("2. REAL RLS DENIAL: Anonymous SELECT on referral_agents is strictly blocked by PostgreSQL (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client
      .from("referral_agents")
      .select("id, agent_code, full_name, commission_rate_percent");

    assert.equal(data, null, "Anonymous caller must NOT receive rows");
    assert.ok(error, "Anonymous SELECT must return a database error");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501 (insufficient_privilege)");
    assert.match(error.message, /permission denied/i, "Error message must state permission denied");
  });

  test("3. REAL RLS DENIAL: Anonymous SELECT on referral_commissions ledger is strictly blocked (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client
      .from("referral_commissions")
      .select("id, commission_amount, settlement_status");

    assert.equal(data, null, "Anonymous caller must NOT receive commission rows");
    assert.ok(error, "Anonymous SELECT must be rejected");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501");
    assert.match(error.message, /permission denied/i);
  });

  test("4. REAL RLS DENIAL: Anonymous SELECT on referral_commission_settlements is strictly blocked (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client
      .from("referral_commission_settlements")
      .select("id, settlement_number, net_paid_amount");

    assert.equal(data, null, "Anonymous caller must NOT receive settlement rows");
    assert.ok(error, "Anonymous SELECT must be rejected");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501");
    assert.match(error.message, /permission denied/i);
  });

  test("5. REAL RPC DENIAL: Anonymous execute of search_active_referral_agents is strictly blocked (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.rpc("search_active_referral_agents", {
      p_org_id: "00000000-0000-0000-0000-000000000000",
      p_query: "test",
    });

    assert.equal(data, null, "Anonymous caller must NOT execute search RPC");
    assert.ok(error, "Anonymous RPC execution must be rejected");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501");
    assert.match(error.message, /permission denied/i);
  });

  test("6. REAL RPC DENIAL: Anonymous execute of settle_referral_commissions_atomic is strictly blocked (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.rpc("settle_referral_commissions_atomic", {
      p_org_id: "00000000-0000-0000-0000-000000000000",
      p_agent_id: "00000000-0000-0000-0000-000000000000",
      p_commission_ids: ["00000000-0000-0000-0000-000000000000"],
      p_payment_method: "CASH",
    });

    assert.equal(data, null, "Anonymous caller must NOT execute payout RPC");
    assert.ok(error, "Anonymous RPC execution must be rejected");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501");
    assert.match(error.message, /permission denied/i);
  });

  test("7. REAL MUTATION DENIAL: Anonymous INSERT into referral_agents is strictly rejected (42501)", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client
      .from("referral_agents")
      .insert({
        organization_id: "00000000-0000-0000-0000-000000000000",
        agent_code: "HACK-999",
        full_name: "Attacker Partner",
        phone: "01799999999",
        commission_rate_percent: 50.00,
      });

    assert.equal(data, null, "Anonymous mutation must NOT succeed");
    assert.ok(error, "Anonymous INSERT must fail");
    assert.equal(error.code, "42501", "PostgreSQL error code must be 42501");
    assert.match(error.message, /permission denied/i);
  });

  test("8. REAL AUTH INTEGRITY: Live Supabase Auth Endpoint enforces credential validation", async () => {
    if (!isConfigured) return;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signInWithPassword({
      email: "unauthorized_probe@onnesha-hospital.com",
      password: "InvalidPassword999!",
    });

    assert.equal(data?.user, null, "Invalid credentials must not yield authenticated session");
    assert.ok(error, "Must return authentication error");
    assert.equal(error.status, 400, "Auth service must reject invalid probe with status 400");
  });
});
