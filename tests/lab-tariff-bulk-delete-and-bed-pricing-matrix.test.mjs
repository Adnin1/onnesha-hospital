import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS Diagnostic Lab Tariffs Bulk Management & Bed-Cabin Pricing Matrix Certification", async (t) => {
  // 1. Lab Actions Contract
  await t.test("1. lib/lab/actions.ts exports deleteDiagnosticTestAction and bulkDeleteDiagnosticTestsAction", () => {
    const labActionsPath = path.join(ROOT, "lib/lab/actions.ts");
    const content = fs.readFileSync(labActionsPath, "utf8");
    assert.match(content, /export async function deleteDiagnosticTestAction/);
    assert.match(content, /export async function bulkDeleteDiagnosticTestsAction/);
    assert.match(content, /diagnostic_order_items/);
    assert.match(content, /hardDeleted/);
  });

  // 2. TestTariffManager UI Capabilities
  await t.test("2. components/lab/TestTariffManager.tsx implements multi-select, bulk delete, and category navigation", () => {
    const tariffManagerPath = path.join(ROOT, "components/lab/TestTariffManager.tsx");
    const content = fs.readFileSync(tariffManagerPath, "utf8");
    assert.match(content, /bulkDeleteDiagnosticTestsAction/);
    assert.match(content, /selectedTestIds/);
    assert.match(content, /toggleSelectAllVisible/);
    assert.match(content, /isBulkDeleteModalOpen/);
    assert.match(content, /handleBulkDeleteConfirm/);
    assert.match(content, /viewMode/);
    assert.match(content, /groupedByCategory/);
    assert.match(content, /ক্যাটাগরি ভিত্তিক গ্রুপ ভিউ/);
    assert.match(content, /নির্বাচিত টেস্ট মুছুন/);
  });

  // 3. Bed-Cabin Price Persistence & Mapping
  await t.test("3. lib/ipd/bed-actions.ts maps effective daily_rate onto BedRecord and synchronizes bed_type", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    const content = fs.readFileSync(bedActionsPath, "utf8");
    assert.match(content, /effectiveDailyRate/);
    assert.match(content, /daily_rate: effectiveDailyRate/);
    assert.match(content, /export async function updateBedDetailsAction/);
    assert.match(content, /export async function updateCabinDetailsAction/);
  });

  // 4. Bed Card & Modal Prioritization
  await t.test("4. app/beds/page.tsx and modals prioritize individual bed.daily_rate over generic defaults", () => {
    const bedsPagePath = path.join(ROOT, "app/(hospital)/app/beds/page.tsx");
    const editModalPath = path.join(ROOT, "components/beds/EditBedOrCabinModal.tsx");
    const assignModalPath = path.join(ROOT, "components/beds/AssignBedModal.tsx");
    const occupiedPanelPath = path.join(ROOT, "components/beds/OccupiedBedPanel.tsx");

    const bedsContent = fs.readFileSync(bedsPagePath, "utf8");
    const editContent = fs.readFileSync(editModalPath, "utf8");
    const assignContent = fs.readFileSync(assignModalPath, "utf8");
    const occupiedContent = fs.readFileSync(occupiedPanelPath, "utf8");

    assert.match(bedsContent, /bed\.daily_rate \?\? bed\.bed_type\?\.daily_rate/);
    assert.match(editContent, /bed\.daily_rate \?\? bed\.bed_type\?\.daily_rate/);
    assert.match(assignContent, /selectedBed\?\.daily_rate \?\? selectedBed\?\.bed_type\?\.daily_rate/);
    assert.match(occupiedContent, /bed\.daily_rate \?\? bed\.bed_type\?\.daily_rate/);
  });
});
