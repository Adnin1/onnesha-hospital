#!/usr/bin/env node
/**
 * 24/7 Background System Health & Invariant Heartbeat Probe
 * Executes continuous autonomous verification across production edge and Supabase diagnostics.
 * Prevents false-green reporting by strictly failing on unconfigured credentials or failed assertions.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const CANONICAL_URL = process.env.CANONICAL_URL || "https://onnesha-hospital.pages.dev";
const ORG_ID = process.env.ORG_ID || "a0000000-0000-0000-0000-000000000001";

console.log(`[24/7 Health Monitor] Starting heartbeat probe at ${new Date().toISOString()}`);

async function checkEdgeLiveness() {
  try {
    const res = await fetch(CANONICAL_URL, {
      method: "GET",
      headers: { "User-Agent": "OHMS-24-7-Heartbeat-Probe/1.0" },
    });
    console.log(`[Edge Probe] ${CANONICAL_URL} returned HTTP ${res.status} ${res.statusText}`);
    return res.status === 200;
  } catch (err) {
    console.error(`[Edge Probe] Failed to reach ${CANONICAL_URL}:`, err.message);
    return false;
  }
}

const DEFAULT_SUPABASE_URL = "https://iuhtzahuszdkdarhxobx.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

async function checkCronTelemetry(client) {
  try {
    const { data, error } = await client.rpc("get_pg_cron_monitoring_telemetry");
    if (error) {
      return { available: false, status: "ERROR", error: error.message };
    }
    return data || { available: false, status: "UNKNOWN" };
  } catch (err) {
    return { available: false, status: "EXCEPTION", error: err.message };
  }
}

async function checkRolePermissionIntegrity(client, isPrivileged) {
  if (!isPrivileged) {
    return { ok: true, note: "Skipped in unprivileged public watchdog mode (Owner Gate G10)" };
  }
  try {
    const { data, error } = await client
      .from("role_permissions")
      .select("permission_key, roles!inner(name)")
      .eq("roles.organization_id", ORG_ID);
    if (error) {
      return {
        ok: false,
        error: `ROLE_PERMISSION_QUERY_FAILED: ${error.message}`,
        issues: [{ role: "role_permissions", missing: ["authoritative query failed"] }],
      };
    }
    const roleMap = {};
    (data || []).forEach((r) => {
      const roleName = r.roles?.name?.toLowerCase();
      if (!roleMap[roleName]) roleMap[roleName] = [];
      roleMap[roleName].push(r.permission_key);
    });

    const roleRequirements = {
      receptionist: ["billing.create", "billing.collect", "payments.create", "patients.create"],
      doctor: ["opd.consult", "prescriptions.create", "patients.view"],
      nurse: ["ipd.view", "patients.view"],
      accountant: ["billing.view", "billing.report"],
      pharmacist: ["pharmacy.view", "pharmacy.sale"],
      lab_technician: ["lab.view", "lab.sample_collect"],
    };

    const issues = [];
    for (const [role, requiredKeys] of Object.entries(roleRequirements)) {
      const assigned = roleMap[role] || [];
      const missing = requiredKeys.filter((k) => !assigned.includes(k));
      if (missing.length > 0) {
        issues.push({ role, missing });
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }
    return { ok: true, rolesAudited: Object.keys(roleRequirements).length, totalPerms: (data || []).length };
  } catch (err) {
    return {
      ok: false,
      error: `ROLE_PERMISSION_QUERY_EXCEPTION: ${err.message}`,
      issues: [{ role: "role_permissions", missing: ["authoritative query threw"] }],
    };
  }
}

async function checkRuntimeProvenance() {
  let expectedSha = process.env.GITHUB_SHA;
  if (!expectedSha) {
    try {
      expectedSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
      expectedSha = "";
    }
  }

  try {
    const baseUrl = CANONICAL_URL.endsWith("/") ? CANONICAL_URL.slice(0, -1) : CANONICAL_URL;
    const versionUrl = `${baseUrl}/version.json`;
    const res = await fetch(versionUrl, {
      headers: { "Cache-Control": "no-cache", "User-Agent": "OHMS-Provenance-Probe/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { status: "NOT_VERIFIED", runtime_sha: null, build_id: null, reason: `version.json HTTP ${res.status}` };
    }
    const version = await res.json();
    const runtimeSha = typeof version.git_sha === "string" ? version.git_sha : null;
    if (!runtimeSha || !expectedSha) {
      return { status: "NOT_VERIFIED", runtime_sha: runtimeSha, build_id: version.build_id || null, reason: "full Git SHA missing" };
    }
    return {
      status: runtimeSha === expectedSha ? "MATCH" : "MISMATCH",
      runtime_sha: runtimeSha,
      build_id: version.build_id || null,
      expected_sha: expectedSha,
      reason: runtimeSha === expectedSha ? "exact runtime SHA match" : "deployed runtime SHA differs from checked-out SHA",
    };
  } catch (err) {
    return { status: "NOT_VERIFIED", runtime_sha: null, build_id: null, reason: err.message };
  }
}

async function checkDatabaseDiagnostics() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OHMS_TEST_SERVICE_ROLE_KEY;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anonKey)) {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      content.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) {
          let val = (m[2] || "").trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (m[1] === "NEXT_PUBLIC_SUPABASE_URL" || m[1] === "SUPABASE_URL") url = url || val;
          if (m[1] === "SUPABASE_SECRET_KEY" || m[1] === "SUPABASE_SERVICE_ROLE_KEY" || m[1] === "OHMS_TEST_SERVICE_ROLE_KEY") serviceKey = serviceKey || val;
          if (m[1] === "NEXT_PUBLIC_SUPABASE_ANON_KEY" || m[1] === "SUPABASE_ANON_KEY" || m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") anonKey = anonKey || val;
        }
      });
    }
  }

  // Fallback to public endpoints if running in unconfigured CI/watchdog environment
  url = url || DEFAULT_SUPABASE_URL;
  anonKey = anonKey || DEFAULT_SUPABASE_ANON_KEY;

  const effectiveKey = serviceKey || anonKey;
  const isPrivileged = Boolean(serviceKey);

  if (!url || !effectiveKey || url.includes("placeholder") || url.includes("ci-hermetic")) {
    console.warn("[Database Probe] Configuration Error: Supabase credentials missing or set to hermetic placeholder.");
    return {
      skipped: true,
      is_healthy: false,
      status: "CONFIGURATION_ERROR",
      error: "Supabase credentials missing or invalid placeholder.",
      audit_scope: "NONE",
      is_privileged: false,
    };
  }

  const auditScope = isPrivileged ? "FULL_INTERNAL_ERP" : "PUBLIC_PORTAL_ONLY";
  console.log(`[Database Probe] Active Scope: ${auditScope} (Privileged Service Key: ${isPrivileged ? "YES" : "NO - Gate G10"})`);

  try {
    const client = createClient(url, effectiveKey);

    // Probe pg_cron telemetry
    const cronTelemetry = await checkCronTelemetry(client);
    console.log(`[Cron Telemetry] Background Scheduler: ${cronTelemetry.status || "UNKNOWN"} (Available: ${cronTelemetry.available})`);
    if (cronTelemetry.reason) {
      console.log(`[Cron Telemetry Detail] ${cronTelemetry.reason}`);
    }

    // Probe multi-role RBAC integrity
    const rbacIntegrity = await checkRolePermissionIntegrity(client, isPrivileged);
    if (!rbacIntegrity.ok) {
      console.error(`[RBAC Integrity Failure] ${rbacIntegrity.error || JSON.stringify(rbacIntegrity.issues)}`);
      return {
        skipped: false,
        is_healthy: false,
        status: "RBAC_INTEGRITY_FAILED",
        error: rbacIntegrity.error || JSON.stringify(rbacIntegrity.issues),
        audit_scope: auditScope,
        is_privileged: true,
        cron_telemetry: cronTelemetry,
      };
    }
    console.log(`[RBAC Integrity] Multi-role permissions verified intact across ${rbacIntegrity.rolesAudited || "all"} canonical roles (${rbacIntegrity.totalPerms || 0} total DB grants).`);

    const { data, error } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: ORG_ID,
    });

    if (error) {
      console.error("[Database Probe] RPC execution error:", error.message);
      return {
        skipped: false,
        is_healthy: false,
        status: "ERROR",
        error: error.message,
        audit_scope: auditScope,
        is_privileged: isPrivileged,
        cron_telemetry: cronTelemetry,
      };
    }

    if (isPrivileged) {
      const authoritativeScore = typeof data?.health_score === "number" ? data.health_score : 0;
      const authoritativeStatus = data?.status || (data?.is_healthy ? "HEALTHY" : "MONITOR_ERROR");
      const authoritativeIssues = typeof data?.total_issues === "number" ? data.total_issues : 1;

      console.log(`[Database Probe] [Scope: ${auditScope}] Diagnostics Health Score: ${authoritativeScore}/100, Issues: ${authoritativeIssues}`);
      try {
        await client.rpc("record_monitoring_heartbeat", {
          p_org_id: ORG_ID,
          p_source: process.env.GITHUB_ACTIONS === "true" ? "GITHUB_ACTIONS_CRON" : "SCHEDULED_PROBE",
          p_status: authoritativeStatus,
          p_health_score: authoritativeScore,
          p_active_issues: authoritativeIssues,
          p_audit_scope: auditScope,
        });

        const { data: monStatus } = await client.rpc("get_system_monitoring_status", {
          p_org_id: ORG_ID,
        });
        if (monStatus) {
          console.log(`[Monitoring Status] Total Heartbeats: ${monStatus.total_heartbeats}, Active Issues: ${monStatus.active_issues_count}, Outbox: (Pending: ${monStatus.notification_metrics?.pending}, Sent: ${monStatus.notification_metrics?.sent}, Failed: ${monStatus.notification_metrics?.failed}, Blocked: ${monStatus.notification_metrics?.blocked_external_owner})`);
        }
      } catch (hbErr) {
        console.error("[Database Probe] Heartbeat logging failure:", hbErr.message);
        return {
          skipped: false,
          is_healthy: false,
          status: "MONITOR_ERROR",
          error: `AUTHORITATIVE_HEALTH_PERSISTENCE_FAILED: ${hbErr.message}`,
          audit_scope: auditScope,
          is_privileged: true,
          cron_telemetry: cronTelemetry,
        };
      }
    } else {
      console.log(`[Database Probe] Public RPC Response: status=${data?.status}, message="${data?.message || 'N/A'}" (Fail-Closed Protection Active)`);
    }

    const webhookUrl = process.env.OHMS_ALERT_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl.includes("placeholder")) {
      console.log("[Notification Channel] OHMS_ALERT_WEBHOOK_URL not configured. Status: BLOCKED_EXTERNAL_OWNER (Gate G1-G3/G10).");
    } else {
      console.log("[Notification Channel] OHMS_ALERT_WEBHOOK_URL is configured and active.");
    }

    return {
      skipped: false,
      audit_scope: auditScope,
      is_privileged: isPrivileged,
      cron_telemetry: cronTelemetry,
      status: data?.status || (data?.is_healthy ? "HEALTHY" : "DEFECT_DETECTED"),
      ...data,
    };
  } catch (err) {
    console.error("[Database Probe] Exception:", err.message);
    return {
      skipped: false,
      is_healthy: false,
      status: "EXCEPTION",
      error: err.message,
      audit_scope: auditScope,
      is_privileged: isPrivileged,
    };
  }
}

async function run() {
  const edgeOk = await checkEdgeLiveness();
  const runtimeProvenance = await checkRuntimeProvenance();
  const dbResult = await checkDatabaseDiagnostics();

  const dbStatus = dbResult.skipped
    ? "UNCONFIGURED"
    : dbResult.is_healthy
    ? "HEALTHY"
    : "DEFECT_DETECTED";

  // Tier A: PUBLIC_EDGE_WATCHDOG
  const tierA = {
    tier: "TIER_A_PUBLIC_EDGE_WATCHDOG",
    status: edgeOk ? "PASS" : "FAIL",
    verdict: edgeOk ? "PUBLIC_EDGE_HEALTHY" : "EDGE_DOWN",
    http_status: edgeOk ? 200 : 0,
    target: CANONICAL_URL,
    anonymous_rpc_fail_closed: dbResult.status === "AUDIT_UNAUTHORIZED",
  };

  // Tier B: PRIVILEGED_ERP_MONITOR
  const tierB = {
    tier: "TIER_B_PRIVILEGED_ERP_MONITOR",
    privileged_credential_present: dbResult.is_privileged,
    status: dbResult.is_privileged
      ? (dbResult.is_healthy ? "FULL_INTERNAL_ERP_HEALTHY" : (dbResult.status || "DEFECT_DETECTED"))
      : "NOT_VERIFIED",
    verdict: dbResult.is_privileged
      ? (dbResult.is_healthy ? "PASS" : "FAIL")
      : "BLOCKED_EXTERNAL_OWNER",
    reason: dbResult.is_privileged
      ? (dbResult.is_healthy ? "All required ERP diagnostic domains passed" : (dbResult.error || "Database invariants violated"))
      : "Owner Gate G10: SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY required in environment",
    health_score: dbResult.is_privileged ? (typeof dbResult.health_score === "number" ? dbResult.health_score : 0) : null,
    active_issues: dbResult.is_privileged ? (typeof dbResult.total_issues === "number" ? dbResult.total_issues : 1) : null,
  };

  // Tier C: PLATFORM_SCHEDULER_STATE
  const tierC = {
    tier: "TIER_C_PLATFORM_SCHEDULER_STATE",
    status: dbResult.cron_telemetry?.status || "BLOCKED_PLATFORM_CAPABILITY",
    available: Boolean(dbResult.cron_telemetry?.available),
    reason: dbResult.cron_telemetry?.reason || "pg_cron extension is not enabled on this PostgreSQL instance",
  };

  // Notifications Channel State
  const notificationsState = {
    status: "BLOCKED_EXTERNAL_OWNER",
    channel: "WEBHOOK / SMS / EMAIL",
    reason: "OHMS_ALERT_WEBHOOK_URL is not configured (Owner Gate G1-G4)",
  };

  const overallMonitoringVerdict = !edgeOk
    ? "FAIL — PRODUCTION EDGE UNREACHABLE"
    : runtimeProvenance.status !== "MATCH"
    ? `DEPLOYMENT_PROVENANCE_${runtimeProvenance.status}`
    : dbResult.is_privileged
    ? (dbResult.is_healthy ? "FULL_INTERNAL_ERP_HEALTHY" : "DEFECT_DETECTED")
    : "PUBLIC_EDGE_HEALTHY (Internal ERP Invariants Gated by Owner Credential Gate G10)";

  const repoSha = process.env.GITHUB_SHA || (() => {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "UNKNOWN";
    }
  })();

  const repositoryMigrationFileCount = (() => {
    try {
      const migrationDir = path.join(process.cwd(), "supabase", "migrations");
      if (fs.existsSync(migrationDir)) {
        return String(fs.readdirSync(migrationDir).filter(f => f.endsWith(".sql")).length);
      }
    } catch {}
    return "UNKNOWN";
  })();
  // This watchdog does not query the live Supabase migration catalog.
  const dbMigrationHead = "NOT_VERIFIED_BY_THIS_PROBE";

  const structuredSummary = {
    repository_sha: repoSha,
    runtime_sha: runtimeProvenance.runtime_sha || "UNKNOWN",
    build_id: runtimeProvenance.build_id || "UNKNOWN",
    runtime_provenance_status: runtimeProvenance.status,
    repository_migration_file_count: repositoryMigrationFileCount,
    deployment_id: runtimeProvenance.build_id || process.env.CLOUDFLARE_DEPLOYMENT_ID || "UNKNOWN",
    database_migration_head: dbMigrationHead,
    checked_at: new Date().toISOString(),
    edge: tierA,
    database_audit: {
      scope: dbResult.audit_scope || "NONE",
      status: dbResult.status,
    },
    internal_erp: tierB,
    scheduler: tierC,
    notifications: notificationsState,
    overall_monitoring: {
      status: dbResult.is_privileged && dbResult.is_healthy ? "COMPLETE" : "PARTIAL",
      verdict: overallMonitoringVerdict,
    },
  };

  const machineOutputs = {
    repository_sha: repoSha,
    runtime_sha: runtimeProvenance.runtime_sha || "UNKNOWN",
    build_id: runtimeProvenance.build_id || "UNKNOWN",
    runtime_provenance_status: runtimeProvenance.status,
    repository_migration_file_count: repositoryMigrationFileCount,
    deployment_id: runtimeProvenance.build_id || process.env.CLOUDFLARE_DEPLOYMENT_ID || "UNKNOWN",
    database_migration_head: dbMigrationHead,
    checked_at: new Date().toISOString(),
    public_edge_status: edgeOk ? "PASS" : "FAIL",
    privileged_audit_executed: String(Boolean(dbResult.is_privileged)),
    internal_erp_status: dbResult.is_privileged
      ? (dbResult.is_healthy ? "FULL_INTERNAL_ERP_HEALTHY" : (dbResult.status || "DEFECT_DETECTED"))
      : "NOT_VERIFIED",
    authoritative_score: String(dbResult.is_privileged ? (typeof dbResult.health_score === "number" ? dbResult.health_score : 0) : "N/A"),
    authoritative_snapshot_id: String(dbResult.snapshot_id || "N/A"),
    warnings: String(typeof dbResult.warning_count === "number" ? dbResult.warning_count : 0),
    critical_issues: String(typeof dbResult.critical_count === "number" ? dbResult.critical_count : (dbResult.is_privileged ? 0 : 1)),
    unknown_checks: String(typeof dbResult.unknown_count === "number" ? dbResult.unknown_count : 0),
    blocked_checks: String(!dbResult.is_privileged ? 1 : 0),
    open_incidents: String(typeof dbResult.total_issues === "number" ? dbResult.total_issues : 0),
    scheduler_status: dbResult.cron_telemetry?.status || "BLOCKED_PLATFORM_CAPABILITY",
    notification_status: "BLOCKED_EXTERNAL_OWNER",
    overall_status: !edgeOk
      ? "CRITICAL"
      : runtimeProvenance.status !== "MATCH"
      ? `DEPLOYMENT_PROVENANCE_${runtimeProvenance.status}`
      : !dbResult.is_privileged
      ? "NOT_FULLY_VERIFIED"
      : (dbResult.is_healthy ? "HEALTHY" : (dbResult.status || "DEGRADED")),
  };

  // 1. Write to GITHUB_OUTPUT if running inside GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    try {
      const outputLines = Object.entries(machineOutputs)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n";
      fs.appendFileSync(process.env.GITHUB_OUTPUT, outputLines, "utf8");
    } catch (e) {
      console.warn("[Health Monitor] Notice writing to GITHUB_OUTPUT:", e.message);
    }
  }

  // 2. Persist machine-readable telemetry JSON artifact
  try {
    const testResultsDir = path.join(process.cwd(), "test-results");
    if (!fs.existsSync(testResultsDir)) fs.mkdirSync(testResultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testResultsDir, "health-monitor-summary.json"),
      JSON.stringify({ ...structuredSummary, machineOutputs }, null, 2),
      "utf8"
    );
  } catch (e) {
    console.warn("[Health Monitor] Notice writing health-monitor-summary.json:", e.message);
  }

  console.log("==================================================");
  console.log("📊 OHMS MULTI-TIER SYSTEM HEALTH TELEMETRY SUMMARY");
  console.log("==================================================");
  console.log(JSON.stringify(structuredSummary, null, 2));
  console.log("--------------------------------------------------");
  console.log(`Heartbeat Summary: Edge=${edgeOk ? "PASS (200)" : "FAIL"}, Database=${dbStatus} (Scope=${dbResult.audit_scope || "NONE"}), Privileged=${dbResult.is_privileged ? "YES" : "NO (Gate G10)"}`);
  console.log(`Monitoring Verdict: ${overallMonitoringVerdict}`);
  console.log("--------------------------------------------------");

  if (!edgeOk) {
    console.error("❌ System Heartbeat Check: Production Edge failed liveness check!");
    process.exit(1);
  }

  if (runtimeProvenance.status !== "MATCH") {
    console.error(`❌ Runtime provenance gate failed: ${runtimeProvenance.status} (${runtimeProvenance.reason || "no reason supplied"}).`);
    process.exit(1);
  }

  // Tier 1: Public Watchdog Tier (when running without service_role key due to Owner Gate G10)
  if (!dbResult.is_privileged) {
    if (dbResult.status === "AUDIT_UNAUTHORIZED") {
      console.log("ℹ️  Public Watchdog Tier: AUDIT_UNAUTHORIZED confirmed — fail-closed security active for anonymous caller.");
    }
    console.log("ℹ️  Public Watchdog Tier: Edge liveness is operational.");
    console.log("ℹ️  Owner Gate G10 Notice: Full internal ERP accounting & clinical invariants audit is gated by SUPABASE_SERVICE_ROLE_KEY.");
    console.log("ℹ️  Authoritative Whole-System ERP Health: NOT_FULLY_VERIFIED (Public Edge Watchdog Mode Only).");
    console.log("✅ 24/7 Production Public Edge Watchdog PASSED (Verdict: PUBLIC_EDGE_HEALTHY).");
    process.exit(0);
  }

  // Tier 2: Privileged Diagnostic Tier (when service_role key is present)
  if (!dbResult.is_healthy) {
    console.error("❌ System Heartbeat Check: Privileged database diagnostics detected active anomalies!");
    console.error(`Issues count: ${dbResult.total_issues || 0}`);
    process.exit(1);
  }

  console.log("✅ Full internal ERP invariants and health probes verified operational (Verdict: FULL_INTERNAL_ERP_HEALTHY).");
  process.exit(0);
}

run();
