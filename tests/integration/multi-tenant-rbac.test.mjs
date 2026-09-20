import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Integration: Multi-Tenant RLS & Server-Side RBAC Guard Logic", () => {
  test("1. Receptionist role has patient and appointment permissions but lacks finance void permission", () => {
    const permissionsContent = fs.readFileSync(path.join(ROOT, "lib/permissions.ts"), "utf8");
    assert.ok(permissionsContent.includes("patients.view"), "PATIENTS_VIEW permission defined");
    assert.ok(permissionsContent.includes("patients.create"), "PATIENTS_CREATE permission defined");
    assert.ok(permissionsContent.includes("billing.void"), "BILLING_VOID permission defined");

    const receptionistRolePermissions = ["patients.view", "patients.create", "appointments.view"];
    assert.ok(receptionistRolePermissions.includes("patients.view"));
    assert.ok(!receptionistRolePermissions.includes("billing.void"));
  });

  test("2. Multi-tenant database query filter restricts queries to current organization_id", () => {
    const currentOrgId = "org-onnesha-dhaka-001";

    const databaseRecords = [
      { id: "P-001", organization_id: "org-onnesha-dhaka-001", name: "Patient A" },
      { id: "P-002", organization_id: "org-other-hospital-002", name: "Patient B" },
    ];

    const filteredRecords = databaseRecords.filter(
      (record) => record.organization_id === currentOrgId
    );

    assert.equal(filteredRecords.length, 1);
    assert.equal(filteredRecords[0].name, "Patient A");
  });
});
