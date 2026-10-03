import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envPath = path.resolve(ROOT, ".env.local");

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

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
  }
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

function validatePasswordPolicy(password) {
  if (!password || password.length < 12) {
    return "Password must be at least 12 characters in length.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter (A-Z).";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter (a-z).";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one numeric digit (0-9).";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null;
}

console.log("\n=======================================================");
console.log("🏥 OHMS SECURE ADMIN PROVISIONING & IAM TOOL");
console.log("=======================================================");

// 1. Validate service role key
if (!serviceKey) {
  console.error("❌ FAIL-CLOSED: SUPABASE_SERVICE_ROLE_KEY environment variable is required.");
  console.error("Privileged administrative actions cannot be performed without authenticated service credentials.");
  process.exit(1);
}

// 2. Validate explicit inputs — zero default passwords
const targetEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").toLowerCase().trim();
const targetPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const targetFullName = process.env.ADMIN_BOOTSTRAP_NAME || "Hospital Administrator";

if (!targetEmail) {
  console.error("❌ FAIL-CLOSED: ADMIN_BOOTSTRAP_EMAIL is required.");
  console.error("Usage: ADMIN_BOOTSTRAP_EMAIL=\"admin@hospital.com\" ADMIN_BOOTSTRAP_PASSWORD=\"<secure-password>\" node scripts/create_admin.mjs");
  process.exit(1);
}

const passwordPolicyError = validatePasswordPolicy(targetPassword);
if (passwordPolicyError) {
  console.error(`❌ FAIL-CLOSED PASSWORD POLICY VIOLATION: ${passwordPolicyError}`);
  console.error("Passwords must be complex and at least 12 characters. Default or trivial passwords are prohibited.");
  process.exit(1);
}

console.log(`Target Admin:       ${redactEmail(targetEmail)}`);
console.log(`Supabase Target:    ${supabaseUrl}`);

const adminSupabase = createClient(supabaseUrl, serviceKey);
const publicSupabase = anonKey ? createClient(supabaseUrl, anonKey) : null;

async function run() {
  // Authoritative Database Resolution: Fetch active organization
  const { data: orgData, error: orgErr } = await adminSupabase
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (orgErr || !orgData) {
    console.error("❌ Failed to resolve active organization from database:", orgErr?.message || "No active organization found");
    process.exit(1);
  }
  const canonicalOrgId = orgData.id;
  console.log(`Authoritative Org:  ${orgData.name} (${redactId(canonicalOrgId)})`);

  // Authoritative Database Resolution: Fetch super_admin role
  const { data: roleData, error: roleErr } = await adminSupabase
    .from("roles")
    .select("id, name")
    .eq("name", "super_admin")
    .maybeSingle();

  if (roleErr || !roleData) {
    console.error("❌ Failed to resolve super_admin role from database:", roleErr?.message || "Role not found");
    process.exit(1);
  }
  const superAdminRoleId = roleData.id;
  console.log(`Authoritative Role: ${roleData.name} (${redactId(superAdminRoleId)})`);

  // Query auth.users
  const { data: usersData, error: listErr } = await adminSupabase.auth.admin.listUsers();
  if (listErr) {
    console.error("❌ Error querying auth.users:", listErr.message);
    process.exit(1);
  }

  let user = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail);

  if (!user) {
    console.log(`\nCreating initial admin user: ${redactEmail(targetEmail)}...`);
    const { data: createData, error: createErr } = await adminSupabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: targetFullName, email_verified: true },
    });

    if (createErr) {
      console.error("❌ Failed to create admin user:", createErr.message);
      process.exit(1);
    }
    user = createData.user;
    console.log(`✅ Admin user provisioned (ID: ${redactId(user.id)})`);
  } else {
    console.log(`\nUpdating existing user (ID: ${redactId(user.id)})...`);
    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: targetFullName, email_verified: true },
    });
    if (updateErr) {
      console.error("❌ Failed to update admin credential:", updateErr.message);
      process.exit(1);
    }
    console.log("✅ Admin credential updated and email confirmed.");
  }

  // Ensure profile is fully configured and active
  const { error: profileErr } = await adminSupabase.from("profiles").upsert({
    id: user.id,
    email: targetEmail,
    full_name: targetFullName,
    is_active: true,
    account_status: "ACTIVE",
    must_change_password: false,
    organization_id: canonicalOrgId,
    active_organization_id: canonicalOrgId,
    employee_id: "EMP-SUPERADMIN-001",
  });

  if (profileErr) {
    console.warn("⚠️ Profile upsert notice:", profileErr.message);
  } else {
    console.log("✅ Profile synchronized with ACTIVE status and organization boundary.");
  }

  // Ensure super_admin role in user_roles
  const { data: existingRoles } = await adminSupabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_id", superAdminRoleId)
    .eq("organization_id", canonicalOrgId);

  if (!existingRoles || existingRoles.length === 0) {
    const { error: assignRoleErr } = await adminSupabase.from("user_roles").insert({
      user_id: user.id,
      role_id: superAdminRoleId,
      organization_id: canonicalOrgId,
    });
    if (assignRoleErr) {
      console.warn("⚠️ user_roles notice:", assignRoleErr.message);
    } else {
      console.log("✅ Assigned super_admin role.");
    }
  } else {
    console.log("✅ super_admin role verified.");
  }

  // Post-change authentication verification (no secrets logged)
  if (publicSupabase) {
    const { error: testErr } = await publicSupabase.auth.signInWithPassword({
      email: targetEmail,
      password: targetPassword,
    });
    if (testErr) {
      console.warn("⚠️ Post-change verification notice:", testErr.message);
    } else {
      console.log("✅ Post-change public authentication verified: token issued successfully.");
    }
  }

  console.log("\n=======================================================");
  console.log("🎉 SUCCESS: Administrative account provisioned/updated.");
  console.log(`Target:      ${redactEmail(targetEmail)}`);
  console.log("Status:      ACTIVE");
  console.log("Credentials: Validated against security policy (not echoed)");
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
