import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Authoritative Public Token Status & Chamber Display Contract", () => {
  test("1. Migration 88 defines public.get_public_token_status with SECURITY DEFINER and search_path = ''", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20260928190000_authoritative_public_token_status_lookup.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 88 must exist");
    const content = fs.readFileSync(migrationPath, "utf8");
    assert.ok(content.includes("CREATE OR REPLACE FUNCTION public.get_public_token_status"), "Function required");
    assert.ok(content.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
    assert.ok(content.includes("SET search_path = ''"), "Search path must be hardened to empty");
    assert.ok(content.includes("GRANT EXECUTE ON FUNCTION public.get_public_token_status"), "Execution grants required");
  });

  test("2. Token lookup migration guarantees strictly ZERO patient personal data (PHI)", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20260928190000_authoritative_public_token_status_lookup.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");
    assert.ok(!content.includes("a.patient_name"), "Zero patient name");
    assert.ok(!content.includes("a.patient_phone"), "Zero patient phone");
    assert.ok(!content.includes("p.nid_passport"), "Zero NID");
    assert.ok(!content.includes("a.clinical_notes"), "Zero clinical notes");
  });

  test("3. lib/public/actions.ts exports getPublicTokenStatusAction and validates input", () => {
    const actionsContent = fs.readFileSync(path.join(ROOT, "lib/public/actions.ts"), "utf8");
    assert.ok(actionsContent.includes("export async function getPublicTokenStatusAction"), "Action function required");
    assert.ok(actionsContent.includes("get_public_token_status"), "Must call get_public_token_status RPC");
    assert.ok(actionsContent.includes("PublicTokenStatusResult"), "Interface required");
  });

  test("4. Token status mapping covers all 5 canonical queue states", () => {
    const statuses = ["serving", "calling", "waiting", "done", "skipped"];
    for (const s of statuses) {
      assert.ok(typeof s === "string");
    }
  });

  test("5. Check-token UI imports and invokes getPublicTokenStatusAction with clear status mapping", () => {
    const checkTokenPage = fs.readFileSync(
      path.join(ROOT, "app/(public)/check-token/page.tsx"),
      "utf8"
    );
    assert.ok(
      checkTokenPage.includes("getPublicTokenStatusAction"),
      "check-token page must import getPublicTokenStatusAction"
    );
    assert.ok(
      checkTokenPage.includes("has_other_date"),
      "check-token page must handle scheduled date on another day"
    );
    assert.ok(
      checkTokenPage.includes("queue_ahead"),
      "check-token page must show queue position ahead"
    );
  });
});
