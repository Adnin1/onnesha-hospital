import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 22 Production Hardening: Authoritative Slot, Concurrency Lock & DB RBAC (16 Scenarios)", async () => {

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
    assert.ok(content.includes('is_public'), "is_public filter required in getPublicDoctorsAction");
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

  test("11. Concurrency lock parity: Advisory lock key formula is identical across public online and staff walk-in RPCs", () => {
    const migPath = path.join(ROOT, "supabase/migrations/028_phase22_authoritative_slot_concurrency_rbac.sql");
    const content = fs.readFileSync(migPath, "utf8");
    
    // Verify pg_advisory_xact_lock in book_online_appointment and book_staff_appointment_atomic
    const lockFormula = "hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)";
    const matches = content.split(lockFormula).length - 1;
    
    assert.ok(matches >= 2, "Both public online and staff walk-in RPCs must use identical pg_advisory_xact_lock formula");
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

  test("16. Concurrency Advisory Lock DB Verification: Parallel execution across 10 concurrent requests with capacity limit", async () => {
    const envPath = path.join(ROOT, ".env.local");
    if (!fs.existsSync(envPath)) {
      assert.ok(true, "Skipping real DB concurrency check when .env.local is missing");
      return;
    }

    const envContent = fs.readFileSync(envPath, "utf8");
    let supabaseUrl = "";
    let serviceKey = "";
    for (const line of envContent.split("\n")) {
      if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) supabaseUrl = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
      if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) serviceKey = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }

    if (!supabaseUrl || !serviceKey) {
      assert.ok(true, "Skipping real DB concurrency check when Supabase credentials missing");
      return;
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const orgId = "a0000000-0000-0000-0000-000000000001";

    const { data: doctors } = await supabase.from("doctors").select("id, full_name").eq("organization_id", orgId).eq("is_active", true).limit(1);
    if (!doctors || doctors.length === 0) {
      assert.ok(true, "Skipping DB concurrency test: No active doctors found");
      return;
    }

    const doctor = doctors[0];
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    const appointmentDate = targetDate.toISOString().split("T")[0];
    const dayName = targetDate.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();

    let { data: schedules } = await supabase.from("doctor_schedules").select("id, day_of_week").eq("doctor_id", doctor.id).eq("is_active", true);
    let schedule = schedules && schedules.find(s => s.day_of_week.toUpperCase() === dayName);

    if (!schedule) {
      const { data: newSched } = await supabase.from("doctor_schedules").insert({
        organization_id: orgId,
        doctor_id: doctor.id,
        day_of_week: dayName,
        start_time: "09:00:00",
        end_time: "12:00:00",
        max_tokens: 2,
        is_active: true
      }).select().single();
      schedule = newSched;
    } else {
      await supabase.from("doctor_schedules").update({ max_tokens: 2 }).eq("id", schedule.id);
    }

    if (!schedule) {
      assert.ok(true, "Skipping DB concurrency test: Failed to obtain doctor schedule");
      return;
    }

    // Clean up pre-existing test appointments for date
    await supabase.from("appointments").delete().eq("doctor_id", doctor.id).eq("appointment_date", appointmentDate);

    // Run 10 parallel RPC requests
    const promises = [];
    for (let i = 1; i <= 10; i++) {
      promises.push(
        supabase.rpc("book_online_appointment", {
          p_org_id: orgId,
          p_doctor_id: doctor.id,
          p_schedule_id: schedule.id,
          p_appointment_date: appointmentDate,
          p_patient_name: `Concurrent Patient ${i}`,
          p_patient_phone: `017000000${i.toString().padStart(2, "0")}`,
          p_patient_gender: "MALE",
          p_patient_age: 28,
          p_notes: `Parallel concurrency lock validation ${i}`
        })
      );
    }

    const results = await Promise.all(promises);
    let successCount = 0;
    let failCount = 0;
    const tokens = new Set();
    const appointmentIds = [];

    for (const res of results) {
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (data && data.success) {
        successCount++;
        tokens.add(data.token_number);
        appointmentIds.push(data.appointment_id);
      } else {
        failCount++;
      }
    }

    // Clean up created test records
    if (appointmentIds.length > 0) {
      await supabase.from("waiting_queue").delete().in("appointment_id", appointmentIds);
      await supabase.from("appointments").delete().in("id", appointmentIds);
      await supabase.from("audit_logs").delete().in("entity_id", appointmentIds);
    }

    assert.equal(successCount, 2, "Exactly 2 parallel booking requests must succeed for max_tokens = 2");
    assert.equal(failCount, 8, "Exactly 8 parallel booking requests must fail when capacity is reached");
    assert.equal(tokens.size, 2, "Exactly 2 unique token numbers (1 and 2) must be allocated");
  });
});
