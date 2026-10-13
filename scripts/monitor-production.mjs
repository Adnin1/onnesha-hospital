import { createClient } from "@supabase/supabase-js";

const productionUrl = process.env.OHMS_PRODUCTION_URL || "https://onnesha-hospital.pages.dev";
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const alertWebhookUrl = process.env.OHMS_ALERT_WEBHOOK_URL;
const timeoutMs = 12_000;

async function checkUrl(check) {
  try {
    const response = await fetch(new URL(check.path, productionUrl), {
      method: "GET",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { name: check.name, ok: false, detail: "HTTP " + response.status };
    }

    if (check.json) {
      let body;
      try {
        body = await response.json();
      } catch {
        return { name: check.name, ok: false, detail: "Expected JSON response but parsing failed" };
      }

      if (!body || typeof body.version !== "string") {
        return { name: check.name, ok: false, detail: "Manifest contract invalid: required version field missing" };
      }
    }

    return { name: check.name, ok: true, detail: "HTTP " + response.status };
  } catch (error) {
    return {
      name: check.name,
      ok: false,
      detail: "Network/timeout error: " + (error instanceof Error ? error.message : "unknown"),
    };
  }
}

async function sendExternalAlert(summary) {
  const failedNames = summary.failed.map((item) => item.name + " — " + item.detail);
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? process.env.GITHUB_SERVER_URL + "/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + process.env.GITHUB_RUN_ID
    : "";

  const message = [
    "[OHMS PRODUCTION MONITOR] Health gate failed.",
    "Time: " + new Date().toISOString(),
    "Production URL: " + productionUrl,
    "Failed checks: " + (failedNames.join("; ") || "Unknown"),
    "Organizations checked: " + summary.organizationsChecked,
    "Diagnostic issues: " + summary.issueCount,
    "Patient details and full database payloads are intentionally excluded.",
    runUrl ? "Run details: " + runUrl : "",
  ].filter(Boolean).join("\n");

  if (!alertWebhookUrl) {
    console.error("BLOCKED_EXTERNAL_OWNER: OHMS_ALERT_WEBHOOK_URL is not configured. The GitHub Actions run will fail visibly, but no independent webhook notification can be delivered.");
    return false;
  }

  try {
    const response = await fetch(alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error("External alert webhook returned HTTP " + response.status + ".");
      return false;
    }
    console.log("External alert webhook accepted the failure notification.");
    return true;
  } catch (error) {
    console.error("External alert webhook request failed:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

async function writeSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const fs = await import("node:fs/promises");
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

async function main() {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    const message = "BLOCKED_EXTERNAL_OWNER: required repository secrets are missing: " + missing.join(", ") + ". Database monitoring is NOT active until configured.";
    console.error(message);
    await writeSummary(["## OHMS production monitor", "**BLOCKED_EXTERNAL_OWNER**", message]);
    process.exitCode = 78;
    return;
  }

  const checks = [
    { name: "public homepage", path: "/" },
    { name: "public appointment page", path: "/appointment" },
    { name: "expenses app route", path: "/app/expenses" },
    { name: "system health app route", path: "/app/system-health" },
    { name: "desktop release manifest", path: "/downloads/desktop/latest.json", json: true },
  ];

  const failed = [];
  for (const check of checks) {
    const result = await checkUrl(check);
    console.log((result.ok ? "PASS " : "FAIL ") + result.name + ": " + result.detail);
    if (!result.ok) failed.push(result);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let organizationsChecked = 0;
  let issueCount = 0;
  const diagnosticFailures = [];
  const { data: organizations, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });

  if (orgError || !Array.isArray(organizations) || organizations.length === 0) {
    failed.push({
      name: "database organization inventory",
      ok: false,
      detail: orgError ? "Query failed (" + (orgError.code || "UNKNOWN") + ")" : "No organizations or invalid response",
    });
  } else {
    for (const organization of organizations) {
      if (!organization || typeof organization.id !== "string") {
        failed.push({ name: "database organization inventory", ok: false, detail: "Malformed organization record" });
        continue;
      }

      organizationsChecked += 1;
      const { data, error } = await supabase.rpc("check_system_health_diagnostics", {
        p_org_id: organization.id,
      });

      if (
        error ||
        !data ||
        typeof data !== "object" ||
        typeof data.is_healthy !== "boolean" ||
        typeof data.health_score !== "number" ||
        !Array.isArray(data.issues) ||
        typeof data.total_issues !== "number"
      ) {
        const detail = "Health RPC unavailable or malformed (" + (error?.code || "INVALID_RESPONSE") + ")";
        failed.push({ name: "database diagnostics for organization " + organization.id, ok: false, detail });
        diagnosticFailures.push({ organizationId: organization.id, detail });
        continue;
      }

      const issues = data.issues;
      const count = Math.max(Number(data.total_issues) || 0, issues.length);
      issueCount += count;
      if (data.is_healthy !== true || count > 0) {
        const severityCounts = "critical=" + (Number(data.critical_count) || 0) +
          ", warning=" + (Number(data.warning_count) || 0) +
          ", info=" + (Number(data.info_count) || 0);
        failed.push({
          name: "database diagnostics for organization " + organization.id,
          ok: false,
          detail: "health score=" + data.health_score + ", issue count=" + count + ", " + severityCounts,
        });
      } else {
        console.log("PASS database health organization " + organization.id + ": health score 100, no reported issues");
      }
    }
  }

  const summaryLines = [
    "## OHMS production monitoring",
    "- Checked at: " + new Date().toISOString(),
    "- Public endpoints inspected: " + checks.length,
    "- Organizations inspected: " + organizationsChecked,
    "- Reported diagnostic issues: " + issueCount,
    "- Failed monitoring gates: " + failed.length,
    failed.length
      ? "### Failed gates\n" + failed.map((item) => "- " + item.name + ": " + item.detail).join("\n")
      : "**Result: PASS**",
    "- Scope note: this monitor checks public route availability and the database diagnostic engine's configured invariants. It does not prove every application workflow or hardware integration works.",
  ];
  await writeSummary(summaryLines);

  if (failed.length) {
    const notified = await sendExternalAlert({ failed, organizationsChecked, issueCount });
    if (!notified) {
      console.error("Independent notification channel is unavailable or failed; monitor result is still marked failed.");
    }
    console.error("OHMS monitoring failed with " + failed.length + " failing gate(s).");
    process.exitCode = 1;
    return;
  }

  console.log("OHMS monitoring passed: " + checks.length + " endpoint checks and " + organizationsChecked + " organization diagnostic runs.");
}

main().catch((error) => {
  console.error("OHMS monitor itself failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
