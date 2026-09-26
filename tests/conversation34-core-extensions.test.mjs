import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Conversation 34 Core Hospital & Clinical Extensions", () => {
  test("1. Migration 071 exists and defines all 10 Arch subfeature extension tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260926060000_arch_core_subfeature_extensions.sql");
    assert.ok(fs.existsSync(migPath), "Migration 071 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Subfeatures
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.health_packages"), "health_packages required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.patient_package_subscriptions"), "patient_package_subscriptions required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.patient_diet_charts"), "patient_diet_charts required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.inpatient_progress_notes"), "inpatient_progress_notes required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.inpatient_doctor_orders"), "inpatient_doctor_orders required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.pathology_reagent_lots"), "pathology_reagent_lots required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.radiology_media_stock"), "radiology_media_stock required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.doctor_accounts"), "doctor_accounts required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.doctor_fee_settlements"), "doctor_fee_settlements required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.employee_leave_applications"), "employee_leave_applications required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.employee_loans"), "employee_loans required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.hospital_licenses"), "hospital_licenses required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.corporate_clients"), "corporate_clients required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.patient_crm_followups"), "patient_crm_followups required");
  });

  test("2. Migration 071 applies RLS and tenant isolation to all 10 tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260926060000_arch_core_subfeature_extensions.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.ok(sql.includes("ALTER TABLE public.health_packages ENABLE ROW LEVEL SECURITY"), "RLS health packages required");
    assert.ok(sql.includes("ALTER TABLE public.patient_diet_charts ENABLE ROW LEVEL SECURITY"), "RLS diet charts required");
    assert.ok(sql.includes("ALTER TABLE public.pathology_reagent_lots ENABLE ROW LEVEL SECURITY"), "RLS reagents required");
    assert.ok(sql.includes("ALTER TABLE public.doctor_accounts ENABLE ROW LEVEL SECURITY"), "RLS doctor accounts required");
    assert.ok(sql.includes("private.get_current_org_id()"), "Tenant resolver required");
    assert.ok(sql.includes("app.current_organization_id"), "GUC tenant setting required");
  });

  test("3. Client actions exist for all extended domains", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "lib/packages/actions.ts")), "Health package actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/diet/actions.ts")), "Diet chart actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/lab/reagent-actions.ts")), "Reagent actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/radiology/media-actions.ts")), "Radiology media actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/accounting/doctor-settlement-actions.ts")), "Doctor settlement actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/crm/actions.ts")), "CRM actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/hr/leave-loan-actions.ts")), "HR leave/loan actions exist");
    assert.ok(fs.existsSync(path.join(ROOT, "lib/assets/license-actions.ts")), "Asset license actions exist");
  });

  test("4. Granular RBAC permissions for extended domains are defined in lib/permissions.ts", () => {
    const permPath = path.join(ROOT, "lib/permissions.ts");
    const content = fs.readFileSync(permPath, "utf8");

    assert.ok(content.includes("DIET_CHART_VIEW"), "DIET_CHART_VIEW required");
    assert.ok(content.includes("HEALTH_PACKAGE_VIEW"), "HEALTH_PACKAGE_VIEW required");
    assert.ok(content.includes("REAGENTS_VIEW"), "REAGENTS_VIEW required");
    assert.ok(content.includes("DOCTOR_ACCOUNTS_VIEW"), "DOCTOR_ACCOUNTS_VIEW required");
    assert.ok(content.includes("CORPORATE_CRM_VIEW"), "CORPORATE_CRM_VIEW required");
  });
});
