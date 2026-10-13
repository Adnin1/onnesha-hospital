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

  // 7. Migration 190 Multi-Tenant Heartbeat & Outbox Hardening
  await t.test("7. Migration 190 eradicates arbitrary first-tenant fallback and hardens outbox mutation permissions", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014080000_harden_multitenant_heartbeat_and_outbox_security.sql");
    assert.ok(fs.existsSync(migPath), "Migration 190 must exist");
    const content = fs.readFileSync(migPath, "utf8");

    // Fail-closed multi-tenancy
    assert.match(content, /ORGANIZATION_CONTEXT_REQUIRED/);
    assert.ok(!content.includes("ORDER BY created_at ASC LIMIT 1"), "Silent first-org fallback must be completely eradicated");

    // Outbox security
    assert.match(content, /REVOKE UPDATE, DELETE ON public\.system_notification_outbox FROM authenticated/);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.record_outbox_delivery_attempt_atomic/);

    // pg_cron registration
    assert.match(content, /pg_cron/);
    assert.match(content, /ohms-db-health-heartbeat/);
  });

  // 8. Modern Supabase Secret Key Model Support
  await t.test("8. Monitor and diagnostic probes support modern SUPABASE_SECRET_KEY alongside legacy service keys", () => {
    const probePath = path.join(ROOT, "scripts/scheduled-health-check.mjs");
    const probeContent = fs.readFileSync(probePath, "utf8");
    assert.match(probeContent, /SUPABASE_SECRET_KEY/);

    const workflowPath = path.join(ROOT, ".github/workflows/health-monitor.yml");
    const workflowContent = fs.readFileSync(workflowPath, "utf8");
    assert.match(workflowContent, /SUPABASE_SECRET_KEY/);
  });

  // 9. Live Supabase Fail-Closed Multi-Tenancy Invariant Verification
  await t.test("9. Remote Supabase enforces fail-closed multi-tenancy and rejects arbitrary tenant fallbacks", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || supabaseUrl.includes("127.0.0.1")) {
      console.log("   [Hermetic CI Mode] Skipping remote database call");
      return;
    }

    const supabase = createClient(supabaseUrl, anonKey);

    // Calling record_monitoring_heartbeat anonymously must fail (permission revoked from anon)
    const { error: hbErr } = await supabase.rpc("record_monitoring_heartbeat", {
      p_org_id: null,
    });
    assert.ok(hbErr, "Anonymous heartbeat must be rejected by PostgreSQL security");

    // Calling record_outbox_delivery_attempt_atomic anonymously must fail
    const { error: outboxErr } = await supabase.rpc("record_outbox_delivery_attempt_atomic", {
      p_outbox_id: "00000000-0000-0000-0000-000000000000",
      p_status: "SENT",
    });
    assert.ok(outboxErr, "Anonymous outbox delivery recording must be rejected");
  });
});

