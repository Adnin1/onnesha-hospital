import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migration225Path = path.join(
  rootDir,
  "supabase",
  "migrations",
  "20261021090000_migration_225_remediate_security_definer_current_user_bypass.sql"
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

test("Security Hardening: Migration 225 Definer Bypass & Synthetic Authorization Suite", async (t) => {
  assert.ok(fs.existsSync(migration225Path), "Migration 225 file must exist");
  const sql = fs.readFileSync(migration225Path, "utf8");

  await t.test("1. Migration 225 eliminates current_user from all SECURITY DEFINER authorization checks", () => {
    const nonCommentSql = sql.replace(/--.*$/gm, "");
    assert.doesNotMatch(
      nonCommentSql,
      /current_user\s+IN/i,
      "Migration 225 must NEVER check current_user IN (...) in executable code"
    );
    assert.doesNotMatch(
      nonCommentSql,
      /current_user\s*=\s*'service_role'/i,
      "Migration 225 must not check current_user = 'service_role'"
    );
    assert.match(
      sql,
      /auth\.role\(\)\s*=\s*'service_role'\s*OR\s*\(auth\.role\(\)\s+IS\s+NULL\s+AND\s+session_user\s+IN\s+\('postgres',\s*'supabase_admin'\)\)/,
      "Migration 225 must check auth.role() = 'service_role' or direct superuser session_user"
    );
  });

  await t.test("2. save_role_permissions_atomic enforces target-org admin authorization", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.save_role_permissions_atomic/);
    assert.match(sql, /403 Forbidden: Only authorized administrator can modify RBAC permissions\./);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) FROM anon;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) TO authenticated, service_role;/);
  });

  await t.test("3. get_organization_role_permissions_matrix enforces target-org admin authorization", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_organization_role_permissions_matrix/);
    assert.match(sql, /403 Forbidden: Unauthorized access to organization role matrix\./);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_organization_role_permissions_matrix\(UUID\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_organization_role_permissions_matrix\(UUID\) FROM anon;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_organization_role_permissions_matrix\(UUID\) TO authenticated, service_role;/);
  });

  await t.test("4. Telegram worker & receipt RPCs revoked from authenticated role", () => {
    // claim_next_telegram_command_atomic
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) FROM authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) TO service_role;/);

    // claim_telegram_update_atomic
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) FROM authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) TO service_role;/);

    // complete_telegram_update_atomic
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) FROM authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) TO service_role;/);
  });

  await t.test("5. functions/api/telegram-webhook.js has zero fallback to public anon key for privileged RPCs", () => {
    const webhookPath = path.join(rootDir, "functions", "api", "telegram-webhook.js");
    assert.ok(fs.existsSync(webhookPath));
    const content = fs.readFileSync(webhookPath, "utf8");
    assert.doesNotMatch(
      content,
      /SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*context\.env\?\.NEXT_PUBLIC_SUPABASE_ANON_KEY/,
      "Webhook must never fall back to public anon key for privileged operations"
    );
    assert.match(
      content,
      /serviceRoleKey/,
      "Webhook must verify serviceRoleKey explicitly"
    );
  });

  await t.test("6. Live Remote Database negative authorization tests for unprivileged callers", async () => {
    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuhtzahuszdkdarhxobx.supabase.co";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey || url.includes("placeholder") || !url.startsWith("https://")) {
      console.log("   [Hermetic CI Mode] Skipping live network RPC probe");
      return;
    }

    const client = createClient(url, anonKey);
    const testOrg = "a0000000-0000-0000-0000-000000000001";

    // 6A. Anonymous attempt to execute save_role_permissions_atomic must be rejected
    const { data: saveRes, error: saveErr } = await client.rpc("save_role_permissions_atomic", {
      p_org_id: testOrg,
      p_role_name: "unauthorized_role",
      p_permission_keys: ["billing.manage"]
    });
    // Either PostgREST returns permission denied error (42501) or RPC returns 403 Forbidden
    assert.ok(
      saveErr || (saveRes && saveRes.success === false && saveRes.error.includes("403")),
      `Anonymous call must be denied, got result: ${JSON.stringify(saveRes || saveErr)}`
    );

    // 6B. Anonymous attempt to execute get_organization_role_permissions_matrix must be rejected
    const { data: matrixRes, error: matrixErr } = await client.rpc("get_organization_role_permissions_matrix", {
      p_org_id: testOrg
    });
    assert.ok(
      matrixErr || (matrixRes && matrixRes.success === false && matrixRes.error.includes("403")),
      `Anonymous role matrix query must be denied, got result: ${JSON.stringify(matrixRes || matrixErr)}`
    );

    // 6C. Anonymous attempt to claim telegram command must be rejected
    const { data: claimRes, error: claimErr } = await client.rpc("claim_next_telegram_command_atomic", {
      p_worker_id: "anon_attacker"
    });
    assert.ok(
      claimErr || (claimRes && claimRes.success === false && claimRes.error.includes("403")),
      `Anonymous claim command must be rejected, got: ${JSON.stringify(claimRes || claimErr)}`
    );

    // 6D. Anonymous attempt to claim telegram update must be rejected
    const { data: updateRes, error: updateErr } = await client.rpc("claim_telegram_update_atomic", {
      p_update_id: 888888,
      p_command: "forged"
    });
    assert.ok(
      updateErr || (updateRes && updateRes.success === false && updateRes.error.includes("403")),
      `Anonymous claim update must be rejected, got: ${JSON.stringify(updateRes || updateErr)}`
    );

    // 6E. Anonymous attempt to enqueue telegram command must be rejected
    const { data: enqRes, error: enqErr } = await client.rpc("enqueue_telegram_command_atomic", {
      p_update_id: 888889,
      p_chat_id: 12345,
      p_user_id: 12345,
      p_command_text: "/malicious",
      p_payload: {}
    });
    assert.ok(
      enqErr || (enqRes && enqRes.success === false && enqRes.error.includes("403")),
      `Anonymous queue injection must be rejected, got: ${JSON.stringify(enqRes || enqErr)}`
    );
  });
});
