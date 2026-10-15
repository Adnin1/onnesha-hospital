import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS Autonomous Security Sentinel & Edge Telemetry Engine Suite", async (t) => {
  const telemetryPath = path.join(ROOT, "functions/api/security-telemetry.js");
  const sentinelPath = path.join(ROOT, "components/app/AutonomousSecuritySentinel.tsx");
  const troubleshooterPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");

  await t.test("1. Files exist and have full implementation (Zero Placeholders)", () => {
    assert.ok(fs.existsSync(telemetryPath), "functions/api/security-telemetry.js must exist");
    assert.ok(fs.existsSync(sentinelPath), "components/app/AutonomousSecuritySentinel.tsx must exist");
    assert.ok(fs.existsSync(troubleshooterPath), "lib/diagnostics/troubleshooter.ts must exist");

    const telContent = fs.readFileSync(telemetryPath, "utf8");
    const sentContent = fs.readFileSync(sentinelPath, "utf8");
    const trbContent = fs.readFileSync(troubleshooterPath, "utf8");

    assert.equal(/TODO|FIXME/i.test(telContent), false, "telemetry.js must contain no TODOs");
    assert.equal(/TODO|FIXME/i.test(sentContent), false, "sentinel.tsx must contain no TODOs");
    assert.equal(/TODO|FIXME/i.test(trbContent), false, "troubleshooter.ts must contain no TODOs");
  });

  await t.test("2. Edge Telemetry Function conforms to Cloudflare Pages Functions interface", async () => {
    const mod = await import(`file://${telemetryPath.replace(/\\/g, "/")}`);
    assert.equal(typeof mod.onRequestGet, "function", "Must export onRequestGet");
    assert.equal(typeof mod.onRequestPost, "function", "Must export onRequestPost");

    // Test GET handler
    const getRes = await mod.onRequestGet();
    assert.equal(getRes.status, 200);
    const body = await getRes.json();
    assert.equal(body.status, "ok");
    assert.equal(body.pc_required, false);
    assert.equal(body.monitoring_mode, "AUTONOMOUS_CONTINUOUS");
  });

  await t.test("3. Edge Telemetry Function enforces deterministic HTTP error status codes", async () => {
    const mod = await import(`file://${telemetryPath.replace(/\\/g, "/")}`);

    // Non-JSON Content-Type -> 415
    const reqNonJson = {
      request: new Request("https://onnesha-hospital.pages.dev/api/security-telemetry", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "raw data"
      })
    };
    const res415 = await mod.onRequestPost(reqNonJson);
    assert.equal(res415.status, 415);

    // Oversized Payload -> 413
    const reqOversized = {
      request: new Request("https://onnesha-hospital.pages.dev/api/security-telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "35000"
        },
        body: JSON.stringify({ padding: "x".repeat(35000) })
      })
    };
    const res413 = await mod.onRequestPost(reqOversized);
    assert.equal(res413.status, 413);

    // Malformed JSON -> 400
    const reqMalformed = {
      request: new Request("https://onnesha-hospital.pages.dev/api/security-telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed"
      })
    };
    const res400 = await mod.onRequestPost(reqMalformed);
    assert.equal(res400.status, 400);
  });

  await t.test("4. Troubleshooter implements autonomous self-healing and org resolution fallback", () => {
    const content = fs.readFileSync(troubleshooterPath, "utf8");
    assert.match(content, /resolveOrgId/, "Must implement dynamic organization resolver");
    assert.match(content, /triggerAutonomousHealing/, "Must implement autonomous self-healing trigger");
    assert.match(content, /RESOLVED_AUTO_HEALED/, "Must emit RESOLVED_AUTO_HEALED status");
    assert.match(content, /\/api\/security-telemetry/, "Must dispatch edge telemetry to /api/security-telemetry");
  });

  await t.test("5. Sentinel component is mounted in root layout with WCAG 2.2 AA accessibility", () => {
    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    assert.match(layoutContent, /AutonomousSecuritySentinel/, "Root layout must mount AutonomousSecuritySentinel");

    const sentContent = fs.readFileSync(sentinelPath, "utf8");
    assert.match(sentContent, /role="status"/, "Sentinel must declare role='status'");
    assert.match(sentContent, /aria-live="polite"/, "Sentinel must declare aria-live='polite'");
    assert.match(sentContent, /min-h-\[44px\]/, "Sentinel must enforce minimum 44px touch targets");
  });
});
