import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS_REGISTRY,
  isValidStatus,
  BED_STATUSES,
  CABIN_STATUSES,
  BED_ASSIGNMENT_STATUSES,
  VISIT_STATUSES,
  QUEUE_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  BLOOD_BAG_STATUSES,
  TRANSFUSION_STATUSES,
  REFERRAL_STATUSES,
  EXPENSE_STATUSES,
} from "../lib/status-vocabulary-registry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("Change Safety: Status Vocabulary Registry & Invariants", () => {
  test("1. Registry covers all 11 core hospital domains with non-empty canonical arrays", () => {
    const domains = [
      "BED",
      "CABIN",
      "BED_ASSIGNMENT",
      "VISIT",
      "QUEUE",
      "INVOICE",
      "PAYMENT",
      "BLOOD_BAG",
      "TRANSFUSION",
      "REFERRAL",
      "EXPENSE",
    ];

    for (const d of domains) {
      assert.ok(Array.isArray(STATUS_REGISTRY[d]), `Domain ${d} must be an array`);
      assert.ok(STATUS_REGISTRY[d].length > 0, `Domain ${d} must have at least one canonical status`);
    }

    assert.ok(BED_STATUSES.includes("VACANT"));
    assert.ok(BED_STATUSES.includes("OCCUPIED"));
    assert.ok(CABIN_STATUSES.includes("VACANT"));
    assert.ok(CABIN_STATUSES.includes("OCCUPIED"));
    assert.ok(VISIT_STATUSES.includes("ADMITTED"));
    assert.ok(VISIT_STATUSES.includes("DISCHARGED"));
    assert.ok(VISIT_STATUSES.includes("CANCELLED"));
    assert.ok(QUEUE_STATUSES.includes("WAITING"));
    assert.ok(QUEUE_STATUSES.includes("CALLED"));
    assert.ok(QUEUE_STATUSES.includes("IN_ROOM"));
    assert.ok(QUEUE_STATUSES.includes("COMPLETED"));
    assert.ok(QUEUE_STATUSES.includes("SKIPPED"));
    assert.ok(INVOICE_STATUSES.includes("PAID"));
    assert.ok(INVOICE_STATUSES.includes("PARTIALLY_PAID"));
    assert.ok(INVOICE_STATUSES.includes("DRAFT"));
    assert.ok(INVOICE_STATUSES.includes("CANCELLED"));
  });

  test("2. isValidStatus correctly validates uppercase and rejects rogue values", () => {
    assert.equal(isValidStatus("VACANT", BED_STATUSES), true);
    assert.equal(isValidStatus("vacant", BED_STATUSES), true); // Case-insensitive normalized
    assert.equal(isValidStatus("DISCHARGED", VISIT_STATUSES), true);
    assert.equal(isValidStatus("UNKNOWN_ROGUE_STATUS", VISIT_STATUSES), false);
    assert.equal(isValidStatus("", VISIT_STATUSES), false);
  });

  test("3. Migrations enforce canonical uppercase check constraints for beds and cabins", () => {
    const migrationsDir = path.join(ROOT, "supabase", "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    let foundBedConstraint = false;
    let foundCabinConstraint = false;

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      if (sql.includes("beds_status_check") || sql.includes("beds") && sql.includes("VACANT")) {
        foundBedConstraint = true;
      }
      if (sql.includes("cabins_status_check") || sql.includes("cabins") && sql.includes("VACANT")) {
        foundCabinConstraint = true;
      }
    }

    assert.ok(foundBedConstraint, "Database migrations must enforce beds status check");
    assert.ok(foundCabinConstraint, "Database migrations must enforce cabins status check");
  });
});
