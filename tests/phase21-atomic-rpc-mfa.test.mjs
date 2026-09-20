import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 21 Source-Level Security, Atomic RPC & MFA Verification (10 Scenarios)", async () => {

  test("1. session.ts requireAAL2 is strictly fail-closed for unauthenticated or non-AAL2 sessions", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    assert.ok(fs.existsSync(sessionPath), "lib/auth/session.ts must exist");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes("export async function requireAAL2()"), "requireAAL2 export required");
    assert.ok(content.includes("mfaFactorsCount <= 0"), "Fail-closed check for zero MFA factors required");
    assert.ok(content.includes("aalLevel !== \"aal2\""), "Fail-closed check for AAL2 level required");
  });

  test("2. Migration 027 defines atomic single-transaction RPC book_staff_appointment_atomic", () => {
    const migPath = path.join(ROOT, "supabase/migrations/027_phase21_atomic_appointment_booking.sql");
    assert.ok(fs.existsSync(migPath), "Migration 027 file must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("book_staff_appointment_atomic"), "book_staff_appointment_atomic RPC required");
    assert.ok(content.includes("SET search_path = public"), "search_path isolation required");
    assert.ok(content.toLowerCase().includes("insert into waiting_queue"), "waiting_queue atomic insertion required");
    assert.ok(content.toLowerCase().includes("insert into audit_logs"), "audit_logs atomic insertion required");
  });

  test("3. Migration 027 hardens book_online_appointment with SET search_path and capacity validation", () => {
    const migPath = path.join(ROOT, "supabase/migrations/027_phase21_atomic_appointment_booking.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("book_online_appointment"), "book_online_appointment RPC required");
    assert.ok(content.includes("p_appointment_date < CURRENT_DATE"), "Past date check required");
    assert.ok(content.includes("v_booked_count >= v_capacity"), "Capacity enforcement required");
  });

  test("4. Audit log logger.ts contains fail-closed error throw on persistence failure", () => {
    const loggerPath = path.join(ROOT, "lib/audit/logger.ts");
    const content = fs.readFileSync(loggerPath, "utf8");
    assert.ok(content.includes("throw"), "Logger must throw on error");
    assert.ok(!content.includes("assert.ok(true)"), "No assertion swallow allowed");
  });

  test("5. Doctor schedule action validates endTime strictly greater than startTime", () => {
    const actionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("params.endTime <= params.startTime"), "Schedule time validation required");
  });

  test("6. Doctor schedule action maps dayOfWeek into canonical day string (SATURDAY..FRIDAY)", () => {
    const actionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("DAYS_MAP"), "DAYS_MAP required for canonical string conversion");
    assert.ok(content.includes("SUNDAY"), "Canonical SUNDAY mapping required");
  });

  test("7. Doctor creation action requires mandatory full_name, specialization, and bmdcRegNumber", () => {
    const actionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("!params.fullName?.trim()"), "Mandatory full name check required");
    assert.ok(content.includes("!params.bmdcRegNumber?.trim()"), "Mandatory BMDC registration check required");
  });

  test("8. Staff appointment booking action calls atomic RPC book_staff_appointment_atomic", () => {
    const actionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("book_staff_appointment_atomic"), "Staff booking must use atomic RPC");
  });

  test("9. Public appointment page loads dynamic doctor schedules instead of static array", () => {
    const apptPagePath = path.join(ROOT, "app/(public)/appointment/page.tsx");
    const content = fs.readFileSync(apptPagePath, "utf8");
    assert.ok(content.includes("getPublicDoctorSchedulesAction"), "Dynamic doctor schedules loader required");
    assert.ok(!content.includes('min="2026-09-12"'), "Hardcoded past min date must be removed");
  });

  test("10. Public actions library exports getPublicDoctorSchedulesAction", () => {
    const pubActionsPath = path.join(ROOT, "lib/public/actions.ts");
    const content = fs.readFileSync(pubActionsPath, "utf8");
    assert.ok(content.includes("getPublicDoctorSchedulesAction"), "Public schedules action export required");
  });
});
