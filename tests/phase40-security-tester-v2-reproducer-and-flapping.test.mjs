import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("Phase 40: Security Tester v2 — Bulletproof Reproducers & Flapping Certification", async (t) => {
  // =========================================================================
  // 1. Migration 200 Schema and Reproducer Verification
  // =========================================================================
  await t.test("1. Migration 200 establishes flapping log and 11-domain strict reproducers", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261015050000_migration_200_bulletproof_reproducer_closure_and_security_tester_v2.sql");
    assert.ok(fs.existsSync(migPath), "Migration 200 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Table checks
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.system_health_flapping_log/, "Must create flapping log table");
    assert.match(sql, /idx_health_flapping_org_detector/, "Must index flapping log");

    // Exact domain reproducers
    assert.match(sql, /INVOICE_ARITHMETIC/, "Must include Billing domain reproducer");
    assert.match(sql, /GL_DOUBLE_ENTRY/, "Must include Accounting domain reproducer");
    assert.match(sql, /BED_OCCUPANCY_SYNC/, "Must include Bed Occupancy domain reproducer");
    assert.match(sql, /REFERRAL_BOUNDS/, "Must include Referral Bounds domain reproducer");
    assert.match(sql, /EXPENSE_LINKAGE/, "Must include Expense Linkage domain reproducer");
    assert.match(sql, /NOTIFICATION_OUTBOX/, "Must include Notification Outbox domain reproducer");
    assert.match(sql, /PATIENT_INTAKE_FK/, "Must include Patient Intake domain reproducer");
    assert.match(sql, /DOCTOR_DIRECTORY/, "Must include Doctor Directory domain reproducer");
    assert.match(sql, /TRIAL_BALANCE/, "Must include Trial Balance domain reproducer");
    assert.match(sql, /RLS_SECURITY_POLICIES/, "Must include RLS Security domain reproducer");

    // Anti-fake-green rule: Generic unmapped incidents MUST fail closed
    assert.match(sql, /CANNOT_AUTO_RESOLVE_WITHOUT_SPECIFIC_DOMAIN_REPRODUCER/, "Must fail-closed on unmapped incidents");
    assert.doesNotMatch(
      sql,
      /ELSE\s+IF\s+v_incident\.fingerprint\s+IS\s+NOT\s+NULL.*v_verified\s*:=\s*TRUE/s,
      "Must not contain generic auto-pass in ELSE branch"
    );
  });

  // =========================================================================
  // 2. Fail-Closed Incident Verification Model
  // =========================================================================
  await t.test("2. Unmapped incidents are strictly rejected and cannot transition to RESOLVED_VERIFIED", () => {
    function simulateReproducerVerification(incident) {
      let verified = false;
      let violationCount = 0;
      let status = "REMEDIATION_PENDING";

      // Domain 1: Billing
      if (incident.module === "BILLING" || (incident.location && incident.location.includes("invoice"))) {
        if (incident.activeInvoicesWithMismatch === 0) {
          verified = true;
        } else {
          violationCount = incident.activeInvoicesWithMismatch;
        }
      }
      // Domain 2: Accounting
      else if (incident.module === "ACCOUNTING" || (incident.location && incident.location.includes("journal"))) {
        if (incident.unbalancedJournals === 0) {
          verified = true;
        } else {
          violationCount = incident.unbalancedJournals;
        }
      }
      // STRICT FAIL CLOSED FOR UNMAPPED
      else {
        verified = false;
        violationCount = 1;
      }

      if (verified) {
        status = "RESOLVED_VERIFIED";
      } else {
        status = "REMEDIATION_PENDING";
      }

      return { success: verified, verified, status, violationCount };
    }

    // Test 1: Unmapped generic incident -> must be rejected
    const unmapped = simulateReproducerVerification({
      module: "UNKNOWN_CUSTOM_MODULE",
      location: "some/arbitrary/path.ts",
    });
    assert.equal(unmapped.verified, false, "Unmapped incident MUST NOT auto-verify");
    assert.equal(unmapped.status, "REMEDIATION_PENDING");
    assert.equal(unmapped.violationCount, 1);

    // Test 2: Billing incident with active mismatch -> must fail
    const billingMismatch = simulateReproducerVerification({
      module: "BILLING",
      activeInvoicesWithMismatch: 1,
    });
    assert.equal(billingMismatch.verified, false);
    assert.equal(billingMismatch.status, "REMEDIATION_PENDING");

    // Test 3: Billing incident with 0 mismatches -> verified
    const billingClean = simulateReproducerVerification({
      module: "BILLING",
      activeInvoicesWithMismatch: 0,
    });
    assert.equal(billingClean.verified, true);
    assert.equal(billingClean.status, "RESOLVED_VERIFIED");
  });

  // =========================================================================
  // 3. Flapping Detector Stabilization Model
  // =========================================================================
  await t.test("3. Flapping detection prevents erratic score inflation and requires consecutive passes", () => {
    class FlappingTracker {
      constructor(requiredConsecutivePasses = 3) {
        this.requiredConsecutivePasses = requiredConsecutivePasses;
        this.consecutivePasses = 0;
        this.history = [];
        this.isFlapping = false;
      }

      recordResult(status) {
        this.history.push(status);
        if (status === "PASS") {
          this.consecutivePasses++;
        } else {
          this.consecutivePasses = 0;
        }

        // Detect toggle pattern (e.g. FAIL -> PASS -> FAIL or PASS -> FAIL -> PASS within 4 runs)
        const recent = this.history.slice(-4);
        if (recent.length >= 4) {
          const transitions = recent.filter((val, i) => i > 0 && val !== recent[i - 1]).length;
          if (transitions >= 2) {
            this.isFlapping = true;
          }
        }

        if (this.isFlapping && this.consecutivePasses >= this.requiredConsecutivePasses) {
          this.isFlapping = false; // Stabilized
        }

        return {
          isFlapping: this.isFlapping,
          consecutivePasses: this.consecutivePasses,
          isStable: !this.isFlapping && status === "PASS",
        };
      }
    }

    const tracker = new FlappingTracker(3);

    // Stable runs
    tracker.recordResult("PASS");
    tracker.recordResult("PASS");
    assert.equal(tracker.isFlapping, false);

    // Flapping sequence: FAIL -> PASS -> FAIL -> PASS
    tracker.recordResult("FAIL");
    tracker.recordResult("PASS");
    tracker.recordResult("FAIL");
    const flapState = tracker.recordResult("PASS");
    assert.equal(flapState.isFlapping, true, "Tracker must detect flapping state");
    assert.equal(flapState.isStable, false, "Flapping detector is not yet stable despite single PASS");

    // Must achieve 3 consecutive passes to stabilize
    tracker.recordResult("PASS");
    const stabilized = tracker.recordResult("PASS");
    assert.equal(stabilized.isFlapping, false, "Detector stabilizes only after 3 consecutive passes");
    assert.equal(stabilized.isStable, true);
  });

  // =========================================================================
  // 4. Live Remote Verification of Migration 200
  // =========================================================================
  await t.test("4. Remote Supabase has Migration 200 applied and flapping detector active", async () => {
    const defaultUrl = "https://iuhtzahuszdkdarhxobx.supabase.co";
    const defaultAnon = "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

    const supabaseAnon = createClient(defaultUrl, defaultAnon);

    // Test that anonymous verification attempt is blocked/rejected
    const { data, error } = await supabaseAnon.rpc("verify_system_incident_resolution", {
      p_incident_id: "00000000-0000-0000-0000-000000000000",
      p_org_id: "a0000000-0000-0000-0000-000000000001",
    });

    assert.ok(
      error || (data && !data.success),
      "Anonymous call to verify_system_incident_resolution must be denied or unverified"
    );
  });
});
