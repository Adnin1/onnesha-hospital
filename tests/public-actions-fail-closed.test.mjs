import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ACTIONS_PATH = path.join(ROOT, "lib/public/actions.ts");

test("Public Actions Fail-Closed & Anti-Fabrication Security Suite", async (t) => {
  assert.ok(fs.existsSync(ACTIONS_PATH), "lib/public/actions.ts must exist");
  const actionsCode = fs.readFileSync(ACTIONS_PATH, "utf8");

  await t.test("1. Absolute zero occurrence of hermetic fake appointment confirmation constants", () => {
    assert.doesNotMatch(actionsCode, /apt-hermetic/, "Must not contain fake appointmentId apt-hermetic");
    assert.doesNotMatch(actionsCode, /P-2026-HERMETIC/, "Must not contain fake patientCode P-2026-HERMETIC");
    assert.doesNotMatch(actionsCode, /isHermeticOrNetworkFallback/, "Must not contain isHermeticOrNetworkFallback");
    assert.doesNotMatch(actionsCode, /HERMETIC_FALLBACK_DOCTORS/, "Must not contain HERMETIC_FALLBACK_DOCTORS");
    assert.doesNotMatch(actionsCode, /HERMETIC_FALLBACK_SCHEDULES/, "Must not contain HERMETIC_FALLBACK_SCHEDULES");
    assert.doesNotMatch(actionsCode, /HERMETIC_FALLBACK_DEPARTMENTS/, "Must not contain HERMETIC_FALLBACK_DEPARTMENTS");
  });

  await t.test("2. bookOnlineAppointmentAction returns error when RPC fails or returns no data", () => {
    // Verify that when rpcErr or !rpcRes occurs, it returns { success: false, error: ... }
    assert.match(
      actionsCode,
      /if\s*\(\s*rpcErr\s*\|\|\s*!rpcRes\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false/
    );
  });

  await t.test("3. bookOnlineAppointmentAction returns error on exception instead of fabricated success", () => {
    assert.match(
      actionsCode,
      /catch\s*\(\s*err:\s*unknown\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false/
    );
  });

  await t.test("4. getPublicDoctorsAction returns failure on rpcError and exception", () => {
    assert.match(
      actionsCode,
      /if\s*\(\s*rpcError\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false,\s*doctors:\s*\[\],\s*error:/
    );
  });

  await t.test("5. getPublicDoctorSchedulesAction returns failure on error and exception", () => {
    assert.match(
      actionsCode,
      /if\s*\(\s*error\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false,\s*schedules:\s*\[\],\s*error:/
    );
  });

  await t.test("6. getPublicDepartmentsAction returns failure on error and exception", () => {
    assert.match(
      actionsCode,
      /if\s*\(\s*error\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false,\s*departments:\s*\[\],\s*error:/
    );
  });

  await t.test("7. submitContactInquiryAction returns failure on error and exception", () => {
    assert.match(
      actionsCode,
      /if\s*\(\s*error\s*\)\s*\{[\s\S]*?return\s*\{\s*success:\s*false,\s*error:/
    );
  });
});
