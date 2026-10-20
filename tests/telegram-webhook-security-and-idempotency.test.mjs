import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { onRequest, onRequestGet, onRequestPost } from "../functions/api/telegram-webhook.js";

const VALID_SECRET = "test_mock_webhook_secret_0123456789abcdef";
const VALID_USER_ID = 1161469999;
const VALID_CHAT_ID = 1161469999;

function createMockContext({
  method = "POST",
  headers = {},
  body = null,
  env = {}
}) {
  const reqHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    reqHeaders.set(k, v);
  }

  let requestBody = null;
  if (body !== null) {
    if (typeof body === "string") {
      requestBody = body;
    } else {
      requestBody = JSON.stringify(body);
      if (!reqHeaders.has("content-type")) {
        reqHeaders.set("content-type", "application/json");
      }
    }
  }

  const req = new Request("https://onnesha-hospital.pages.dev/api/telegram-webhook", {
    method,
    headers: reqHeaders,
    body: requestBody
  });

  return {
    request: req,
    env: {
      TELEGRAM_BOT_TOKEN: "test_mock_bot_token",
      TELEGRAM_WEBHOOK_SECRET: VALID_SECRET,
      TELEGRAM_ALLOWED_USER_ID: String(VALID_USER_ID),
      TELEGRAM_ALLOWED_CHAT_ID: String(VALID_CHAT_ID),
      ...env
    }
  };
}

describe("OHMS Telegram Webhook Security, Fail-Closed Auth & Durable Idempotency", () => {

  test("1. GET health probe returns HTTP 200 with durable_idempotency indicator", async () => {
    const ctx = createMockContext({ method: "GET" });
    const res = await onRequest(ctx);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "ok");
    assert.equal(data.durable_idempotency, true);
    assert.equal(data.pc_required, false);
  });

  test("2. Unsupported HTTP methods (PUT, DELETE, PATCH) return deterministic HTTP 405 Method Not Allowed", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const ctx = createMockContext({ method });
      const res = await onRequest(ctx);
      assert.equal(res.status, 405, `Expected 405 for ${method}`);
      assert.equal(res.headers.get("Allow"), "GET, POST");
    }
  });

  test("3. POST without application/json Content-Type returns deterministic HTTP 415 Unsupported Media Type", async () => {
    const ctx = createMockContext({
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain text"
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 415);
    const text = await res.text();
    assert.match(text, /Unsupported Media Type/i);
  });

  test("4. POST with payload > 64KB returns deterministic HTTP 413 Payload Too Large", async () => {
    const huge = "a".repeat(70000);
    const ctx = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "70050"
      },
      body: JSON.stringify({ data: huge })
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 413);
    const text = await res.text();
    assert.match(text, /Payload Too Large/i);
  });

  test("5. POST with missing or wrong webhook secret token fails closed with HTTP 403 Forbidden", async () => {
    // Missing header
    const ctxNoHeader = createMockContext({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { update_id: 12345 }
    });
    const resNoHeader = await onRequest(ctxNoHeader);
    assert.equal(resNoHeader.status, 403);

    // Wrong header
    const ctxWrong = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong_secret_token"
      },
      body: { update_id: 12345 }
    });
    const resWrong = await onRequest(ctxWrong);
    assert.equal(resWrong.status, 403);
  });

  test("6. POST with malformed JSON body returns deterministic HTTP 400 Bad Request", async () => {
    const ctx = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": VALID_SECRET
      },
      body: "{ broken json : invalid"
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.match(text, /Malformed JSON/i);
  });

  test("7. POST with missing or non-integer update_id returns deterministic HTTP 400 Bad Request", async () => {
    for (const invalidUpdate of [
      {},
      { update_id: null },
      { update_id: "not_a_number" },
      { update_id: 12.34 },
      { update_id: -5 }
    ]) {
      const ctx = createMockContext({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": VALID_SECRET
        },
        body: invalidUpdate
      });
      const res = await onRequest(ctx);
      assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(invalidUpdate)}`);
    }
  });

  test("8. POST with unauthorized user or chat returns deterministic HTTP 403 Forbidden", async () => {
    const ctx = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": VALID_SECRET
      },
      body: {
        update_id: 90001,
        message: {
          from: { id: 99999999 }, // Unknown user
          chat: { id: VALID_CHAT_ID },
          text: "/status"
        }
      }
    });
    const res = await onRequest(ctx);
    assert.equal(res.status, 403);
  });

  test("9. Duplicate update_id returns idempotent acknowledgment without re-execution", async () => {
    const testUpdateId = Math.floor(Date.now() / 1000) * 100 + Math.floor(Math.random() * 90 + 10);
    const validPayload = {
      update_id: testUpdateId,
      message: {
        from: { id: VALID_USER_ID },
        chat: { id: VALID_CHAT_ID },
        text: "/status"
      }
    };

    // First delivery
    const ctx1 = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": VALID_SECRET
      },
      body: validPayload
    });
    const res1 = await onRequest(ctx1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.status, "ok");
    assert.equal(data1.update_id, testUpdateId);

    // Second delivery (duplicate retry)
    const ctx2 = createMockContext({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": VALID_SECRET
      },
      body: validPayload
    });
    const res2 = await onRequest(ctx2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.status, "ok");
    assert.equal(data2.duplicate, true, "Second delivery must be recognized as duplicate idempotency hit");
  });

  test("10. Migration 206 schema verifies operational idempotency and zero PHI storage", () => {
    const migPath = path.join(process.cwd(), "supabase/migrations/20261015110000_durable_telegram_update_idempotency.sql");
    assert.ok(fs.existsSync(migPath), "Migration 206 file must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Table definition
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.telegram_update_receipts/);
    assert.match(sql, /update_id BIGINT PRIMARY KEY/);
    assert.match(sql, /expires_at TIMESTAMPTZ/);

    // RLS enabled
    assert.match(sql, /ALTER TABLE public\.telegram_update_receipts ENABLE ROW LEVEL SECURITY/);

    // Zero PHI Invariant
    const prohibitedFields = ["patient", "phone", "nid", "prescription", "diagnosis", "medical_record", "message_body", "raw_text"];
    for (const f of prohibitedFields) {
      assert.ok(!sql.toLowerCase().includes(` ${f} `), `Prohibited PHI field found in migration 206: ${f}`);
    }

    // Atomic claim and complete RPCs
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_telegram_update_atomic/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.complete_telegram_update_atomic/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_telegram_update_atomic/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.complete_telegram_update_atomic/);
  });

});
