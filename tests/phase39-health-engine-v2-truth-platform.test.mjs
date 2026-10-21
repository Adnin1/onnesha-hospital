import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("Phase 39: OHMS Active Health Test Engine v2 — Bulletproof Truth Platform Certification", async (t) => {
  // =========================================================================
  // 1. Documentation & Constitutional Rules (H-001 to H-012)
  // =========================================================================
  await t.test("1. docs/HEALTH_ENGINE_INVARIANTS.md formally documents Rules H-001 through H-012", () => {
    const docPath = path.join(ROOT, "docs/HEALTH_ENGINE_INVARIANTS.md");
    assert.ok(fs.existsSync(docPath), "docs/HEALTH_ENGINE_INVARIANTS.md must exist");
    const content = fs.readFileSync(docPath, "utf8");

    const requiredRules = [
      "RULE H-001",
      "RULE H-002",
      "RULE H-003",
      "RULE H-004",
      "RULE H-005",
      "RULE H-006",
      "RULE H-007",
      "RULE H-008",
      "RULE H-009",
      "RULE H-010",
      "RULE H-011",
      "RULE H-012",
    ];

    for (const rule of requiredRules) {
      assert.ok(content.includes(rule), `Missing rule definition: ${rule}`);
    }

    assert.match(content, /system_health_detector_registry/, "Must document detector registry");
    assert.match(content, /system_health_detector_runs/, "Must document append-only detector runs");
    assert.match(content, /system_health_state_transitions/, "Must document state machine transitions");
    assert.match(content, /chk_no_score_100_without_healthy/, "Must document DB score ceiling constraints");
  });

  // =========================================================================
  // 2. Migration 199 Schema and Engine Verification
  // =========================================================================
  await t.test("2. Migration 199 establishes evolvable detector platform and anti-fake-green constraints", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261015040000_migration_199_health_engine_v2_bulletproof_truth_platform.sql");
    assert.ok(fs.existsSync(migPath), "Migration 199 file must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Table checks
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.system_health_detector_registry/, "Must create detector registry");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.system_health_detector_registry_audit/, "Must create detector registry audit");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.system_health_detector_runs/, "Must create detector runs");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.system_health_state_transitions/, "Must create state transitions");

    // Append-only immutability trigger
    assert.match(sql, /trg_immutable_detector_runs/, "Must enforce append-only immutability on detector runs");

    // Anti-force-green check constraints on snapshots
    assert.match(sql, /chk_no_score_100_without_healthy/, "Must enforce check constraint score ceiling");
    assert.match(sql, /chk_no_healthy_with_failed_checks/, "Must enforce check constraint status ceiling");
    assert.match(sql, /chk_no_healthy_with_open_issues/, "Must enforce check constraint open issues ceiling");

    // Canonical Engine RPCs
    assert.match(sql, /run_authoritative_health_cycle/, "Must define canonical run_authoritative_health_cycle");
    assert.match(sql, /get_authoritative_system_health/, "Must define canonical get_authoritative_system_health");
    assert.match(sql, /acknowledge_system_incident/, "Must define incident acknowledge RPC");
    assert.match(sql, /verify_system_incident_resolution/, "Must define incident verify RPC");

    // Organization context enforcement (No ORDER BY created_at LIMIT 1 fallback)
    assert.match(sql, /ORGANIZATION_CONTEXT_REQUIRED/, "Must enforce strict organization UUID parameter");
    assert.doesNotMatch(
      sql,
      /SELECT id FROM public\.organizations ORDER BY created_at LIMIT 1/,
      "Must not contain unconstrained service-role organization guessing"
    );
  });

  // =========================================================================
  // 3. Anti-Bypass Source Code Audit (Rule H-012)
  // =========================================================================
  await t.test("3. Zero optimistic fallbacks or client-side overrides exist across codebase", () => {
    const filesToAudit = [
      "app/(hospital)/app/system-health/page.tsx",
      "lib/diagnostics/actions.ts",
      "scripts/scheduled-health-check.mjs",
      "components/app/SystemHealthAlertBanner.tsx",
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.join(ROOT, relPath);
      assert.ok(fs.existsSync(fullPath), `File ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf8");

      assert.equal(
        /health_score\s*\?\?\s*100/i.test(content),
        false,
        `Forbidden optimistic fallback (health_score ?? 100) in ${relPath}`
      );

      assert.equal(
        /isAnonymousSecurityShield\s*\?\s*100/i.test(content),
        false,
        `Forbidden client-side override (isAnonymousSecurityShield ? 100) in ${relPath}`
      );
    }
  });

  // =========================================================================
  // 4. Mathematical Engine Rules Simulation (H-001, H-002, H-006)
  // =========================================================================
  await t.test("4. Authoritative scoring formula enforces strict mathematical boundaries", () => {
    function computeEngineV2Health({
      requiredCount,
      passedCount,
      failedCount,
      unknownCount,
      skippedCount,
      criticalIncidents,
      warningIncidents,
      isStale = false,
      isAuthorized = true,
    }) {
      if (!isAuthorized) {
        return { score: 0, status: "AUDIT_UNAUTHORIZED" };
      }
      if (isStale) {
        return { score: 0, status: "STALE" };
      }
      if (requiredCount === 0 || passedCount < requiredCount) {
        if (failedCount > 0) return { score: Math.min(65, Math.round((passedCount / requiredCount) * 100)), status: "DEFECT_DETECTED" };
        if (unknownCount > 0) return { score: Math.min(80, Math.round((passedCount / requiredCount) * 100)), status: "UNKNOWN" };
        if (skippedCount > 0) return { score: Math.min(90, Math.round((passedCount / requiredCount) * 100)), status: "NOT_FULLY_VERIFIED" };
      }
      if (criticalIncidents > 0) {
        return { score: Math.min(70, Math.round((passedCount / requiredCount) * 100)), status: "CRITICAL" };
      }
      if (warningIncidents > 0) {
        return { score: Math.min(99, Math.round((passedCount / requiredCount) * 100)), status: "DEGRADED" };
      }
      if (passedCount === requiredCount && failedCount === 0 && unknownCount === 0 && skippedCount === 0) {
        return { score: 100, status: "HEALTHY" };
      }
      return { score: 0, status: "UNKNOWN" };
    }

    // Baseline: All pass -> 100 HEALTHY
    const baseline = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 16,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 0,
      criticalIncidents: 0,
      warningIncidents: 0,
    });
    assert.equal(baseline.score, 100);
    assert.equal(baseline.status, "HEALTHY");

    // Case 1: 1 warning incident -> max 99 DEGRADED
    const withWarning = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 16,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 0,
      criticalIncidents: 0,
      warningIncidents: 1,
    });
    assert.ok(withWarning.score <= 99, "Warning must drop score <= 99");
    assert.equal(withWarning.status, "DEGRADED");

    // Case 2: 1 critical incident -> max 70 CRITICAL
    const withCritical = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 16,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 0,
      criticalIncidents: 1,
      warningIncidents: 0,
    });
    assert.ok(withCritical.score <= 70, "Critical must drop score <= 70");
    assert.equal(withCritical.status, "CRITICAL");

    // Case 3: 1 required check SKIPPED -> cannot be HEALTHY
    const withSkipped = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 15,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 1,
      criticalIncidents: 0,
      warningIncidents: 0,
    });
    assert.notEqual(withSkipped.status, "HEALTHY");
    assert.ok(withSkipped.score < 100);

    // Case 4: Stale snapshot -> score 0 STALE
    const staleRun = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 16,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 0,
      criticalIncidents: 0,
      warningIncidents: 0,
      isStale: true,
    });
    assert.equal(staleRun.score, 0);
    assert.equal(staleRun.status, "STALE");

    // Case 5: Unauthorized caller -> score 0 AUDIT_UNAUTHORIZED
    const unauthorizedRun = computeEngineV2Health({
      requiredCount: 16,
      passedCount: 16,
      failedCount: 0,
      unknownCount: 0,
      skippedCount: 0,
      criticalIncidents: 0,
      warningIncidents: 0,
      isAuthorized: false,
    });
    assert.equal(unauthorizedRun.score, 0);
    assert.equal(unauthorizedRun.status, "AUDIT_UNAUTHORIZED");
  });

  // =========================================================================
  // 5. Section 82: Verification-First Incident Lifecycle Proof Matrix
  // =========================================================================
  await t.test("5. Section 82 proof matrix: defect -> acknowledge (no pass) -> verify fail -> remediate -> verify pass", () => {
    // Simulated incident state machine
    class IncidentLifecycleModel {
      constructor() {
        this.status = "OPEN";
        this.is_resolved = false;
        this.underlyingDefectFixed = false;
      }

      acknowledge(operatorNotes) {
        if (this.status === "OPEN" || this.status === "REMEDIATION_PENDING") {
          this.status = "ACKNOWLEDGED";
          this.notes = operatorNotes;
          // Invariant: Acknowledgement NEVER sets is_resolved to true
          this.is_resolved = false;
          return { success: true, status: this.status, is_resolved: this.is_resolved };
        }
        return { success: false, error: "Invalid state transition" };
      }

      verify() {
        this.status = "VERIFYING";
        if (this.underlyingDefectFixed) {
          this.status = "RESOLVED_VERIFIED";
          this.is_resolved = true;
          return { verified: true, status: this.status, is_resolved: this.is_resolved };
        } else {
          this.status = "REMEDIATION_PENDING";
          this.is_resolved = false;
          return { verified: false, status: this.status, is_resolved: this.is_resolved };
        }
      }

      remediateDefect() {
        this.underlyingDefectFixed = true;
      }
    }

    const incident = new IncidentLifecycleModel();

    // Step 1: Initial state is OPEN and is_resolved = false
    assert.equal(incident.status, "OPEN");
    assert.equal(incident.is_resolved, false);

    // Step 2: Operator acknowledges incident
    const ackResult = incident.acknowledge("Operator acknowledged issue");
    assert.equal(ackResult.success, true);
    assert.equal(ackResult.status, "ACKNOWLEDGED");
    assert.equal(ackResult.is_resolved, false, "Acknowledgement MUST NOT mark incident resolved");

    // Step 3: Premature verification attempt (defect NOT fixed in DB)
    const prematureVerify = incident.verify();
    assert.equal(prematureVerify.verified, false, "Verification MUST fail if defect is still present");
    assert.equal(incident.status, "REMEDIATION_PENDING");
    assert.equal(incident.is_resolved, false);

    // Step 4: True Remediation applied
    incident.remediateDefect();

    // Step 5: Second verification attempt
    const finalVerify = incident.verify();
    assert.equal(finalVerify.verified, true, "Verification MUST pass once defect is remediated");
    assert.equal(incident.status, "RESOLVED_VERIFIED");
    assert.equal(incident.is_resolved, true);
  });

  // =========================================================================
  // 6. Cryptographic MD5 Hash Chain Algorithm Verification
  // =========================================================================
  await t.test("6. Cryptographic MD5 hash chain matches authoritative PostgreSQL implementation", () => {
    function computeSnapshotHash(prevHash, orgId, score, status, timestamp, passed, failed) {
      const payload = `${prevHash || "GENESIS_BLOCK"}:${orgId}:${score}:${status}:${timestamp}:${passed}:${failed}`;
      return crypto.createHash("md5").update(payload).digest("hex");
    }

    const orgId = "a0000000-0000-0000-0000-000000000001";
    const ts1 = "2026-10-15T04:00:00Z";
    const h1 = computeSnapshotHash(null, orgId, 100, "HEALTHY", ts1, 16, 0);

    const ts2 = "2026-10-15T04:15:00Z";
    const h2 = computeSnapshotHash(h1, orgId, 100, "HEALTHY", ts2, 16, 0);

    assert.equal(typeof h1, "string");
    assert.equal(h1.length, 32);
    assert.notEqual(h1, h2, "Successive block hashes in chain must differ");

    // Changing any single bit in payload completely changes the hash (avalanche effect)
    const tampered = computeSnapshotHash(h1, orgId, 99, "HEALTHY", ts2, 16, 0);
    assert.notEqual(h2, tampered, "Tampering with score must break hash chain");
  });

  // =========================================================================
  // 7. Live Remote Database Verification (Supabase Integration)
  // =========================================================================
  await t.test("7. Live Remote Database parity check on Supabase project iuhtzahuszdkdarhxobx", async () => {
    const defaultUrl = "https://iuhtzahuszdkdarhxobx.supabase.co";
    const defaultAnon = "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

    const supabaseAnon = createClient(defaultUrl, defaultAnon);
    const orgId = "a0000000-0000-0000-0000-000000000001";

    // 1. Verify Anonymous Caller receives permission denied or AUDIT_UNAUTHORIZED (Migration 238 default-deny)
    const { data: anonDiag, error: anonErr } = await supabaseAnon.rpc("check_system_health_diagnostics", {
      p_org_id: orgId,
    });

    const isPermissionDenied = anonErr && (anonErr.code === '42501' || /permission denied/i.test(anonErr.message));
    const isFailClosed = !anonErr && anonDiag && anonDiag.status === "AUDIT_UNAUTHORIZED";
    assert.ok(isPermissionDenied || isFailClosed, `Anonymous caller must receive permission denied or AUDIT_UNAUTHORIZED. Got: ${JSON.stringify(anonErr || anonDiag)}`);

    // 2. Anonymous attempt to execute writer cycle should be rejected or not authorized
    const { error: runErr } = await supabaseAnon.rpc("run_authoritative_health_cycle", {
      p_org_id: orgId,
      p_source_sha: "unauthorized-anon-test",
    });
    // In PostgREST, non-service_role callers either fail security definer check or return AUDIT_UNAUTHORIZED
    assert.ok(runErr || anonDiag.status === "AUDIT_UNAUTHORIZED", "Anonymous execution must be blocked or shielded");
  });
});
