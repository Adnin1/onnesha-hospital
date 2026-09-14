import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 6 Inpatient Bed Inventory & OT Suite (10 Scenarios)", () => {
  // Scenario 1: types/beds-ot.ts defines Bed, Cabin, and OT models
  test("1. types/beds-ot.ts defines WardRecord, BedRecord, CabinRecord, OTBookingRecord", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "beds-ot.ts"), "utf8");
    assert.match(typesContent, /export interface WardRecord/);
    assert.match(typesContent, /export interface BedRecord/);
    assert.match(typesContent, /export interface CabinRecord/);
    assert.match(typesContent, /export interface BedAssignmentRecord/);
    assert.match(typesContent, /export interface OTRoomRecord/);
    assert.match(typesContent, /export interface OTBookingRecord/);
  });

  // Scenario 2: getBedsAndCabinsAction fetches wards, beds, and active assignments
  test("2. getBedsAndCabinsAction retrieves beds, cabins, and active assignments mapped to patient details", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "ipd", "bed-actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getBedsAndCabinsAction/);
    assert.match(actionsContent, /\.from\("wards"\)/);
    assert.match(actionsContent, /\.from\("beds"\)/);
    assert.match(actionsContent, /\.from\("cabins"\)/);
    assert.match(actionsContent, /\.from\("bed_assignments"\)/);
  });

  // Scenario 3: assignBedAction enforces permission and vacant check
  test("3. assignBedAction asserts ipd.manage permission and validates vacancy", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "ipd", "bed-actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("ipd\.manage"\)/);
    assert.match(actionsContent, /status !== "VACANT"/);
    assert.match(actionsContent, /recordAuditLog/);
  });

  // Scenario 4: vacateBedAction updates assignment and marks bed for cleaning
  test("4. vacateBedAction sets assignment to VACATED and changes bed status to CLEANING", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "ipd", "bed-actions.ts"), "utf8");
    assert.match(actionsContent, /export async function vacateBedAction/);
    assert.match(actionsContent, /status:\s*"CLEANING"/);
    assert.match(actionsContent, /status:\s*"VACATED"/);
  });

  // Scenario 5: updateBedStatusAction updates bed status and audits
  test("5. updateBedStatusAction enforces ipd.manage permission and updates status", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "ipd", "bed-actions.ts"), "utf8");
    assert.match(actionsContent, /export async function updateBedStatusAction/);
    assert.match(actionsContent, /entityType:\s*"bed"/);
  });

  // Scenario 6: lib/ot/actions.ts provides getOTBookingsAction, bookOTAction, updateOTBookingStatusAction
  test("6. lib/ot/actions.ts manages OT procedures and surgeon schedules", () => {
    const otActions = fs.readFileSync(path.join(rootDir, "lib", "ot", "actions.ts"), "utf8");
    assert.match(otActions, /export async function getOTBookingsAction/);
    assert.match(otActions, /export async function bookOTAction/);
    assert.match(otActions, /export async function updateOTBookingStatusAction/);
    assert.match(otActions, /requirePermission\("ot\.manage"\)/);
  });

  // Scenario 7: app/beds/page.tsx uses real database actions and has zero mock data imports
  test("7. app/beds/page.tsx has zero mock data imports and uses getBedsAndCabinsAction", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "beds", "page.tsx"), "utf8");
    assert.doesNotMatch(pageContent, /mock-data/);
    assert.match(pageContent, /getBedsAndCabinsAction/);
    assert.match(pageContent, /updateBedStatusAction/);
    assert.match(pageContent, /vacateBedAction/);
  });

  // Scenario 8: app/ot/page.tsx uses real database actions and has zero mock data imports
  test("8. app/ot/page.tsx has zero mock data imports and connects to live OT bookings", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "ot", "page.tsx"), "utf8");
    assert.doesNotMatch(pageContent, /mock-data/);
    assert.match(pageContent, /getOTBookingsAction/);
    assert.match(pageContent, /bookOTAction/);
    assert.match(pageContent, /updateOTBookingStatusAction/);
  });

  // Scenario 9: Migration 013 defines bed_assignments and ot_bookings tables
  test("9. Migration 013 specifies beds, cabins, assignments and ot_bookings schema", () => {
    const migContent = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "013_beds_ot.sql"), "utf8");
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS bed_assignments/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS ot_bookings/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS cabins/);
  });

  // Scenario 10: Bed management supports both Wards and Private Cabins
  test("10. Bed management interface supports toggle between ward beds and private cabins", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "beds", "page.tsx"), "utf8");
    assert.match(pageContent, /activeTab === "beds"/);
    assert.match(pageContent, /Private Cabins/);
  });
});
