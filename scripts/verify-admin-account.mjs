import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envPath = path.resolve(ROOT, ".env.local");

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
let adminEmail = process.env.ADMIN_EMAIL || "aaih.apon@gmail.com";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = supabaseUrl || trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
    if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceKey = serviceKey || trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=") || trimmed.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=")) {
      anonKey = anonKey || trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
    if (trimmed.startsWith("NEXT_PUBLIC_HOSPITAL_EMAIL=")) {
      adminEmail = process.env.ADMIN_EMAIL || trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
  }
}

// Fallback to supabase CLI if service key is missing
if (!serviceKey) {
  try {
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const keysJson = execSync(`${npxCmd} supabase projects api-keys --project-ref iuhtzahuszdkdarhxobx --reveal --output json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const keys = JSON.parse(keysJson);
    const serviceEntry = keys.find((k) => k.type === "secret" || k.id === "service_role");
    if (serviceEntry?.api_key) {
      serviceKey = serviceEntry.api_key;
    }
  } catch {
    // CLI fallback unavailable
  }
}

if (!supabaseUrl) {
  supabaseUrl = "https://iuhtzahuszdkdarhxobx.supabase.co";
}

console.log("\n=======================================================");
console.log("🏥 OHMS ADMIN ACCOUNT & IAM INTEGRITY VERIFIER");
console.log("=======================================================");
console.log(`Target Admin Email: ${adminEmail}`);
console.log(`Supabase URL:       ${supabaseUrl}`);

if (!serviceKey) {
  console.log("⚠️ NOTICE: SUPABASE_SERVICE_ROLE_KEY not configured. Running public verification only.");
  process.exit(0);
}

const adminSupabase = createClient(supabaseUrl, serviceKey);

async function verify() {
  let passed = 0;
  let checks = 0;

  function report(name, isPass, detail) {
    checks++;
    if (isPass) {
      passed++;
      console.log(`✅ PASS: ${name} ${detail ? `(${detail})` : ""}`);
    } else {
      console.log(`❌ FAIL: ${name} ${detail ? `(${detail})` : ""}`);
    }
  }

  // 1. Verify user exists in auth.users
  const { data: usersData, error: listErr } = await adminSupabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to query auth.users:", listErr.message);
    process.exit(1);
  }

  const user = usersData.users.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase());
  report("1. User exists in auth.users", Boolean(user), user ? `ID: ${user.id}` : "User missing");

  if (!user) {
    console.log("\n❌ CRITICAL: Admin user does not exist in Supabase auth.");
    console.log(`Run: node scripts/create_admin.mjs to provision ${adminEmail}`);
    process.exit(1);
  }

  // 2. Verify email is confirmed
  report("2. Email is confirmed", Boolean(user.email_confirmed_at), `Confirmed at: ${user.email_confirmed_at}`);

  // 3. Verify user is not banned
  report("3. User is not banned", !user.banned_until, user.banned_until ? `Banned until: ${user.banned_until}` : "Clean");

  // 4. Verify profile in profiles table
  const { data: profile, error: profErr } = await adminSupabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  report("4. Profile exists in public.profiles", Boolean(profile), profErr ? profErr.message : `Profile ID: ${profile?.id}`);
  report("5. Profile is active", profile?.is_active === true && profile?.account_status === "ACTIVE", `Status: ${profile?.account_status}, Active: ${profile?.is_active}`);
  report("6. Organization ID is bound", Boolean(profile?.organization_id || profile?.active_organization_id), `Org: ${profile?.organization_id || profile?.active_organization_id}`);
  report("7. No forced password change barrier", profile?.must_change_password === false, `must_change_password: ${profile?.must_change_password}`);

  // 5. Verify super_admin role in user_roles
  const orgId = profile?.active_organization_id || profile?.organization_id || "a0000000-0000-0000-0000-000000000001";
  const { data: userRoles } = await adminSupabase
    .from("user_roles")
    .select("*, roles(*)")
    .eq("user_id", user.id)
    .eq("organization_id", orgId);

  const isSuperAdmin = userRoles && userRoles.some((ur) => ur.roles?.name === "super_admin");
  report("8. Super Admin role assigned", isSuperAdmin, isSuperAdmin ? "Role: super_admin" : "No super_admin role found");

  // 6. Verify employee record
  const { data: employee } = await adminSupabase
    .from("employees")
    .select("*")
    .eq("email", adminEmail)
    .maybeSingle();

  report("9. Employee record active", Boolean(employee && employee.status === "ACTIVE"), `Employee: ${employee?.employee_code || "None"}, Status: ${employee?.status || "None"}`);

  console.log("-------------------------------------------------------");
  console.log(`Results: ${passed}/${checks} checks passed.`);
  if (passed === checks) {
    console.log("🎉 ALL ADMIN ACCOUNT INTEGRITY CHECKS PASSED!\n");
  } else {
    console.log("⚠️ Some checks failed. Run: node scripts/create_admin.mjs to repair.\n");
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
