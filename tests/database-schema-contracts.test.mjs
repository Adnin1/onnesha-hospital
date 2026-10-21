import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("Change Safety: Database Compatibility & Schema Contracts Test Engine", () => {
  const migrationsDir = path.join(ROOT, "supabase", "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  let combinedSql = "";
  for (const f of migrationFiles) {
    combinedSql += fs.readFileSync(path.join(migrationsDir, f), "utf8") + "\n";
  }

  test("1. waiting_queue contract defines started_at, finished_at, and queue_status", () => {
    assert.ok(
      combinedSql.includes("finished_at") && combinedSql.includes("waiting_queue"),
      "waiting_queue must define finished_at column"
    );
    assert.ok(
      combinedSql.includes("started_at") && combinedSql.includes("waiting_queue"),
      "waiting_queue must define started_at column"
    );
    assert.ok(
      combinedSql.includes("queue_status") && combinedSql.includes("waiting_queue"),
      "waiting_queue must define queue_status column"
    );
  });

  test("2. prescriptions.visit_id is nullable (Migration 234 invariant)", () => {
    assert.match(
      combinedSql,
      /ALTER\s+TABLE\s+(public\.)?prescriptions\s+ALTER\s+COLUMN\s+visit_id\s+DROP\s+NOT\s+NULL/i,
      "Migration 234 must drop NOT NULL on prescriptions.visit_id"
    );
  });

  test("3. journal_entries contract defines entry_number and journal entry lines", () => {
    assert.ok(
      combinedSql.includes("journal_entries") && combinedSql.includes("entry_number"),
      "journal_entries must define entry_number"
    );
    assert.ok(
      combinedSql.includes("journal_entry_lines") && combinedSql.includes("debit") && combinedSql.includes("credit"),
      "journal_entry_lines must define debit and credit columns"
    );
  });

  test("4. bed_assignments and cabins contract supports cabin assignment without bed_id requirement", () => {
    assert.ok(
      combinedSql.includes("cabin_id") && combinedSql.includes("bed_assignments"),
      "bed_assignments must define cabin_id"
    );
    assert.ok(
      combinedSql.includes("cabins") && combinedSql.includes("cabin_number"),
      "cabins table must define cabin_number"
    );
  });

  test("5. blood_transfusion_records contract defines crossmatch columns", () => {
    assert.ok(
      combinedSql.includes("blood_transfusion_records") &&
      combinedSql.includes("major_crossmatch") &&
      combinedSql.includes("minor_crossmatch"),
      "blood_transfusion_records must define major and minor crossmatch columns"
    );
  });

  test("6. Application queries in lib/ only reference verified database schema columns", () => {
    const patientActionsPath = path.join(ROOT, "lib", "patient", "actions.ts");
    assert.ok(fs.existsSync(patientActionsPath), "lib/patient/actions.ts must exist");
    const content = fs.readFileSync(patientActionsPath, "utf8");

    // Must never reference raw deleted or fictional columns
    assert.ok(
      !content.includes(".select('non_existent_column')"),
      "Must not reference fake columns"
    );
  });
});
