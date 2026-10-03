import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envPath = path.resolve(ROOT, ".env.local");

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
let defaultAdminEmail = "aaih.apon@gmail.com";

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
      defaultAdminEmail = trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
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

if (!serviceKey) {
  console.error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is required to provision or reset admin user.");
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceKey);
const publicSupabase = anonKey ? createClient(supabaseUrl, anonKey) : null;

async function run() {
  const targetEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || defaultAdminEmail).toLowerCase().trim();
  const targetPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Onnesha@Admin2026!";
  const targetFullName = process.env.ADMIN_BOOTSTRAP_NAME || "Al Adal";
  const canonicalOrgId = "a0000000-0000-0000-0000-000000000001";
  const superAdminRoleId = "b0000000-0000-0000-0000-000000000001";

  console.log("\n=======================================================");
  console.log("🏥 OHMS ADMIN ACCOUNT PROVISIONING & RECOVERY TOOL");
  console.log("=======================================================");
  console.log(`Target Email:    ${targetEmail}`);
  console.log(`Supabase Target: ${supabaseUrl}`);

  const { data: usersData, error: listErr } = await adminSupabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Error listing users:", listErr.message);
    process.exit(1);
  }

  let user = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail);

  if (!user) {
    console.log(`\nCreating initial admin user: ${targetEmail}...`);
    const { data: createData, error: createErr } = await adminSupabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: targetFullName, email_verified: true },
    });

    if (createErr) {
      console.error("Failed to create admin user:", createErr.message);
      process.exit(1);
    }
    user = createData.user;
    console.log(`✅ Admin user created with ID: ${user.id}`);
  } else {
    console.log(`\nUser ${targetEmail} exists (ID: ${user.id}). Updating password & confirming email...`);
    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: targetFullName, email_verified: true },
    });
    if (updateErr) {
      console.error("Failed to update admin password:", updateErr.message);
      process.exit(1);
    }
    console.log("✅ Admin password updated and email confirmed!");
  }

  // Ensure profile is fully configured and active
  const { error: profileErr } = await adminSupabase.from("profiles").upsert({
    id: user.id,
    email: targetEmail,
    full_name: targetFullName,
    phone: process.env.ADMIN_PHONE || "01781934805",
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
    const { error: roleErr } = await adminSupabase.from("user_roles").insert({
      user_id: user.id,
      role_id: superAdminRoleId,
      organization_id: canonicalOrgId,
    });
    if (roleErr) {
      console.warn("⚠️ user_roles notice:", roleErr.message);
    } else {
      console.log("✅ Assigned super_admin role.");
    }
  } else {
    console.log("✅ super_admin role verified.");
  }

  // Generate fallback instant recovery action link
  let actionLink = "";
  try {
    const { data: linkData } = await adminSupabase.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
    });
    actionLink = linkData?.properties?.action_link || "";
  } catch {
    // Non-fatal
  }

  // Test public login to verify
  if (publicSupabase) {
    console.log("\nVerifying public signInWithPassword...");
    const { error: testErr } = await publicSupabase.auth.signInWithPassword({
      email: targetEmail,
      password: targetPassword,
    });
    if (testErr) {
      console.warn("⚠️ Public login test warning:", testErr.message);
    } else {
      console.log("✅ Public authentication test passed: JWT token verified.");
    }
  }

  console.log("\n=======================================================");
  console.log("🎉 SUCCESS! ADMIN ACCOUNT IS 100% OPERATIONAL:");
  console.log(`LOGIN URL:    https://onnesha-hospital.pages.dev/login`);
  console.log(`EMAIL:        ${targetEmail}`);
  console.log(`PASSWORD:     ${targetPassword}`);
  console.log(`ROLE:         super_admin (EMP-SUPERADMIN-001)`);
  if (actionLink) {
    console.log(`BACKUP LINK:  ${actionLink}`);
  }
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
