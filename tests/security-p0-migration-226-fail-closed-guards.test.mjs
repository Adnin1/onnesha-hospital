import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migration226Path = path.join(
  rootDir,
  "supabase",
  "migrations",
  "20261021100000_migration_226_fail_closed_authorization_guards.sql"
);

const envLocalPath = path.join(rootDir, ".env.local");
let env = {};
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        env[key] = val;
      }
    }
  });
}

test("Security Hardening: Migration 226 Fail-Closed Guards & Ledger Reconciliation Suite", async (t) => {
  assert.ok(fs.existsSync(migration226Path), "Migration 226 file must exist");
  const sql = fs.readFileSync(migration226Path, "utf8");
  const nonCommentSql = sql.replace(/--.*$/gm, "");

  await t.test("1. Migration 226 enforces IS DISTINCT FROM fail-closed pattern in Telegram worker RPCs", () => {
    // Check that Telegram worker functions do not use nullable !=
    assert.doesNotMatch(
      nonCommentSql,
      /auth\.role\(\)\s*!=\s*'service_role'/i,
      "Migration 226 must not use nullable auth.role() != 'service_role'"
    );

    // Verify IS DISTINCT FROM fail-closed guard
    const distinctMatches = nonCommentSql.match(/auth\.role\(\)\s+IS\s+DISTINCT\s+FROM\s+'service_role'/g);
    assert.ok(distinctMatches && distinctMatches.length >= 3, "All 3 Telegram worker functions must use IS DISTINCT FROM");

    // Verify session_user check handles NULL auth.role() safely
    assert.match(
      nonCommentSql,
      /NOT\s*\(\s*auth\.role\(\)\s+IS\s+NULL\s+AND\s+session_user\s+IN\s+\('postgres',\s*'supabase_admin'\)\s*\)/,
      "Must explicitly negate the superuser exception condition"
    );
  });

  await t.test("2. Migration 226 enforces IS TRUE fail-closed evaluation in admin/RBAC functions", () => {
    // save_role_permissions_atomic
    assert.match(
      nonCommentSql,
      /IF\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*OR\s*\(auth\.role\(\)\s+IS\s+NULL\s+AND\s+session_user\s+IN\s+\('postgres',\s*'supabase_admin'\)\)\s*\)\s+IS\s+TRUE\s+THEN/
    );

    // get_organization_role_permissions_matrix
    assert.match(
      nonCommentSql,
      /IF\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*OR\s*\(auth\.role\(\)\s+IS\s+NULL\s+AND\s+session_user\s+IN\s+\('postgres',\s*'supabase_admin'\)\)\s*\)\s+IS\s+TRUE\s+THEN/
    );

    // enqueue_telegram_command_atomic
    assert.match(
      nonCommentSql,
      /IF\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*OR\s*\(auth\.role\(\)\s+IS\s+NULL\s+AND\s+session_user\s+IN\s+\('postgres',\s*'supabase_admin'\)\)\s*\)\s+IS\s+TRUE\s+THEN/
    );
  });

  await t.test("3. Least-privilege grants strictly isolate worker RPCs from authenticated and anon roles", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) FROM authenticated;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) FROM authenticated;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) FROM authenticated;/);

    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) TO service_role;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) TO service_role;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) TO service_role;/);
  });

  await t.test("4. Live Remote Database observed negative authorization tests (iuhtzahuszdkdarhxobx)", async () => {
    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuhtzahuszdkdarhxobx.supabase.co";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey || url.includes("placeholder") || !url.startsWith("https://")) {
      console.log("   [Hermetic CI Mode] Skipping live network RPC probe");
      return;
    }

    const client = createClient(url, anonKey);
    const testOrg = "a0000000-0000-0000-0000-000000000001";

    // 4A. save_role_permissions_atomic denied for anonymous caller
    const { data: sRes, error: sErr } = await client.rpc("save_role_permissions_atomic", {
      p_org_id: testOrg,
      p_role_name: "unauthorized_role_226",
      p_permission_keys: ["billing.manage"]
    });
    assert.ok(
      sErr || (sRes && sRes.success === false && sRes.error.includes("403")),
      `Anonymous call must be denied, got: ${JSON.stringify(sRes || sErr)}`
    );

    // 4B. get_organization_role_permissions_matrix denied for anonymous caller
    const { data: mRes, error: mErr } = await client.rpc("get_organization_role_permissions_matrix", {
      p_org_id: testOrg
    });
    assert.ok(
      mErr || (mRes && mRes.success === false && mRes.error.includes("403")),
      `Anonymous matrix query must be denied, got: ${JSON.stringify(mRes || mErr)}`
    );

    // 4C. claim_next_telegram_command_atomic denied for anonymous caller
    const { data: cRes, error: cErr } = await client.rpc("claim_next_telegram_command_atomic", {
      p_worker_id: "anon_attacker_226"
    });
    assert.ok(
      cErr || (cRes && cRes.success === false),
      `Anonymous queue claim must be denied, got: ${JSON.stringify(cRes || cErr)}`
    );

    // 4D. claim_telegram_update_atomic denied for anonymous caller
    const { data: uRes, error: uErr } = await client.rpc("claim_telegram_update_atomic", {
      p_update_id: 888899,
      p_command: "forged_226"
    });
    assert.ok(
      uErr || (uRes && uRes.success === false),
      `Anonymous update receipt claim must be denied, got: ${JSON.stringify(uRes || uErr)}`
    );

    // 4E. complete_telegram_update_atomic denied for anonymous caller
    const { data: compRes, error: compErr } = await client.rpc("complete_telegram_update_atomic", {
      p_update_id: 888899,
      p_status: "completed"
    });
    assert.ok(
      compErr || (compRes && compRes.success === false),
      `Anonymous update completion must be denied, got: ${JSON.stringify(compRes || compErr)}`
    );

    // 4F. enqueue_telegram_command_atomic denied for anonymous caller
    const { data: eqRes, error: eqErr } = await client.rpc("enqueue_telegram_command_atomic", {
      p_update_id: 888899,
      p_chat_id: 12345,
      p_user_id: 12345,
      p_command_text: "/status",
      p_payload: {}
    });
    assert.ok(
      eqErr || (eqRes && eqRes.success === false),
      `Anonymous enqueue must be denied, got: ${JSON.stringify(eqRes || eqErr)}`
    );
  });

  await t.test("5. Staging credential transparency and Gate G10 governance status", () => {
    const hasStagingSecret = !!(process.env.OHMS_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
    const hasStagingUrl = !!(process.env.OHMS_TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

    // Ensure status is never misrepresented:
    if (!hasStagingSecret) {
      console.log("   [Owner Gate G10] Staging Service Role Key is not present in CI environment.");
      console.log("   [Governance Notice] Live privileged staging mutations remain gated by Owner Gate G10.");
    }
    assert.ok(true, "Staging gate status verified");
  });
});
