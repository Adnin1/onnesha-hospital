import { createClient } from "@supabase/supabase-js";

const productionUrl = process.env.OHMS_PRODUCTION_URL || "https://onnesha-hospital.pages.dev";
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookUrl = process.env.OHMS_ALERT_WEBHOOK_URL;
const timeoutMs = 12_000;

function safeIssue(issue) {
  return {
    id: String(issue?.id || "UNKNOWN").slice(0, 100),
    severity: String(issue?.severity || "UNKNOWN").slice(0, 20),
    module: String(issue?.module || "Unknown module").slice(0, 120),
    location: String(issue?.location || "Unknown location").slice(0, 200),
  };
}

async function notifyFailure(summary) {
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? process.env.GITHUB_SERVER_URL + "/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + process.env.GITHUB_RUN_ID
    : "";
  const message = [
    "[OHMS PRODUCTION MONITOR] Failure detected.",
    "Time: " + new Date().toISOString(),
    "Production: " + productionUrl,
    "Failed checks: " + (summary.failedChecks.join(", ") || "Unknown"),
    "Database organizations inspected: " + summary.organizationsChecked,
    "Diagnostic issue count: " + summary.issueCount,
    "Sensitive patient data and full diagnostic reasons are intentionally excluded.",
    runUrl ? "Run details: " + runUrl : "",
  ].filter(Boolean).join("\n");

  if (!webhookUrl) {
    console.error("OHMS_ALERT_WEBHOOK_URL is not configured; failure is visible in GitHub Actions logs only.");
    return false;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error("Alert webhook failed with HTTP " + response.status + ".");
      return false;
    }
    console.log("External alert webhook accepted the health failure notification.");
    return true;
  } catch (error) {
    console.error("External alert webhook request failed:", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

async function main() {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    const message = "BLOCKED_EXTERNAL_OWNER: configure GitHub Actions secrets: " + missing.join(", ") + ". Scheduled 24/7 database diagnostics are not active until configured.";
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const fs = await import("node:fs/promises");
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "\n## OHMS monitor status\n\n**BLOCKED_EXTERNAL_OWNER**\n\n" + message + "\n");
    }
    process.exitCode = 78;
    return;
  }

  const checks = [
    { name: "homepage", path: "/" },
    { name: "appointment", path: "/appointment" },
    { name: "patient portal route", path: "/app/patients" },
    { name: "expense route", path: "/app/expenses" },
    { name: "desktop manifest", path: "/downloads/desktop/latest.json" },
  ];
  const failedChecks = [];
  for (const check of checks) {
    try {
      const response = await fetch(new URL(check.path, productionUrl), {
        method: "GET",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        failedChecks.push(check.name + ":HTTP_" + response.status);
        console.error(check.name + ": HTTP " + response.status);
      } else {
        console.log(check.name + ": HTTP " + response.status);
        if (check.name === "desktop manifest") {
          const manifest = await response.json();
          if (!manifest || typeof manifest.version !== "string" || !manifest.platforms) {
            failedChecks.push("desktop manifest:INVALID_JSON_CONTRACT");
            console.error("desktop manifest: invalid required fields");
          }
        }
      }
    } catch (error) {
      failedChecks.push(check.name + ":NETWORK_ERROR");
      console.error(check.name + ": network request failed (" + (error instanceof Error ? error.message : "unknown") + ")");
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let organizationsChecked = 0;
  let issueCount = 0;
  const safeIssues = [];
  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });

  if (organizationsError || !Array.isArray(organizations)) {
    failedChecks.push("database:ORGANIZATION_QUERY_FAILED");
    console.error("Database organization query failed:", organizationsError?.code || "UNKNOWN");
  } else if (organizations.length === 0) {
    failedChecks.push("database:NO_ORGANIZATIONS_FOUND");
    console.error("Database query returned no organizations; health cannot be confirmed.");
  } else {
    for (const organization of organizations) {
      if (!organization?.id) {
        failedChecks.push("database:INVALID_ORGANIZATION_RECORD");
        continue;
      }
      organizationsChecked += 1;
      const { data, error } = await supabase.rpc("check_system_health_diagnostics", { p_org_id: organization.id });
      if (error || !data || typeof data !== "object" || typeof data.is_healthy !== "boolean") {
        failedChecks.push("database:HEALTH_RPC_FAILED:" + organization.id);
        console.error("Health RPC failed for an organization (" + (error?.code || "EMPTY_OR_INVALID_RESPONSE") + ").");
        continue;
      }
      const issues = Array.isArray(data.issues) ? data.issues : [];
      issueCount += Number(data.total_issues || issues.length || 0);
      for (const issue of issues) {
        if (safeIssues.length < 40) safeIssues.push({ organization_id: organization.id, ...safeIssue(issue) });
      }
      if (data.is_healthy !== true || issues.length > 0 || Number(data.total_issues || 0) > 0) {
        failedChecks.push("database:HEALTH_ISSUES:" + organization.id);
        console.error("Health issue detected for org " + organization.id + ": score=" + (Number(data.health_score) || 0) + ", critical=" + (Number(data.critical_count) || 0) + ", warning=" + (Number(data.warning_count) || 0) + ", info=" + (Number(data.info_count) || 0) + ", issues=" + (Number(data.total_issues) || issues.length) + ".");
      } else {
        console.log("Database health check passed for organization " + organization.id + ".");
      }
    }
  }

  const summary = { failedChecks, organizationsChecked, issueCount, issues: safeIssues };
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs/promises");
    const lines = [
      "\n## OHMS production monitoring",
      "- Time: " + new Date().toISOString(),
      "- Public checks: " + checks.length,
      "- Organizations inspected: " + organizationsChecked,
      "- Diagnostic issues reported: " + issueCount,
      "- Failed checks: " + failedChecks.length,
      failedChecks.length ? "- Failed check IDs: " + failedChecks.join(", ") : "- Result: PASS",
      safeIssues.length ? "\n### Redacted issue references\n" + safeIssues.map(i => "- " + i.severity + " / " + i.module + " / " + i.location + " / " + i.id).join("\n") : "",
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
  if (failedChecks.length > 0) {
    await notifyFailure(summary);
    console.error("OHMS production monitor failed: " + failedChecks.length + " failed checks.");
    process.exitCode = 1;
    return;
  }
  console.log("OHMS production monitor passed: " + checks.length + " public routes and " + organizationsChecked + " organizations verified.");
}

main().catch((error) => {
  console.error("OHMS production monitor crashed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
