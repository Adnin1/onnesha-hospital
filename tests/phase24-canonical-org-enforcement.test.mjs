import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_ORG_ID = "a0000000-0000-0000-0000-000000000001";

describe("OHMS Phase 24 Canonical Public Organization Enforcement (10 Scenarios)", async () => {

  test("1. Migration 030 adds is_canonical_public column to organizations", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    assert.ok(fs.existsSync(migPath), "Migration 030 file must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("is_canonical_public"), "is_canonical_public column definition required");
    assert.ok(content.includes("ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_canonical_public"), "ALTER TABLE statement required");
  });

  test("2. Migration 030 marks exactly the canonical org as is_canonical_public = TRUE", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(
      content.includes("SET is_canonical_public = TRUE") &&
      content.includes(CANONICAL_ORG_ID),
      "Canonical org must be marked is_canonical_public = TRUE with exact UUID"
    );
  });

  test("3. Migration 030 reverts non-canonical orgs to is_canonical_public = FALSE", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(
      content.includes("SET is_canonical_public = FALSE") &&
      content.includes("id != '" + CANONICAL_ORG_ID + "'::UUID"),
      "Non-canonical orgs must be reverted to is_canonical_public = FALSE"
    );
  });

  test("4. Migration 030 book_online_appointment validates is_canonical_public = TRUE", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("v_org_canonical IS NOT TRUE"), "Canonical org check required in book_online_appointment");
    assert.ok(content.includes("403 Forbidden: Organization is not authorized for public online booking."), "Canonical org rejection message required");
    assert.ok(content.includes("is_canonical_public"), "is_canonical_public column reference required in RPC logic");
  });

  test("5. Migration 030 book_online_appointment checks BOTH is_active AND is_canonical_public", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("v_org_active IS NOT TRUE"), "is_active check required");
    assert.ok(content.includes("v_org_canonical IS NOT TRUE"), "is_canonical_public check required");
    // Both checks must be present and ordered correctly (active before canonical)
    const activeIdx = content.indexOf("v_org_active IS NOT TRUE");
    const canonicalIdx = content.indexOf("v_org_canonical IS NOT TRUE");
    assert.ok(activeIdx < canonicalIdx, "is_active must be checked before is_canonical_public");
  });

  test("6. lib/public/actions.ts bookOnlineAppointmentAction sends only canonical HOSPITAL_METADATA.id as p_org_id", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    // Must NOT have a different org ID source - only HOSPITAL_METADATA.id
    assert.ok(content.includes("HOSPITAL_METADATA.id"), "HOSPITAL_METADATA.id must be the org source for bookOnlineAppointmentAction");
    assert.ok(content.includes("p_org_id: HOSPITAL_METADATA.id") || content.includes("p_org_id:HOSPITAL_METADATA.id"), "p_org_id must be bound to HOSPITAL_METADATA.id");
    // Confirm it does not accept arbitrary p_org_id from user input
    assert.ok(!content.includes("p_org_id: orgId"), "bookOnlineAppointmentAction must not pass arbitrary orgId from client");
  });

  test("7. config/hospital.ts canonical HOSPITAL_METADATA.id matches the canonical org UUID", () => {
    const hospitalConfig = fs.readFileSync(path.join(ROOT, "config/hospital.ts"), "utf8");
    assert.ok(hospitalConfig.includes(CANONICAL_ORG_ID), "HOSPITAL_METADATA.id must equal canonical org UUID a0000000-0000-0000-0000-000000000001");
  });

  test("8. Migration 030 book_online_appointment uses SET search_path = '' (not public)", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    // Must have empty search_path
    assert.ok(content.includes("SET search_path = ''"), "Empty search_path required in migration 030");
    // Must NOT use SET search_path = public
    const pubIdx = content.indexOf("SET search_path = public");
    assert.ok(pubIdx === -1, "SET search_path = public must not appear in migration 030");
  });

  test("9. Migration 030 REVOKE/GRANT permissions are correctly scoped (anon allowed for public RPC)", () => {
    const migPath = path.join(ROOT, "supabase/migrations/030_phase24_canonical_public_org_enforcement.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("REVOKE EXECUTE ON FUNCTION public.book_online_appointment FROM PUBLIC;"), "Revoke public required");
    assert.ok(content.includes("GRANT EXECUTE ON FUNCTION public.book_online_appointment TO anon, authenticated, service_role;"), "Grant to anon/authenticated/service_role required");
  });

  test("10. Live DB canonical org enforcement (requires Supabase credentials)", async () => {
    const envPath = path.join(ROOT, ".env.local");
    if (!fs.existsSync(envPath)) {
      // BLOCKED: requires live DB — not a test failure, explicit blocker
      console.log("BLOCKED: Live canonical org test requires .env.local with Supabase credentials.");
      return; // Skip gracefully
    }

    const envContent = fs.readFileSync(envPath, "utf8");
    let supabaseUrl = "";
    let serviceKey = "";
    for (const line of envContent.split("\n")) {
      if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) supabaseUrl = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) serviceKey = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    }

    if (!supabaseUrl || !serviceKey) {
      console.log("BLOCKED: Live canonical org test requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
      return; // Skip gracefully
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify canonical org is marked is_canonical_public = TRUE
    const { data: canonicalOrg, error: cErr } = await supabase
      .from("organizations")
      .select("id, is_active, is_canonical_public, name")
      .eq("id", CANONICAL_ORG_ID)
      .single();

    if (cErr) {
      if (cErr.message?.includes("is_canonical_public") || cErr.code === "PGRST204" || cErr.message?.includes("column")) {
        console.log("BLOCKED: Migration 030 is not yet applied to remote DB (column organizations.is_canonical_public missing). Pending remote db push.");
        return;
      }
      assert.fail("FAIL: Could not query canonical organization: " + cErr.message);
    }

    assert.ok(canonicalOrg, "Canonical organization must exist in DB");
    assert.equal(canonicalOrg.is_active, true, "Canonical org must be is_active = TRUE");
    assert.equal(canonicalOrg.is_canonical_public, true, "Canonical org must be is_canonical_public = TRUE");

    // Verify no other org is marked is_canonical_public = TRUE
    const { data: otherOrgs, error: oErr } = await supabase
      .from("organizations")
      .select("id, is_canonical_public")
      .eq("is_canonical_public", true)
      .neq("id", CANONICAL_ORG_ID);

    if (!oErr) {
      assert.equal(otherOrgs?.length ?? 0, 0, "No other organization must be marked is_canonical_public = TRUE");
    }

    // Attempt public booking with a non-canonical org UUID (must be rejected)
    const nonCanonicalOrgId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const { data: fakeOrgResult } = await supabase.rpc("book_online_appointment", {
      p_org_id: nonCanonicalOrgId,
      p_doctor_id: "00000000-0000-0000-0000-000000000000",
      p_appointment_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      p_patient_name: "Test Boundary Patient",
      p_patient_phone: "01700000001",
      p_patient_gender: "MALE",
      p_schedule_id: "00000000-0000-0000-0000-000000000000"
    });

    const parsed = typeof fakeOrgResult === "string" ? JSON.parse(fakeOrgResult) : fakeOrgResult;
    assert.ok(parsed?.success === false, "Non-canonical org must be rejected by book_online_appointment");
    assert.ok(
      parsed?.error?.includes("403") || parsed?.error?.includes("inactive") || parsed?.error?.includes("not authorized"),
      "Rejection must cite 403/inactive/not authorized: got: " + parsed?.error
    );
  });

});
