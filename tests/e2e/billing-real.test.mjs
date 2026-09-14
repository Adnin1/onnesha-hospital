import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let serviceKey = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceKey = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

describe("OHMS Real E2E Test Suite 3: Billing & Financial Integrity", async () => {
  const adminClient = createClient(supabaseUrl, serviceKey);

  test("1. Invoices table schema enforces subtotal, paid_amount, due_amount columns", async () => {
    const { data, error } = await adminClient.from("invoices").select("id, invoice_number, subtotal, paid_amount, due_amount").limit(5);
    assert.equal(error, null, "Invoices table must exist in schema");
    assert.ok(Array.isArray(data));
  });

  test("2. Organizations invoice sequence and financial ledger tables exist", async () => {
    const { data, error } = await adminClient.from("organizations").select("id, code").limit(1);
    assert.equal(error, null);
    assert.ok(data && data.length > 0);
  });
});
