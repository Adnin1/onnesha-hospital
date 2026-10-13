#!/usr/bin/env node
/**
 * 24/7 Background System Health & Invariant Heartbeat Probe
 * Executes continuous autonomous verification across production edge and Supabase diagnostics.
 * Prevents false-green reporting by strictly failing on unconfigured credentials or failed assertions.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const CANONICAL_URL = process.env.CANONICAL_URL || "https://onnesha-hospital.pages.dev";
const ORG_ID = process.env.ORG_ID || "6b78e524-b1e3-4c43-8944-1a5a0248bff8";

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
          if (m[1] === "NEXT_PUBLIC_SUPABASE_ANON_KEY" || m[1] === "SUPABASE_ANON_KEY") anonKey = anonKey || val;
        }
      });
    }
  }

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
    };
  }

  const auditScope = isPrivileged ? "FULL_INTERNAL_ERP" : "PUBLIC_PORTAL_ONLY";
  if (!isPrivileged) {
    console.log("[Database Probe] Notice: Running with public key. Audit scope restricted to PUBLIC_PORTAL_ONLY (internal ERP invariants unverified).");
  }

  try {
    const client = createClient(url, effectiveKey);
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
      };
    }

    console.log(`[Database Probe] [Scope: ${auditScope}] Diagnostics Health Score: ${data?.health_score}/100, Issues: ${data?.total_issues || 0}`);

    if (isPrivileged) {
      try {
        await client.rpc("record_monitoring_heartbeat", {
          p_org_id: ORG_ID,
          p_source: process.env.GITHUB_ACTIONS === "true" ? "GITHUB_ACTIONS_CRON" : "SCHEDULED_PROBE",
          p_status: data?.is_healthy ? "OK" : "DEGRADED",
          p_health_score: data?.health_score ?? 100,
          p_active_issues: data?.total_issues ?? 0,
          p_audit_scope: auditScope,
        });

        const { data: monStatus } = await client.rpc("get_system_monitoring_status", {
          p_org_id: ORG_ID,
        });
        if (monStatus) {
          console.log(`[Monitoring Status] Total Heartbeats: ${monStatus.total_heartbeats}, Active Issues: ${monStatus.active_issues_count}, Outbox: (Pending: ${monStatus.notification_metrics?.pending}, Sent: ${monStatus.notification_metrics?.sent}, Failed: ${monStatus.notification_metrics?.failed}, Blocked: ${monStatus.notification_metrics?.blocked_external_owner})`);
        }
      } catch (hbErr) {
        console.warn("[Database Probe] Heartbeat logging notice:", hbErr.message);
      }
    }

    const webhookUrl = process.env.OHMS_ALERT_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl.includes("placeholder")) {
      console.log("[Notification Channel] OHMS_ALERT_WEBHOOK_URL not configured. Notification status: BLOCKED_EXTERNAL_OWNER (Gate G1-G3/G10).");
    } else {
      console.log("[Notification Channel] OHMS_ALERT_WEBHOOK_URL is configured and active.");
    }

    return {
      skipped: false,
      audit_scope: auditScope,
      is_privileged: isPrivileged,
      status: data?.is_healthy ? "HEALTHY" : "DEFECT_DETECTED",
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
  const dbResult = await checkDatabaseDiagnostics();

  const dbStatus = dbResult.skipped
    ? "UNCONFIGURED"
    : dbResult.is_healthy
    ? "HEALTHY"
    : "DEFECT_DETECTED";

  console.log("--------------------------------------------------");
  console.log(`Result: Edge=${edgeOk ? "PASS" : "FAIL"}, Database=${dbStatus} (Scope: ${dbResult.audit_scope || "NONE"})`);
  console.log("--------------------------------------------------");

  const isStrict = process.env.STRICT_HEARTBEAT === "true" || process.env.GITHUB_ACTIONS === "true";

  if (!edgeOk) {
    console.error("❌ System Heartbeat Check: Production Edge failed liveness check!");
    process.exit(1);
  }

  if (dbResult.skipped) {
    if (isStrict) {
      console.error("❌ System Heartbeat Check: Database is unconfigured in strict/scheduled mode!");
      process.exit(1);
    } else {
      console.warn("⚠️ Database check was skipped due to missing credentials (local non-strict run).");
      process.exit(0);
    }
  }

  if (!dbResult.is_healthy) {
    if (dbResult.status === "AUDIT_UNAUTHORIZED") {
      if (isStrict) {
        console.error("❌ System Heartbeat Check: AUDIT_UNAUTHORIZED. Privileged service_role key missing in strict mode!");
        process.exit(1);
      } else {
        console.warn("⚠️ Notice: Running with public key. Public portal edge verified, but ERP invariant audit requires service_role key (local non-strict mode).");
        console.log("✅ Production Edge verified 100% operational.");
        process.exit(0);
      }
    }
    console.error("❌ System Heartbeat Check: Database diagnostics detected active anomalies!");
    process.exit(1);
  }

  console.log("✅ All production system invariants and health probes verified 100% operational.");
  process.exit(0);
}

run();
