import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

describe("Migration 179: Bed Concurrency Invariants & Invoice Permanent Purge", () => {
  const mig179Path = path.join(
    ROOT,
    "supabase/migrations/20261014010000_fix_bed_assignment_conflict_and_invoice_hard_purge.sql"
  );
  assert.ok(fs.existsSync(mig179Path), "Migration 179 file must exist");
  const mig179Content = fs.readFileSync(mig179Path, "utf8");

  test("Migration 179 equips journal immutability triggers with transaction-local override", () => {
    assert.match(mig179Content, /app\.override_journal_immutability/);
    assert.match(mig179Content, /current_setting\('app\.override_journal_immutability', true\) = 'on'/);
    assert.match(mig179Content, /trg_fn_enforce_journal_entry_immutability/);
    assert.match(mig179Content, /trg_fn_enforce_journal_line_immutability/);
  });

  test("Migration 179 equips delete_invoice_super_admin_atomic with override and journal cascade purge", () => {
    assert.match(mig179Content, /set_config\('app\.override_journal_immutability', 'on', true\)/);
    assert.match(mig179Content, /DELETE FROM public\.journal_entry_lines/);
    assert.match(mig179Content, /DELETE FROM public\.journal_entries/);
    assert.match(mig179Content, /DELETE FROM public\.invoices WHERE id = p_invoice_id/);
  });

  test("Migration 179 establishes real-time occupancy synchronization between bed_assignments and beds", () => {
    assert.match(mig179Content, /trg_fn_sync_bed_occupancy_status/);
    assert.match(mig179Content, /trg_sync_bed_occupancy/);
    assert.match(mig179Content, /AFTER INSERT OR UPDATE OR DELETE ON public\.bed_assignments/);
  });

  test("Migration 179 hardens create_patient_intake_atomic against double bed/cabin assignment", () => {
    assert.match(mig179Content, /BED_NOT_VACANT: Bed % is already occupied/);
    assert.match(mig179Content, /CABIN_NOT_VACANT: Cabin % is already occupied/);
    assert.match(mig179Content, /FOR UPDATE/);
  });
});

describe("Client & Action Layer Hardening", () => {
  const actionsPath = path.join(ROOT, "lib/patient/actions.ts");
  const actionsCode = fs.readFileSync(actionsPath, "utf8");

  const billingActionsPath = path.join(ROOT, "lib/billing/actions.ts");
  const billingCode = fs.readFileSync(billingActionsPath, "utf8");

  test("getIntakeDropdownOptionsAction cross-references bed_assignments for true live availability", () => {
    assert.match(actionsCode, /supabase\.from\("bed_assignments"\)\.select\("bed_id, cabin_id"\)/);
    assert.match(actionsCode, /activeBedIds\.has\(b\.id\) \? "OCCUPIED" : b\.status/);
  });

  test("deleteInvoiceAction provides clear error feedback when journal constraints are violated", () => {
    assert.match(billingCode, /Immutable Journal Error/);
  });
});
