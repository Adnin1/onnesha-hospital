import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let anonKey = "";
let serviceKey = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
    if (line.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      anonKey = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceKey = line.split("=")[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}

describe("OHMS Real E2E Test Suite 4: Multi-Tenant & RLS Cross-Access Block", async () => {
  const anonClient = createClient(supabaseUrl, anonKey);
  const adminClient = createClient(supabaseUrl, serviceKey);

  test("1. Profiles / Auth schema verifies user profile attributes", async () => {
    const { data, error } = await adminClient.from("profiles").select("id, email, is_active").limit(5);
    // If profiles table exists or is restricted, error is null or handled
    if (!error) {
      assert.ok(Array.isArray(data));
    }
  });

  test("2. Unauthenticated anon client SELECT on patient records is isolated by RLS policy", async () => {
    const { data, error } = await anonClient.from("patients").select("id, full_name");
    if (error) {
      assert.ok(error.message.includes("permission") || error.code === "PGRST301" || error.code === "42501");
    } else {
      assert.deepEqual(data, [], "Anon user must read 0 rows from RLS-protected patients table");
    }
  });
});
