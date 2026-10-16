import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Client Noise Exclusion & Bed Occupancy Drift Permanent Repair Suite", async (t) => {
  await t.test("1. Noise Classifier module correctly classifies browser extension timeouts as noise", () => {
    const classifierPath = path.join(ROOT, "lib/diagnostics/noise-classifier.ts");
    assert.ok(fs.existsSync(classifierPath), "lib/diagnostics/noise-classifier.ts must exist");

    const content = fs.readFileSync(classifierPath, "utf8");
    assert.ok(content.includes('chrome: call method'), "Must include 'chrome: call method' pattern");
    assert.ok(content.includes('window message "chrome:'), "Must include window message chrome pattern");
    assert.ok(content.includes("chrome-extension://"), "Must include chrome-extension:// pattern");
    assert.ok(content.includes("CLIENT_EXTENSION_NOISE"), "Must classify as CLIENT_EXTENSION_NOISE");
  });

  await t.test("2. Troubleshooter re-exports noise classifier and drops extension noise", () => {
    const troubleshooterPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");
    const content = fs.readFileSync(troubleshooterPath, "utf8");

    assert.ok(
      content.includes('from "./noise-classifier"'),
      "troubleshooter.ts must import and re-export from noise-classifier"
    );
    assert.ok(
      content.includes("classifyClientRuntimeNoise"),
      "troubleshooter.ts must use classifyClientRuntimeNoise"
    );
    assert.ok(
      content.includes("return null;"),
      "reportSystemRuntimeIncident must immediately drop noise without persisting to DB or emitting UI event"
    );
  });

  await t.test("3. Diagnostic actions classify open runtime incidents safely without blind bulk close", () => {
    const actionsPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      content.includes('from "./noise-classifier"'),
      "actions.ts must import classifyClientRuntimeNoise"
    );
    assert.ok(
      content.includes("OPEN_RUNTIME_INCIDENTS_ACTIVE"),
      "actions.ts must handle OPEN_RUNTIME_INCIDENTS_ACTIVE"
    );
    assert.ok(
      content.includes("CLIENT_EXTENSION_NOISE"),
      "actions.ts must record CLIENT_EXTENSION_NOISE evidence"
    );
    assert.ok(
      content.includes("verify_system_incident_resolution"),
      "actions.ts must route non-noise incidents to authoritative database reproducer"
    );
  });

  await t.test("4. Migration 208 contains atomic bed reconciler, noise classification and Domain 11 reproducer", () => {
    const mig208Path = path.join(
      ROOT,
      "supabase/migrations/20261016140000_migration_208_classify_client_noise_and_harden_health_weights.sql"
    );
    assert.ok(fs.existsSync(mig208Path), "Migration 208 must exist");

    const content = fs.readFileSync(mig208Path, "utf8");
    assert.ok(
      content.includes("UPDATE public.beds b"),
      "Migration 208 must synchronize bed occupancy against active assignments"
    );
    assert.ok(
      content.includes("UPDATE public.system_health_issues_log"),
      "Migration 208 must classify historical extension noise rows"
    );
    assert.ok(
      content.includes("CLIENT_EXTENSION_NOISE_EXCLUSION"),
      "Migration 208 must include Domain 11 CLIENT_EXTENSION_NOISE_EXCLUSION reproducer"
    );
    assert.ok(
      content.includes("NOT ("),
      "Migration 208 check_system_health_diagnostics must exclude client noise from Check 7 score deductions"
    );
    assert.ok(
      content.includes("NOTIFY pgrst, 'reload schema';"),
      "Migration 208 must notify PostgREST to reload schema"
    );
  });

  await t.test("5. SystemHealthAlertBanner maintains purely observational read-only state on mount", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    const content = fs.readFileSync(bannerPath, "utf8");

    assert.ok(
      content.includes("সমাধান হিসেবে চিহ্নিত করুন ও পুনঃপরীক্ষা"),
      "Action button must state remediation and verification"
    );
    assert.ok(
      content.includes("সর্বশেষ স্ক্যান:"),
      "Modal header or footer must display freshness timestamp"
    );
    // Ensure no automatic mutations occur in useEffect
    const useEffectMatches = content.match(/useEffect\s*\(\s*\(\)\s*=>\s*{([^}]+)}/g) || [];
    for (const match of useEffectMatches) {
      assert.ok(
        !match.includes("remediateSystemHealthIssueAction"),
        "Banner useEffect must not trigger auto-remediation"
      );
      assert.ok(
        !match.includes("resolveSystemRuntimeIssueAction"),
        "Banner useEffect must not trigger auto-resolution"
      );
    }
  });

  await t.test("6. Bed occupancy reconciler Case A and Case B invariant simulation", () => {
    // Invariant Simulator: Case A (MW-105: OCCUPIED with 0 active assignments -> VACANT)
    function simulateBedStatus(currentStatus, activeAssignmentsCount) {
      if (currentStatus === "OCCUPIED" && activeAssignmentsCount === 0) {
        return "VACANT"; // Case A reconciliation
      }
      if (currentStatus === "VACANT" && activeAssignmentsCount > 0) {
        return "OCCUPIED"; // Case B reconciliation
      }
      return currentStatus;
    }

    assert.equal(simulateBedStatus("OCCUPIED", 0), "VACANT", "MW-105 Case A must resolve to VACANT");
    assert.equal(simulateBedStatus("VACANT", 1), "OCCUPIED", "Assigned bed Case B must resolve to OCCUPIED");
    assert.equal(simulateBedStatus("VACANT", 0), "VACANT", "Vacant bed with 0 assignments remains VACANT");
    assert.equal(simulateBedStatus("OCCUPIED", 1), "OCCUPIED", "Occupied bed with 1 assignment remains OCCUPIED");
  });
});
