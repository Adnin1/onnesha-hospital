import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkSystemHealth, getPublicHealthCheck, sanitizeErrorForTelemetry } from "../lib/health.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 19 Backup, Monitoring & Disaster Recovery (10 Scenarios)", async () => {

  test("1. Public health check returns safe minimal status without sensitive details", () => {
    const pub = getPublicHealthCheck();
    assert.equal(pub.status, "ok");
    assert.ok(pub.timestamp, "Timestamp required");
    assert.equal(Object.keys(pub).length, 2, "Public health must only contain status & timestamp");
  });

  test("2. Internal system health check measures database, auth, outbox, and storage", async () => {
    const health = await checkSystemHealth();
    assert.ok(health.status, "Health status required");
    assert.ok(health.checks.database, "Database check required");
    assert.ok(health.checks.auth, "Auth check required");
    assert.ok(health.checks.outbox, "Outbox check required");
    assert.ok(health.checks.storage, "Storage check required");
  });

  test("3. Error sanitizer strips PHI, patient IDs, and numeric identifiers from telemetry", () => {
    const err = new Error("Failed to update patient P-202609-00123 with NID 1990123456789012");
    const sanitized = sanitizeErrorForTelemetry(err);
    assert.ok(!sanitized.message.includes("P-202609-00123"), "Patient ID must be redacted");
    assert.ok(!sanitized.message.includes("1990123456789012"), "NID must be redacted");
    assert.ok(sanitized.message.includes("[REDACTED_PATIENT_ID]"), "Redaction label expected");
  });

  test("4. Backup documentation defines RPO, RTO, and Supabase managed backup policy", () => {
    const backupDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_BACKUP.md"), "utf8");
    assert.ok(backupDoc.includes("RPO"), "RPO required");
    assert.ok(backupDoc.includes("RTO"), "RTO required");
    assert.ok(backupDoc.includes("PITR") || backupDoc.includes("Point-in-Time"), "PITR required");
  });

  test("5. Restore drill documentation details database restoration protocol", () => {
    const restoreDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_RESTORE.md"), "utf8");
    assert.ok(restoreDoc.includes("Restore"), "Restore protocol required");
    assert.ok(restoreDoc.includes("verification"), "Verification step required");
  });

  test("6. Disaster recovery plan addresses database corruption, outage, and secret leak", () => {
    const drDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_DISASTER_RECOVERY.md"), "utf8");
    assert.ok(drDoc.includes("Corruption"), "Corruption scenario required");
    assert.ok(drDoc.includes("Outage"), "Outage scenario required");
  });

  test("7. Security incident documentation specifies credential revocation procedure", () => {
    const incidentDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_SECURITY_INCIDENT.md"), "utf8");
    assert.ok(incidentDoc.includes("Rotation") || incidentDoc.includes("Revocation"), "Credential revocation required");
    assert.ok(incidentDoc.includes("Audit"), "Audit log inspection required");
  });

  test("8. Alerting specification defines critical thresholds for downtime and outbox stuck", () => {
    const alertDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_ALERTING.md"), "utf8");
    assert.ok(alertDoc.includes("Threshold"), "Thresholds required");
    assert.ok(alertDoc.includes("Escalation"), "Escalation matrix required");
  });

  test("9. Monitoring documentation explicitly forbids sending PHI to telemetry", () => {
    const monDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_MONITORING.md"), "utf8");
    assert.ok(monDoc.includes("PHI") || monDoc.includes("PII") || monDoc.includes("Sanitized"), "PHI protection mandated");
  });

  test("10. Business continuity plan defines hospital operational safeguards during cloud outage", () => {
    const bcDoc = fs.readFileSync(path.join(ROOT, "docs/PHASE_19_BUSINESS_CONTINUITY.md"), "utf8");
    assert.ok(bcDoc.includes("Hospital") || bcDoc.includes("Operational"), "Hospital safeguards required");
  });
});
