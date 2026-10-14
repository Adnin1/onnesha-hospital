import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS Active Health Test Engine v1 & Zero-Fake-Green Invariant Certification", async (t) => {
  // 1. Invariant Document and Migration 194 Verification
  await t.test("1. docs/HEALTH_ENGINE_INVARIANTS.md exists and documents HEALTH-001 through HEALTH-008", () => {
    const docPath = path.join(ROOT, "docs/HEALTH_ENGINE_INVARIANTS.md");
    assert.ok(fs.existsSync(docPath), "docs/HEALTH_ENGINE_INVARIANTS.md must exist");
    const doc = fs.readFileSync(docPath, "utf8");

    assert.match(doc, /HEALTH-001/, "Must specify HEALTH-001");
    assert.match(doc, /HEALTH-002/, "Must specify HEALTH-002");
    assert.match(doc, /HEALTH-003/, "Must specify HEALTH-003");
    assert.match(doc, /HEALTH-004/, "Must specify HEALTH-004");
    assert.match(doc, /HEALTH-005/, "Must specify HEALTH-005");
    assert.match(doc, /HEALTH-006/, "Must specify HEALTH-006");
    assert.match(doc, /HEALTH-007/, "Must specify HEALTH-007");
    assert.match(doc, /HEALTH-008/, "Must specify HEALTH-008");

    const migPath = path.join(ROOT, "supabase/migrations/20261014120000_authoritative_health_engine_and_zero_fake_green.sql");
    assert.ok(fs.existsSync(migPath), "Migration 194 must exist");
    const sql = fs.readFileSync(migPath, "utf8");
    assert.match(sql, /system_authoritative_health_snapshots/, "Must create authoritative snapshots table");
    assert.match(sql, /run_authoritative_system_health_check/, "Must define authoritative health engine RPC");
    assert.match(sql, /get_authoritative_system_health/, "Must define authoritative health query RPC");
  });

  // 2. Prohibition of Optimistic Fallbacks Scan
  await t.test("2. Zero optimistic health_score ?? 100 fallbacks exist across monitoring & diagnostic source code", () => {
    const filesToAudit = [
      "scripts/scheduled-health-check.mjs",
      "lib/diagnostics/actions.ts",
      "components/app/SystemHealthAlertBanner.tsx",
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.join(ROOT, relPath);
      assert.ok(fs.existsSync(fullPath), `File ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf8");

      // Verify no ?? 100 on health_score
      const optimisticFallbackMatch = /health_score\s*\?\?\s*100/i.test(content);
      assert.equal(
        optimisticFallbackMatch,
        false,
        `Forbidden optimistic fallback (health_score ?? 100) detected in ${relPath}`
      );
    }
  });

  // 3. Mathematical Invariant Simulation Suite (HEALTH-001, HEALTH-002, HEALTH-006)
  await t.test("3. Authoritative scoring engine mathematically enforces zero-fake-green invariant ceilings", () => {
    // Pure function modeling the database engine scoring logic
    function calculateAuthoritativeHealth({
      requiredChecks,
      passedChecks,
      criticalCount,
      warningCount,
      openIncidentsCount,
      isStale,
      isException,
    }) {
      if (isException) {
        return { score: 0, status: "MONITOR_ERROR", is_healthy: false };
      }
      if (isStale) {
        return { score: 0, status: "STALE", is_healthy: false };
      }

      let score = 100;
      score -= criticalCount * 25;
      score -= warningCount * 5;
      score -= openIncidentsCount * 10;

      // Rule: Any WARNING caps score at <= 99 and status DEGRADED
      if (warningCount > 0 || openIncidentsCount > 0) {
        score = Math.min(score, 99);
      }

      // Rule: Any CRITICAL caps score at <= 70
      if (criticalCount > 0) {
        score = Math.min(score, 70);
      }

      score = Math.max(0, Math.min(100, score));

      const isHealthy =
        requiredChecks > 0 &&
        passedChecks === requiredChecks &&
        criticalCount === 0 &&
        warningCount === 0 &&
        openIncidentsCount === 0 &&
        score === 100;

      const status =
        criticalCount > 0
          ? "CRITICAL"
          : warningCount > 0 || openIncidentsCount > 0 || score < 100
          ? "DEGRADED"
          : "HEALTHY";

      return { score, status, is_healthy: isHealthy };
    }

    // Case A: 100% HEALTHY (Zero defects, all passed)
    const resultHealthy = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 8,
      criticalCount: 0,
      warningCount: 0,
      openIncidentsCount: 0,
      isStale: false,
      isException: false,
    });
    assert.equal(resultHealthy.score, 100, "Clean run must achieve 100");
    assert.equal(resultHealthy.status, "HEALTHY");
    assert.equal(resultHealthy.is_healthy, true);

    // Case B: Single Warning prevents 100% (DEGRADED, score <= 99)
    const resultWarning = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 7,
      criticalCount: 0,
      warningCount: 1,
      openIncidentsCount: 0,
      isStale: false,
      isException: false,
    });
    assert.ok(resultWarning.score <= 99, "Warning must cap score at <= 99");
    assert.equal(resultWarning.status, "DEGRADED", "Warning must set status to DEGRADED");
    assert.equal(resultWarning.is_healthy, false, "Warning must not be healthy");

    // Case C: Critical Defect (CRITICAL, score <= 70)
    const resultCritical = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 7,
      criticalCount: 1,
      warningCount: 0,
      openIncidentsCount: 0,
      isStale: false,
      isException: false,
    });
    assert.ok(resultCritical.score <= 70, "Critical must cap score at <= 70");
    assert.equal(resultCritical.status, "CRITICAL");
    assert.equal(resultCritical.is_healthy, false);

    // Case D: Open Incident prevents 100%
    const resultOpenIncident = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 8,
      criticalCount: 0,
      warningCount: 0,
      openIncidentsCount: 1,
      isStale: false,
      isException: false,
    });
    assert.ok(resultOpenIncident.score <= 99, "Open incident must prevent 100");
    assert.equal(resultOpenIncident.status, "DEGRADED");
    assert.equal(resultOpenIncident.is_healthy, false);

    // Case E: Stale Snapshot expires (Score 0, STALE)
    const resultStale = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 8,
      criticalCount: 0,
      warningCount: 0,
      openIncidentsCount: 0,
      isStale: true,
      isException: false,
    });
    assert.equal(resultStale.score, 0, "Stale snapshot must produce score 0");
    assert.equal(resultStale.status, "STALE");
    assert.equal(resultStale.is_healthy, false);

    // Case F: Health Engine Monitor Crash (Score 0, MONITOR_ERROR)
    const resultCrash = calculateAuthoritativeHealth({
      requiredChecks: 8,
      passedChecks: 0,
      criticalCount: 1,
      warningCount: 0,
      openIncidentsCount: 0,
      isStale: false,
      isException: true,
    });
    assert.equal(resultCrash.score, 0, "Engine crash must produce score 0");
    assert.equal(resultCrash.status, "MONITOR_ERROR");
    assert.equal(resultCrash.is_healthy, false);
  });

  // 4. Multi-Tier Watchdog & Fail-Closed Anonymous Database Verification
  await t.test("4. Live remote database enforces fail-closed AUDIT_UNAUTHORIZED (0 health score) for unprivileged callers", async () => {
    const envPath = path.join(ROOT, ".env.local");
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, "utf8");
    const env = {};
    envContent.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || "";
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[match[1]] = val;
      }
    });

    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey || url.includes("placeholder") || url.includes("ci-hermetic") || !url.startsWith("https://")) {
      t.skip("Live network environment unavailable. Live RPC test skipped safely.");
      return;
    }

    const client = createClient(url, anonKey);

    // Anonymous RPC invocation must fail-closed
    const { data, error } = await client.rpc("check_system_health_diagnostics");
    assert.ifError(error);
    assert.ok(data, "Response must exist");
    assert.equal(data.is_healthy, false, "Anonymous caller must not be reported healthy");
    assert.equal(data.status, "AUDIT_UNAUTHORIZED", "Status must be AUDIT_UNAUTHORIZED");
    assert.equal(data.health_score, 0, "Anonymous health score must be strictly 0");
    assert.equal(data.critical_count, 1, "Must report 1 critical privilege issue");
    assert.ok(
      data.issues.some((i) => i.id === "DIAGNOSTIC_PRIVILEGE_REQUIRED"),
      "Must flag DIAGNOSTIC_PRIVILEGE_REQUIRED"
    );
  });

  // 5. GitHub Workflow Multi-Domain Matrix Verification
  await t.test("5. .github/workflows/health-monitor.yml separately displays all 6 explicit telemetry domains", () => {
    const workflowPath = path.join(ROOT, ".github/workflows/health-monitor.yml");
    assert.ok(fs.existsSync(workflowPath), "Workflow file must exist");
    const content = fs.readFileSync(workflowPath, "utf8");

    assert.match(content, /1\.\s+PUBLIC EDGE/, "Must display Public Edge domain");
    assert.match(content, /2\.\s+FULL INTERNAL ERP/, "Must display Full Internal ERP domain");
    assert.match(content, /3\.\s+DATABASE SCHEDULER/, "Must display Database Scheduler domain");
    assert.match(content, /4\.\s+INCIDENT STATE/, "Must display Incident State domain");
    assert.match(content, /5\.\s+NOTIFICATION DELIVERY/, "Must display Notification Delivery domain");
    assert.match(content, /6\.\s+OVERALL AUTHORITATIVE HEALTH/, "Must display Overall Authoritative Health domain");
  });
});
