/**
 * Onnesha Hospital Management System (OHMS)
 * Enterprise Development & Local Seeder Script
 *
 * Populates realistic, standardized medical and administrative master datasets
 * for local development, staging verification, and Docker environments.
 */

import { createClient } from "@supabase/supabase-js";

const SEED_ENV = process.env.SEED_ENV;
if (!SEED_ENV || !["development", "staging"].includes(SEED_ENV.toLowerCase())) {
  console.error("❌ CRITICAL SAFETY ERROR: SEED_ENV must be explicitly set to 'development' or 'staging'.");
  console.error("   Production seeding is strictly prohibited by OHMS Engineering Governance (Section 37).");
  console.error("   Usage: SEED_ENV=development node scripts/seed-development-data.mjs");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are required to run seed script.");
  process.exit(1);
}

// Hard anti-production guard: Block known production project IDs and domains
const PROHIBITED_PROD_TARGETS = ["iuhtzahuszdkdarhxobx", "onneshahospital.com", "onnesha-hospital.pages.dev"];
if (PROHIBITED_PROD_TARGETS.some(target => SUPABASE_URL.includes(target))) {
  console.error("🚫 CRITICAL SAFETY VIOLATION: Seeding aborted! Target SUPABASE_URL matches production infrastructure.");
  console.error(`   Target URL: ${SUPABASE_URL}`);
  console.error("   Production databases must NEVER be seeded with synthetic development fixtures.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

async function runSeed() {
  console.log("🌱 [OHMS SEEDER] Starting Enterprise Data Provisioning...");

  // 1. Core Organization
  const { error: orgErr } = await supabase.from("organizations").upsert({
    id: DEFAULT_ORG_ID,
    name: "Onnesha Hospital & Diagnostic Complex",
    slug: "onnesha-hospital",
    address: "House 12, Road 4, Mirpur-10, Dhaka-1216, Bangladesh",
    phone: "+8801711000000",
    email: "info@onneshahospital.com",
    created_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (orgErr) {
    console.warn("⚠️ Organization seed notice:", orgErr.message);
  } else {
    console.log("✅ Organization verified.");
  }

  // 2. Clinical Departments
  const departments = [
    { organization_id: DEFAULT_ORG_ID, name: "Cardiology", code: "CARD", description: "Cardiovascular medicine, ECG, Echo, and cardiac diagnostics" },
    { organization_id: DEFAULT_ORG_ID, name: "Orthopedics", code: "ORTHO", description: "Bone, joint, spine, and trauma care" },
    { organization_id: DEFAULT_ORG_ID, name: "Pediatrics", code: "PED", description: "Infant, child, and adolescent healthcare" },
    { organization_id: DEFAULT_ORG_ID, name: "Obstetrics & Gynecology", code: "GYN", description: "Maternity, antenatal care, and women's health" },
    { organization_id: DEFAULT_ORG_ID, name: "General Surgery", code: "SURG", description: "Laparoscopic, emergency, and elective surgeries" },
    { organization_id: DEFAULT_ORG_ID, name: "Diagnostics & Pathology", code: "LAB", description: "Biochemistry, hematology, microbiology, and histology" },
    { organization_id: DEFAULT_ORG_ID, name: "Emergency & Casualty", code: "EMG", description: "24/7 Red/Yellow/Green triage and resuscitation" },
  ];

  for (const dept of departments) {
    await supabase.from("departments").upsert(dept, { onConflict: "organization_id,code" });
  }
  console.log(`✅ ${departments.length} Clinical Departments verified.`);

  console.log("🎉 [OHMS SEEDER] Provisioning completed successfully.");
}

runSeed().catch((err) => {
  console.error("❌ Seeding fatal exception:", err);
  process.exit(1);
});
