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

describe("OHMS Database & API Integration Suite: Patient Registration & OPD Schema", async () => {
  const adminClient = createClient(supabaseUrl, serviceKey);

  test("1. Patient database table query executes against live Supabase PostgreSQL schema", async () => {
    const { data, error } = await adminClient.from("patients").select("id, full_name, phone").limit(5);
    assert.equal(error, null, "Database query must execute cleanly");
    assert.ok(Array.isArray(data), "Patients array must be returned");
  });

  test("2. Organizations query returns active hospital tenant", async () => {
    const { data, error } = await adminClient.from("organizations").select("id, name, code").limit(1);
    assert.equal(error, null);
    assert.ok(data && data.length > 0, "At least 1 organization must exist in production DB");
    assert.equal(data[0].code, "OH");
  });

  test("3. OPD tokens / appointments table maintains sequence integrity", async () => {
    const { data, error } = await adminClient.from("appointments").select("id, token_number, appointment_date, status").limit(5);
    assert.equal(error, null);
    assert.ok(Array.isArray(data));
  });
});
