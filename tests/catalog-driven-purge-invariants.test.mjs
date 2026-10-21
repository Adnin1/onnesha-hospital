import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("Migration 235: Catalog-Driven Purge Invariants & Clinical Security Seal", () => {
  const migration235Path = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261022020000_migration_235_security_definer_rbac_and_ipd_purge_hardening.sql"
  );

  test("1. Migration 235 file exists and contains all required security revocations", () => {
    assert.ok(fs.existsSync(migration235Path), "Migration 235 file must exist");
    const sql = fs.readFileSync(migration235Path, "utf8");

    // Revocations from anon and PUBLIC
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.prescriptions FROM anon;/i,
      "Must revoke anon Data API access from prescriptions"
    );
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.prescription_items FROM anon;/i,
      "Must revoke anon Data API access from prescription_items"
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.cancel_or_delete_ipd_admission_atomic\(.*\) FROM PUBLIC, anon;/i,
      "Must revoke PUBLIC and anon execute from cancel_or_delete_ipd_admission_atomic"
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.complete_ipd_discharge_atomic\(.*\) FROM PUBLIC, anon;/i,
      "Must revoke PUBLIC and anon execute from complete_ipd_discharge_atomic"
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.update_ipd_admission_atomic\(.*\) FROM PUBLIC, anon;/i,
      "Must revoke PUBLIC and anon execute from update_ipd_admission_atomic"
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.update_waiting_queue_status_atomic\(.*\) FROM PUBLIC, anon;/i,
      "Must revoke PUBLIC and anon execute from update_waiting_queue_status_atomic"
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.update_blood_transfusion_dossier_atomic\(.*\) FROM PUBLIC, anon;/i,
      "Must revoke PUBLIC and anon execute from update_blood_transfusion_dossier_atomic"
    );
  });

  test("2. IPD purge separates operational cancellation from destructive permanent delete", () => {
    const sql = fs.readFileSync(migration235Path, "utf8");

    // Default must be FALSE for safety
    assert.match(
      sql,
      /p_permanent_delete BOOLEAN DEFAULT FALSE/i,
      "cancel_or_delete_ipd_admission_atomic must default p_permanent_delete to FALSE"
    );

    // Gated to administrative roles
    assert.match(
      sql,
      /v_is_purge_authorized/i,
      "Must verify purge authorization separately from operational cancel"
    );
    assert.match(
      sql,
      /patients\.delete/i,
      "Must check patients.delete permission or administrative role for permanent delete"
    );

    // Invoices must be unlinked to prevent FK constraint violations
    assert.match(
      sql,
      /UPDATE public\.invoices\s+SET visit_id = NULL\s+WHERE visit_id = p_visit_id/i,
      "Must unlink invoices from visit to prevent FK deletion failures"
    );
  });

  test("3. Fictional 'Senior Consultant Physician' placeholder is strictly prohibited", () => {
    const sql = fs.readFileSync(migration235Path, "utf8");

    assert.ok(
      !sql.includes("v_final_consultant_name := 'Senior Consultant Physician'"),
      "Function body must never assign 'Senior Consultant Physician' fallback"
    );

    assert.match(
      sql,
      /A licensed consultant doctor must be selected or provided to authorize clinical discharge/i,
      "Discharge summary must mandate an authentic licensed consultant doctor"
    );
  });

  test("4. Live Database Verification: Anonymous callers strictly rejected (Non-Hermetic)", async (t) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !url ||
      !anonKey ||
      !url.startsWith("https://") ||
      url.includes("placeholder") ||
      url.includes("ci-hermetic") ||
      url.includes("127.0.0.1") ||
      anonKey.includes("placeholder")
    ) {
      t.skip("Hermetic CI environment detected. Skipping live database network probe.");
      return;
    }

    const client = createClient(url, anonKey);
    const testOrg = "a0000000-0000-0000-0000-000000000001";
    const testVisit = "b0000000-0000-0000-0000-000000000001";

    // 4A. cancel_or_delete_ipd_admission_atomic rejected for anon
    const { data: d1, error: e1 } = await client.rpc("cancel_or_delete_ipd_admission_atomic", {
      p_org_id: testOrg,
      p_visit_id: testVisit,
      p_admin_id: testOrg,
      p_reason: "Security probe",
      p_permanent_delete: false,
    });
    assert.ok(
      e1 || (d1 && d1.success === false),
      "Anonymous attempt to call cancel_or_delete_ipd_admission_atomic must be rejected"
    );

    // 4B. update_ipd_admission_atomic rejected for anon
    const { data: d2, error: e2 } = await client.rpc("update_ipd_admission_atomic", {
      p_org_id: testOrg,
      p_visit_id: testVisit,
      p_notes: "Probe notes",
    });
    assert.ok(
      e2 || (d2 && d2.success === false),
      "Anonymous attempt to call update_ipd_admission_atomic must be rejected"
    );

    // 4C. Anonymous SELECT on prescriptions rejected
    const { data: pData, error: pErr } = await client.from("prescriptions").select("id").limit(1);
    assert.ok(
      pErr || (Array.isArray(pData) && pData.length === 0),
      "Anonymous caller must not access prescription data"
    );
  });
});
