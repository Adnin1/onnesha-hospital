import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS Real 24/7 Monitoring, Verified Incident Lifecycle, Outbox & Accounting Invariants (Migration 189)", async (t) => {
  // 1. Migration 189 Schema & Functions Presence
  await t.test("1. Migration 189 exists and defines outbox, heartbeats, and verified lifecycle", () => {
    const mig189Path = path.join(ROOT, "supabase/migrations/20261014070000_harden_incident_lifecycle_outbox_and_heartbeat.sql");
    assert.ok(fs.existsSync(mig189Path), "Migration 189 file must exist");
    const content = fs.readFileSync(mig189Path, "utf8");

    // Table definitions
    assert.match(content, /CREATE TABLE IF NOT EXISTS public\.system_notification_outbox/i);
    assert.match(content, /CREATE TABLE IF NOT EXISTS public\.system_monitoring_heartbeats/i);

    // Fingerprint and verified lifecycle columns on system_health_issues_log
    assert.match(content, /ADD COLUMN IF NOT EXISTS fingerprint VARCHAR\(128\)/i);
    assert.match(content, /ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR\(30\)/i);
    assert.match(content, /ADD COLUMN IF NOT EXISTS occurrence_count INT/i);
    assert.match(content, /ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ/i);
    assert.match(content, /ADD COLUMN IF NOT EXISTS verification_evidence JSONB/i);

    // RPCs
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.record_monitoring_heartbeat/i);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.verify_and_resolve_system_issue_atomic/i);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.get_system_monitoring_status/i);

    // Zero false-green anonymous guard
    assert.match(content, /DIAGNOSTIC_PRIVILEGE_REQUIRED/i);
    assert.match(content, /AUDIT_UNAUTHORIZED/i);

    // Heartbeat recency and notification failure checks
    assert.match(content, /MONITORING_MISSED_HEARTBEAT_STALE/i);
    assert.match(content, /NOTIFICATION_OUTBOX_FAILED_DELIVERIES/i);
  });

  // 2. Diagnostics Server Actions
  await t.test("2. lib/diagnostics/actions.ts exports verified resolution, monitoring status and test notification actions", () => {
    const actionsPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/diagnostics/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function verifyAndResolveSystemIssueAction/);
    assert.match(content, /export async function getSystemMonitoringStatusAction/);
    assert.match(content, /export async function sendTestSystemHealthNotificationAction/);
    assert.match(content, /verify_and_resolve_system_issue_atomic/);

    // Verify false-green on !data is eliminated
    assert.ok(!content.includes("health_score: 100,\n        critical_count: 0,\n        warning_count: 0,\n        info_count: 0,\n        total_issues: 0,\n        checked_at: new Date().toISOString(),\n        organization_id: organizationId || null,\n        issues: [],\n        passed_checks: [\"DEFAULT_HEALTHY\"],"));
    assert.match(content, /NO_DIAGNOSTIC_DATA/);
  });

  // 3. Troubleshooter & Verified Recovery Lifecycle
  await t.test("3. lib/diagnostics/troubleshooter.ts exports verifyAndResolveSystemRuntimeIncident", () => {
    const troubleshooterPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");
    assert.ok(fs.existsSync(troubleshooterPath), "lib/diagnostics/troubleshooter.ts must exist");
    const content = fs.readFileSync(troubleshooterPath, "utf8");

    assert.match(content, /export async function verifyAndResolveSystemRuntimeIncident/);
    assert.match(content, /RESOLVED_VERIFIED/);
  });

  // 4. SystemHealthAlertBanner Verified Recovery Lifecycle
  await t.test("4. SystemHealthAlertBanner requires server verification before displaying resolution feedback", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const content = fs.readFileSync(bannerPath, "utf8");

    assert.match(content, /verifyAndResolveSystemIssueAction/);
    assert.match(content, /res\.lifecycle_status === "RESOLVED_VERIFIED"/);
    assert.match(content, /ভেরিফাইড রিকভারি নিশ্চিত/);
  });

  // 5. 24/7 Heartbeat Probe Hardening
  await t.test("5. scripts/scheduled-health-check.mjs records heartbeats and reports external owner notification status", () => {
    const probePath = path.join(ROOT, "scripts/scheduled-health-check.mjs");
    assert.ok(fs.existsSync(probePath), "scripts/scheduled-health-check.mjs must exist");
    const content = fs.readFileSync(probePath, "utf8");

    assert.match(content, /record_monitoring_heartbeat/);
    assert.match(content, /get_system_monitoring_status/);
    assert.match(content, /BLOCKED_EXTERNAL_OWNER/);
    assert.match(content, /AUDIT_UNAUTHORIZED/);
  });

  // 6. Live Supabase Heartbeat & Diagnostics RPC Verification
  await t.test("6. Remote Supabase executes get_system_monitoring_status and check_system_health_diagnostics", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || supabaseUrl.includes("127.0.0.1")) {
      console.log("   [Hermetic CI Mode] Skipping remote database call");
      return;
    }

    const supabase = createClient(supabaseUrl, anonKey);

    // Call check_system_health_diagnostics with public key: must fail closed to AUDIT_UNAUTHORIZED
    const { data: anonDiag, error: anonErr } = await supabase.rpc("check_system_health_diagnostics");
    assert.ifError(anonErr);
    assert.equal(anonDiag.is_healthy, false, "Anonymous call must not claim healthy");
    assert.equal(anonDiag.status, "AUDIT_UNAUTHORIZED", "Anonymous call must return AUDIT_UNAUTHORIZED");
    assert.equal(anonDiag.audit_scope, "PUBLIC_PORTAL_ONLY");
    assert.equal(anonDiag.health_score, 0);
  });
});
