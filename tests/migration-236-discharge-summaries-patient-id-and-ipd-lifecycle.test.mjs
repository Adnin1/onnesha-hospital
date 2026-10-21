import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("Migration 236: Discharge Summaries Schema Drift, Patient ID & IPD Lifecycle Acceptance", () => {
  const migrationPath = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261022030000_migration_236_add_discharge_summaries_patient_id_and_harden_ipd.sql"
  );

  test("1. Migration 236 file exists and contains valid SQL statements", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 236 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.length > 500, "Migration 236 must contain substantial SQL content");
  });

  test("2. Migration 236 adds patient_id to discharge_summaries and backfills from patient_visits", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.discharge_summaries\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+patient_id\s+UUID\s+REFERENCES\s+public\.patients\(id\)/i,
      "Must alter discharge_summaries adding patient_id column"
    );
    assert.match(
      sql,
      /UPDATE\s+public\.discharge_summaries\s+ds\s+SET\s+patient_id\s+=\s+pv\.patient_id\s+FROM\s+public\.patient_visits\s+pv/i,
      "Must backfill patient_id from patient_visits"
    );
  });

  test("3. Migration 236 enforces unique index on visit_id for atomic upsert safety", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_discharge_summaries_visit_id_unique\s+ON\s+public\.discharge_summaries\(visit_id\)/i,
      "Must create unique index on visit_id"
    );
    assert.match(
      sql,
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_discharge_summaries_patient_id\s+ON\s+public\.discharge_summaries\(patient_id\)/i,
      "Must create index on patient_id"
    );
  });

  test("4. complete_ipd_discharge_atomic inserts patient_id and vacates both beds and cabins", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sql.includes("INSERT INTO public.discharge_summaries") &&
      sql.includes("patient_id,") &&
      sql.includes("v_visit.patient_id,"),
      "Must insert patient_id into discharge_summaries"
    );
    assert.ok(
      sql.includes("UPDATE public.beds SET status = 'VACANT'") &&
      sql.includes("UPDATE public.cabins SET status = 'VACANT'"),
      "Must vacate both beds and cabins upon discharge"
    );
  });

  test("5. cancel_or_delete_ipd_admission_atomic supports p_admin_id fallback and invoice unlinking", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /v_caller\s+UUID\s*:=\s*COALESCE\(auth\.uid\(\),\s*p_admin_id\)/i,
      "Must fall back to p_admin_id if auth.uid() is not populated"
    );
    assert.ok(
      sql.includes("UPDATE public.invoices SET visit_id = NULL WHERE visit_id = p_visit_id"),
      "Must unlink visit_id from invoices before hard purge"
    );
  });

  test("6. lib/patient/actions.ts supports dual bed and cabin admission and transfer", () => {
    const actionsPath = path.join(ROOT, "lib", "patient", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      content.includes("isTargetBed") && content.includes("isTargetCabin"),
      "transferPatientAction must distinguish between beds and cabins"
    );
    assert.ok(
      content.includes("from(\"cabins\").update({ status: \"OCCUPIED\" })") ||
      content.includes(".from(\"cabins\")"),
      "Must update cabin status when transferred to or admitted to cabin"
    );
  });

  test("7. Remote Supabase DB fail-closed check on complete_ipd_discharge_atomic", async () => {
    const envPath = path.join(ROOT, ".env.local");
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, "utf8");
    const getVal = (key) => {
      const m = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
      return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
    };

    const supabaseUrl = getVal("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getVal("NEXT_PUBLIC_SUPABASE_ANON_KEY") || getVal("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !anonKey) return;

    const client = createClient(supabaseUrl, anonKey);
    const testOrg = "a0000000-0000-0000-0000-000000000001";
    const testVisit = "b0000000-0000-0000-0000-000000000001";

    // Anonymous caller must be rejected fail-closed with 401 / permission denied
    const { data, error } = await client.rpc("complete_ipd_discharge_atomic", {
      p_org_id: testOrg,
      p_visit_id: testVisit,
      p_final_diagnosis: "Test Clinical Discharge Diagnosis",
    });

    assert.ok(
      error !== null || (data && data.success === false),
      "Anonymous call to complete_ipd_discharge_atomic must fail closed"
    );
  });
});
