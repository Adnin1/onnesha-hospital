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

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const targetEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@onneshahospital.com";
  const targetPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!targetPassword) {
    console.error("CRITICAL: ADMIN_BOOTSTRAP_PASSWORD environment variable is required to provision or reset admin user.");
    console.error("Usage: ADMIN_BOOTSTRAP_PASSWORD=<strong_password> node scripts/create_admin.mjs");
    process.exit(1);
  }

  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Error listing users:", listErr);
    process.exit(1);
  }

  let user = usersData.users.find(u => u.email === targetEmail);

  if (!user) {
    console.log(`Creating initial admin user: ${targetEmail}...`);
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: "Hospital Director" }
    });

    if (createErr) {
      console.error("Failed to create user:", createErr);
      process.exit(1);
    }

    user = createData.user;
    console.log(`Admin user created with ID: ${user.id}`);
  } else {
    console.log(`User ${targetEmail} exists (ID: ${user.id}). Updating password & confirming...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: targetPassword,
      email_confirm: true,
    });
    if (updateErr) {
      console.error("Failed to update password:", updateErr);
      process.exit(1);
    }
    console.log("Password updated successfully!");
  }

  // Provision profile if profiles table exists
  const { error: profileErr } = await supabase.from("profiles").upsert({
    id: user.id,
    email: targetEmail,
    full_name: "Hospital Director",
    phone: process.env.ADMIN_PHONE || process.env.NEXT_PUBLIC_HOSPITAL_PHONE || "01712345678",
    is_active: true
  });

  if (profileErr) {
    console.warn("Profile table notice:", profileErr.message);
  } else {
    console.log("Profile created/updated successfully.");
  }

  console.log("\n==========================================");
  console.log("SUCCESS! INITIAL ADMIN ACCOUNT CREATED & VERIFIED:");
  console.log(`LOGIN URL: https://onnesha-hospital.pages.dev/login`);
  console.log(`EMAIL:    ${targetEmail}`);
  console.log(`PASSWORD: ${targetPassword}`);
  console.log("==========================================\n");
}

run();
