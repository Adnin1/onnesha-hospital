import fs from "node:fs";
import path from "node:path";

export function generateHealthSummary(summaryPath = "test-results/health-monitor-summary.json") {
  const resolvedPath = path.resolve(process.cwd(), summaryPath);
  let content = "";

  if (fs.existsSync(resolvedPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      const m = data.machineOutputs || {};
      const edgeStatus = m.public_edge_status === "PASS" ? "✅ PASS (PUBLIC_EDGE_HEALTHY)" : "❌ FAIL";
      const internalStatus = m.privileged_audit_executed === "true"
        ? (m.internal_erp_status === "FULL_INTERNAL_ERP_HEALTHY" ? "✅ FULL_INTERNAL_ERP_HEALTHY (Audited)" : `⚠️ ${m.internal_erp_status}`)
        : "⚠️ NOT RUN — PRIVILEGED SECRET REQUIRED (Gate G10)";
      const incidentsStatus = m.privileged_audit_executed === "true"
        ? (Number(m.open_incidents || 0) === 0 ? "✅ ZERO UNRESOLVED INCIDENTS" : `⚠️ ${m.open_incidents} OPEN INCIDENTS`)
        : "⚠️ UNVERIFIED (Requires Gate G10 secret)";
      const overallStatus = m.overall_status === "HEALTHY"
        ? `✅ FULL_INTERNAL_ERP_HEALTHY (Authoritative Score: ${m.authoritative_score}%)`
        : (m.overall_status === "NOT_FULLY_VERIFIED"
            ? "ℹ️ PUBLIC_EDGE_HEALTHY (ERP Invariants: NOT_FULLY_VERIFIED)"
            : `⚠️ ${m.overall_status} (Score: ${m.authoritative_score})`);

      content = `### 🏥 OHMS Multi-Tier Autonomous Health Monitor Telemetry\n\n` +
        `| Telemetry Domain | Monitoring Scope & Verification Target | Status |\n` +
        `| :--- | :--- | :--- |\n` +
        `| **1. PUBLIC EDGE** | HTTP 200, Canonical Liveness, Fail-Closed Anonymous PostgREST | ${edgeStatus} |\n` +
        `| **2. FULL INTERNAL ERP** | 10-Domain Database Invariants, GL Balance, Bed Occupancy, Invoices | ${internalStatus} |\n` +
        `| **3. DATABASE SCHEDULER** | Supabase PostgreSQL pg_cron Background Telemetry | ℹ️ ${m.scheduler_status || "BLOCKED_PLATFORM_CAPABILITY"} |\n` +
        `| **4. INCIDENT STATE** | System Health Issue Log (Zero Open / Recurring Incidents) | ${incidentsStatus} |\n` +
        `| **5. NOTIFICATION DELIVERY** | Webhook / SMS / WhatsApp Outbox Pipeline | ⚠️ ${m.notification_status || "BLOCKED_EXTERNAL_OWNER"} |\n` +
        `| **6. OVERALL AUTHORITATIVE HEALTH** | Server-Derived Immutable Snapshot Verification | ${overallStatus} |\n\n` +
        `> **Authoritative Snapshot ID:** \`${m.authoritative_snapshot_id || "N/A"}\` | **Warnings:** ${m.warnings || 0} | **Critical:** ${m.critical_issues || 0}\n\n` +
        `> **Owner Commissioning Action (Gate G10):** To enable full internal ERP invariant audits on GitHub Actions, configure repository secret:  \n` +
        `> \`GitHub -> Repository Settings -> Secrets and variables -> Actions -> New repository secret -> Name: SUPABASE_SECRET_KEY\`\n`;
    } catch (e) {
      content = `### ⚠️ Health Monitor Telemetry Parse Error\n\nFailed to parse summary JSON: ${e.message}\n`;
    }
  } else {
    content = `### ❌ Health Monitor Execution Failed\n\nNo telemetry summary generated (process exited before writing report).\n`;
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content, "utf8");
    } catch (e) {
      console.warn("Could not append to GITHUB_STEP_SUMMARY:", e.message);
    }
  }

  console.log(content);
  return content;
}

// Run directly if invoked as main script
if (process.argv[1] && process.argv[1].endsWith("generate-health-summary.mjs")) {
  generateHealthSummary();
}
