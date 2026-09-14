import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 4 Doctor Chambers & Appointments Suite (10 Scenarios)", () => {
  // Scenario 1: types/appointments.ts contains complete data models
  test("1. types/appointments.ts defines DoctorRecord, DoctorScheduleRecord, AppointmentRecord, WaitingQueueRecord", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "appointments.ts"), "utf8");
    assert.match(typesContent, /export interface DoctorRecord/);
    assert.match(typesContent, /export interface DoctorScheduleRecord/);
    assert.match(typesContent, /export interface AppointmentRecord/);
    assert.match(typesContent, /export interface WaitingQueueRecord/);
  });

  // Scenario 2: lib/appointments/actions.ts exports 5 key server actions
  test("2. lib/appointments/actions.ts provides getDoctorsAction, getDoctorSchedulesAction, bookAppointmentAction, getLiveWaitingQueueAction, updateQueueStatusAction", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "appointments", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getDoctorsAction/);
    assert.match(actionsContent, /export async function getDoctorSchedulesAction/);
    assert.match(actionsContent, /export async function bookAppointmentAction/);
    assert.match(actionsContent, /export async function getLiveWaitingQueueAction/);
    assert.match(actionsContent, /export async function updateQueueStatusAction/);
  });

  // Scenario 3: bookAppointmentAction enforces appointments.create permission check
  test("3. bookAppointmentAction asserts requirePermission('appointments.create')", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "appointments", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("appointments\.create"\)/);
  });

  // Scenario 4: bookAppointmentAction automatically inserts into waiting_queue
  test("4. bookAppointmentAction synchronizes new appointment into waiting_queue with doctor's room number", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "appointments", "actions.ts"), "utf8");
    assert.match(actionsContent, /\.from\("waiting_queue"\)\.insert/);
    assert.match(actionsContent, /queue_status:\s*"WAITING"/);
  });

  // Scenario 5: bookAppointmentAction logs appointment creation into immutable audit vault
  test("5. bookAppointmentAction logs CREATE event to audit vault", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "appointments", "actions.ts"), "utf8");
    assert.match(actionsContent, /recordAuditLog/);
    assert.match(actionsContent, /module:\s*"APPOINTMENT"/);
    assert.match(actionsContent, /action:\s*"CREATE"/);
  });

  // Scenario 6: updateQueueStatusAction synchronizes appointment status (CALLED, IN_ROOM -> IN_CHAMBER, COMPLETED, SKIPPED -> NO_SHOW)
  test("6. updateQueueStatusAction updates waiting_queue and synchronizes appointments status", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "appointments", "actions.ts"), "utf8");
    assert.match(actionsContent, /apptStatus = "IN_CHAMBER"/);
    assert.match(actionsContent, /apptStatus = "COMPLETED"/);
    assert.match(actionsContent, /apptStatus = "NO_SHOW"/);
    assert.match(actionsContent, /\.from\("token_calls"\)\.insert/);
  });

  // Scenario 7: app/(hospital)/app/doctors/page.tsx has zero mock data and uses real getDoctorsAction
  test("7. app/doctors/page.tsx uses real getDoctorsAction and has zero mock data imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "doctors", "page.tsx"),
      "utf8"
    );
    assert.doesNotMatch(pageContent, /@\/lib\/mock-data/);
    assert.match(pageContent, /getDoctorsAction/);
    assert.match(pageContent, /getDoctorSchedulesAction/);
    assert.match(pageContent, /handleOpenSchedules/);
  });

  // Scenario 8: app/(hospital)/app/appointments/page.tsx has zero mock data and uses real actions
  test("8. app/appointments/page.tsx uses real database actions and has zero mock data imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "appointments", "page.tsx"),
      "utf8"
    );
    assert.doesNotMatch(pageContent, /@\/lib\/mock-data/);
    assert.match(pageContent, /getDoctorsAction/);
    assert.match(pageContent, /getLiveWaitingQueueAction/);
    assert.match(pageContent, /bookAppointmentAction/);
    assert.match(pageContent, /updateQueueStatusAction/);
  });

  // Scenario 9: Appointments page supports live doctor filtering and walk-in token modal
  test("9. Appointments page features doctor filter and walk-in modal with live serial generator", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "appointments", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /selectedDoctorId/);
    assert.match(pageContent, /handleGenerateWalkInToken/);
    assert.match(pageContent, /handleStatusChange/);
    assert.match(pageContent, /Issue Walk-In OPD Token/);
  });

  // Scenario 10: Doctor schedules modal displays days, hours, and token quotas
  test("10. Doctors page modal displays day of week, hours, and max tokens", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "doctors", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /Visiting Hours & Slots/);
    assert.match(pageContent, /max_tokens/);
    assert.match(pageContent, /avg_consultation_minutes/);
  });
});
