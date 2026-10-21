import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

// Load .env.local if present
try {
  const envLocalPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        val = val.trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

test("Migration 230: Diagnostics Column Resolution & Robust Error Handling", async (t) => {
  const migrationPath = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261021160000_migration_230_fix_journal_entry_number_column_in_diagnostics.sql"
  );

  await t.test("1. Migration 230 file exists and contains correct column bindings", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 230 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // Must use authoritative je.entry_number
    assert.match(
      content,
      /SELECT\s+je\.entry_number/i,
      "Migration 230 must select authoritative column je.entry_number"
    );
    assert.match(
      content,
      /GROUP\s+BY\s+je\.id,\s*je\.entry_number/i,
      "Migration 230 must group by je.id, je.entry_number"
    );

    // Query must NOT query SELECT je.je_number
    assert.ok(
      !/SELECT\s+je\.je_number/i.test(content),
      "Migration 230 query must NOT select je.je_number"
    );
    assert.ok(
      !/GROUP\s+BY\s+je\.id,\s*je\.je_number/i.test(content),
      "Migration 230 query must NOT group by je.je_number"
    );

    // Must retain fail-closed shield for anonymous callers
    assert.match(
      content,
      /AUDIT_UNAUTHORIZED/,
      "Migration 230 must maintain Rule H-004 fail-closed shield"
    );

    // Must clean up open incident log entries related to je_number
    assert.match(
      content,
      /UPDATE\s+public\.system_health_issues_log/i,
      "Migration 230 must resolve active je_number incident log entries"
    );
  });

  await t.test("2. Remote Supabase invocation fails closed for anonymous caller", async (st) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !url ||
      !anonKey ||
      !url.startsWith("https://") ||
      url.includes("placeholder") ||
      url.includes("ci-hermetic") ||
      url.includes("127.0.0.1") ||
      anonKey.includes("placeholder")
    ) {
      st.skip("Live Supabase credentials unavailable or running in hermetic CI");
      return;
    }

    const client = createClient(url, anonKey);
    const { data, error } = await client.rpc("check_system_health_diagnostics");

    assert.ifError(error);
    assert.ok(data, "Diagnostic payload must be returned");
    assert.equal(data.is_healthy, false, "Anonymous caller must not be reported healthy");
    assert.equal(data.status, "AUDIT_UNAUTHORIZED", "Status must be AUDIT_UNAUTHORIZED");
    assert.equal(data.health_score, 0, "Health score must be strictly 0");
    assert.equal(data.critical_count, 1, "Must report 1 critical privilege issue");
    assert.ok(
      Array.isArray(data.issues) &&
        data.issues.some((i) => i.id === "DIAGNOSTIC_PRIVILEGE_REQUIRED"),
      "Must flag DIAGNOSTIC_PRIVILEGE_REQUIRED"
    );
  });
});
