import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envPath = path.resolve(ROOT, ".env.local");

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let adminEmail = process.env.ADMIN_EMAIL || "";

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
    if (trimmed.startsWith("NEXT_PUBLIC_HOSPITAL_EMAIL=")) {
      adminEmail = adminEmail || trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
    }
  }
}

if (!adminEmail) {
  adminEmail = process.env.ADMIN_EMAIL || "aaih.apon@gmail.com";
}

if (!supabaseUrl) {
  supabaseUrl = "https://iuhtzahuszdkdarhxobx.supabase.co";
}

function redactEmail(email) {
  if (!email || !email.includes("@")) return "[REDACTED]";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

function redactId(id) {
  if (!id || typeof id !== "string") return "[REDACTED]";
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

console.log("\n=======================================================");
console.log("🏥 OHMS ADMIN ACCOUNT & IAM INTEGRITY VERIFIER");
console.log("=======================================================");
console.log(`Target Admin:       ${redactEmail(adminEmail)}`);
console.log(`Supabase Target:    ${supabaseUrl}`);

// Strict Fail-Closed: Never pass or return 0 if service credentials are missing
if (!serviceKey) {
  console.error("\n❌ BLOCKED — Privileged verification credentials unavailable.");
  console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is required to execute IAM audit.");
  console.error("Fail-closed enforcement: Exiting non-zero.\n");
  process.exit(1);
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
  report("1. User exists in auth.users", Boolean(user), user ? `ID: ${redactId(user.id)}` : "User missing");

  if (!user) {
    console.log(`\n❌ CRITICAL: Admin user ${redactEmail(adminEmail)} does not exist in Supabase auth.`);
    process.exit(1);
  }

  // 2. Verify email is confirmed
  report("2. Email is confirmed", Boolean(user.email_confirmed_at), user.email_confirmed_at ? "Confirmed" : "Unconfirmed");

  // 3. Verify user is not banned
  report("3. User is not banned", !user.banned_until, user.banned_until ? "Banned" : "Clean");

  // 4. Verify profile in profiles table
  const { data: profile, error: profErr } = await adminSupabase
    .from("profiles")
    .select("id, is_active, account_status, organization_id, active_organization_id, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  report("4. Profile exists in public.profiles", Boolean(profile), profErr ? "Profile error" : `Profile ID: ${redactId(profile?.id)}`);
  report("5. Profile is active", profile?.is_active === true && profile?.account_status === "ACTIVE", `Status: ${profile?.account_status || "None"}`);
  report("6. Organization ID is bound", Boolean(profile?.organization_id || profile?.active_organization_id), `Org: ${redactId(profile?.organization_id || profile?.active_organization_id)}`);
  report("7. No forced password change barrier", profile?.must_change_password === false, `must_change_password: ${profile?.must_change_password}`);

  // 5. Verify super_admin role in user_roles
  const orgId = profile?.active_organization_id || profile?.organization_id;
  let isSuperAdmin = false;
  if (orgId) {
    const { data: userRoles } = await adminSupabase
      .from("user_roles")
      .select("*, roles(name)")
      .eq("user_id", user.id)
      .eq("organization_id", orgId);

    isSuperAdmin = Boolean(userRoles && userRoles.some((ur) => ur.roles?.name === "super_admin"));
  }
  report("8. Super Admin role assigned", isSuperAdmin, isSuperAdmin ? "Role: super_admin" : "No super_admin role found");

  // 6. Verify employee record
  const { data: employee } = await adminSupabase
    .from("employees")
    .select("id, employee_code, status")
    .eq("email", adminEmail)
    .maybeSingle();

  report("9. Employee record active", Boolean(employee && employee.status === "ACTIVE"), `Employee: ${employee?.employee_code || "None"}, Status: ${employee?.status || "None"}`);

  console.log("-------------------------------------------------------");
  console.log(`Results: ${passed}/${checks} checks passed.`);
  if (passed === checks) {
    console.log("🎉 ALL ADMIN ACCOUNT INTEGRITY CHECKS PASSED!\n");
  } else {
    console.log("⚠️ One or more checks failed. Review administrative IAM configuration.\n");
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error("Verification failed:", err.message || err);
  process.exit(1);
});
