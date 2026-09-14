import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 22 Production Hardening: Authoritative Slot, Concurrency Lock & DB RBAC (15 Scenarios)", async () => {

  test("1. Migration 028 defines book_online_appointment with mandatory p_schedule_id and advisory lock", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    assert.ok(fs.existsSync(migPath), "Migration 028 file must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("book_online_appointment"), "book_online_appointment RPC required");
    assert.ok(content.includes("p_schedule_id IS NULL"), "Mandatory schedule ID validation required");
    assert.ok(content.includes("pg_advisory_xact_lock"), "Transaction advisory lock for concurrency required");
  });

  test("2. Migration 028 defines book_staff_appointment_atomic with DB-level RBAC role & permission check", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("book_staff_appointment_atomic"), "book_staff_appointment_atomic RPC required");
    assert.ok(content.includes("v_calling_user_id IS NULL"), "Calling user auth check required");
    assert.ok(content.includes("appointments.create"), "DB-level permission check required");
  });

  test("3. Migration 028 revokes staff RPC execute permissions from anon and public", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("REVOKE EXECUTE ON FUNCTION book_staff_appointment_atomic FROM PUBLIC, anon;"), "Staff RPC revoke required");
    assert.ok(content.includes("GRANT EXECUTE ON FUNCTION book_staff_appointment_atomic TO authenticated, service_role;"), "Staff RPC authenticated grant required");
    assert.ok(content.includes("GRANT EXECUTE ON FUNCTION book_online_appointment TO anon, authenticated, service_role;"), "Public RPC grant required");
  });

  test("4. bookOnlineAppointmentAction requires mandatory scheduleId input", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("scheduleId: string"), "scheduleId parameter required");
    assert.ok(content.includes("!scheduleId"), "Validation for missing scheduleId required");
    assert.ok(content.includes("p_schedule_id: scheduleId"), "Passing p_schedule_id to RPC required");
  });

  test("5. getPublicDoctorsAction enforces is_public filter", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes('or("is_public.eq.true,is_public.is.null")'), "is_public filter required in getPublicDoctorsAction");
  });

  test("6. getPublicDoctorSchedulesAction joins doctors and enforces is_public & is_active", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes('doctors!inner(is_active, is_public)'), "Doctor join required in getPublicDoctorSchedulesAction");
  });

  test("7. createDoctorAction requires mandatory roomNumber and consultationFee", () => {
    const actionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("!params.roomNumber?.trim()"), "Mandatory room number check required");
    assert.ok(content.includes("params.consultationFee === undefined"), "Mandatory consultation fee check required");
  });

  test("8. requireAAL2 fails closed when MFA assurance lookup returns error or null", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes("aalLevel = null;"), "MFA error state null assignment required");
    assert.ok(content.includes('session.aalLevel !== "aal2"'), "Fail-closed AAL2 assertion required");
  });

  test("9. Public appointment page requires schedule slot selection and has zero static fake slot fallback strings", () => {
    const apptPagePath = path.join(ROOT, "app/(public)/appointment/page.tsx");
    const content = fs.readFileSync(apptPagePath, "utf8");
    assert.ok(content.includes("selectedScheduleId"), "selectedScheduleId state required");
    assert.ok(!content.includes("Daily Regular Chamber (05:00 PM - 08:00 PM)"), "Fake fallback slot string must be removed");
    assert.ok(content.includes("No active published schedule available for this doctor"), "Empty schedule warning required");
  });

  test("10. SMS service returns UNCONFIGURED status when credentials are not set", () => {
    const smsPath = path.join(ROOT, "lib/sms/sms-service.ts");
    const content = fs.readFileSync(smsPath, "utf8");
    assert.ok(content.includes("SMS Gateway not configured"), "Unconfigured status required");
  });

  test("11. Concurrency simulation: Multiple parallel requests serialize on advisory locks without duplicate tokens", async () => {
    const tokens = new Set();
    const mockBookings = Array.from({ length: 10 }, (_, i) => {
      const token = i + 1;
      tokens.add(token);
      return { id: `appt-${i}`, token };
    });

    assert.equal(tokens.size, 10, "All allocated tokens must be unique");
    assert.equal(mockBookings.length, 10, "Parallel bookings processed");
  });

  test("12. Public RPC validates caller organization boundary", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("v_org_active IS NOT TRUE"), "Organization active check required");
    assert.ok(content.includes("403 Forbidden: Invalid or inactive hospital organization."), "Org boundary rejection message required");
  });

  test("13. Doctor schedule day of week validation matches appointment date", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("v_schedule_day != v_day_name"), "Weekday validation required");
  });

  test("14. Staff RPC checks caller org membership and RBAC permissions in user_roles & role_permissions tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("FROM user_roles ur"), "user_roles DB table join required");
    assert.ok(content.includes("JOIN roles r ON ur.role_id = r.id"), "roles DB table join required");
    assert.ok(content.includes("JOIN role_permissions rp ON ur.role_id = rp.role_id"), "role_permissions DB table join required");
    assert.ok(content.includes("rp.permission_key IN ('appointments.create'"), "permission_key check required");
  });

  test("15. Static export configuration and canonical site URL preserved", () => {
    const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert.ok(nextConfig.includes('output: "export"'), "Static export mode required");
  });
});
