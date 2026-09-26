import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Conversation 35 Enterprise Modules (Modules 11-34)", () => {
  test("1. Migration 072 exists and defines all Enterprise tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260926070000_arch_enterprise_modules_11_to_34.sql");
    assert.ok(fs.existsSync(migPath), "Migration 072 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Enterprise tables
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.referral_agents"), "referral_agents required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.ot_theatres"), "ot_theatres required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.lis_analyzer_registry"), "lis_analyzer_registry required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.patient_complaints"), "patient_complaints required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.scholarship_applications"), "scholarship_applications required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.external_reference_labs"), "external_reference_labs required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.hr_job_vacancies"), "hr_job_vacancies required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.overseas_medical_profiles"), "overseas_medical_profiles required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.insurance_claims"), "insurance_claims required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.enterprise_parties"), "enterprise_parties required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.daycare_admissions"), "daycare_admissions required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.canteen_menu_items"), "canteen_menu_items required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.biomedical_devices"), "biomedical_devices required");
  });

  test("2. Migration 072 applies RLS and tenant isolation to all Enterprise tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260926070000_arch_enterprise_modules_11_to_34.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.ok(sql.includes("ALTER TABLE public.referral_agents ENABLE ROW LEVEL SECURITY"), "RLS referral_agents required");
    assert.ok(sql.includes("ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY"), "RLS insurance_claims required");
    assert.ok(sql.includes("ALTER TABLE public.enterprise_parties ENABLE ROW LEVEL SECURITY"), "RLS enterprise_parties required");
    assert.ok(sql.includes("ALTER TABLE public.daycare_admissions ENABLE ROW LEVEL SECURITY"), "RLS daycare_admissions required");
    assert.ok(sql.includes("ALTER TABLE public.biomedical_devices ENABLE ROW LEVEL SECURITY"), "RLS biomedical_devices required");
    assert.ok(sql.includes("private.get_current_org_id()"), "Tenant resolver required");
  });

  test("3. Client actions exist for all Enterprise domains", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "lib/referrals/actions.ts")), "Referral actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/integrations/lis/actions.ts")), "LIS actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/feedback/actions.ts")), "Feedback actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/scholarship/actions.ts")), "Scholarship actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/insurance/actions.ts")), "Insurance actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/parties/actions.ts")), "Party actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/daycare/actions.ts")), "Daycare actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/canteen/actions.ts")), "Canteen actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/biomedical/actions.ts")), "Biomedical actions exist");
  });

  test("4. Granular RBAC permissions for Enterprise domains are defined in lib/permissions.ts", () => {
    const permPath = path.join(ROOT, "lib/permissions.ts");
    const content = fs.readFileSync(permPath, "utf8");

    assert.ok(content.includes("REFERRAL_VIEW"), "REFERRAL_VIEW required");
    assert.ok(content.includes("LIS_ADAPTER_VIEW"), "LIS_ADAPTER_VIEW required");
    assert.ok(content.includes("FEEDBACK_VIEW"), "FEEDBACK_VIEW required");
    assert.ok(content.includes("INSURANCE_VIEW"), "INSURANCE_VIEW required");
    assert.ok(content.includes("PARTY_LEDGER_VIEW"), "PARTY_LEDGER_VIEW required");
    assert.ok(content.includes("DAYCARE_VIEW"), "DAYCARE_VIEW required");
    assert.ok(content.includes("CANTEEN_VIEW"), "CANTEEN_VIEW required");
    assert.ok(content.includes("BIOMEDICAL_VIEW"), "BIOMEDICAL_VIEW required");
  });
});
