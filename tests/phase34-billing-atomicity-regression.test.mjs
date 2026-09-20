import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuhtzahuszdkdarhxobx.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

describe("OHMS Phase 34: Billing Pre-Validation Atomicity & Idempotency Hardening", () => {
  const migPath = path.join(ROOT, "supabase/migrations/20260919195000_fix_billing_atomicity_and_cashier_prevalidation.sql");

  test("1. Migration 20260919195000 exists and pre-validates cashier before invoice insert", () => {
    assert.ok(fs.existsSync(migPath), "Atomicity migration must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    const cashierCheckIdx = sql.indexOf("Step 8: Pre-validate Cashier");
    const invoiceInsertIdx = sql.indexOf("INSERT INTO public.invoices");

    assert.ok(cashierCheckIdx > 0, "Must have explicit cashier pre-validation step");
    assert.ok(invoiceInsertIdx > 0, "Must have invoice insertion step");
    assert.ok(
      cashierCheckIdx < invoiceInsertIdx,
      "CRITICAL ATOMICITY: Cashier validation must execute BEFORE invoice INSERT"
    );
  });

  test("2. create_invoice_atomic pre-validates item prices, quantities, and discount <= subtotal", () => {
    const sql = fs.readFileSync(migPath, "utf8");
    assert.match(sql, /Item unit price cannot be negative/);
    assert.match(sql, /Item quantity must be greater than zero/);
    assert.match(sql, /Discount amount cannot exceed invoice subtotal/);
    assert.match(sql, /Cash payment must not have a gateway transaction ID/);
  });

  test("3. collect_payment_atomic pre-validates explicit cashier and payment method integrity", () => {
    const sql = fs.readFileSync(migPath, "utf8");
    assert.match(sql, /Step 4: Validate explicit cashier BEFORE ANY MUTATION/);
    assert.match(sql, /Cash payment must not have a gateway transaction ID/);
  });

  test("4. Live DB Security: Anonymous execution of create_invoice_atomic is rejected", async (t) => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.rpc("create_invoice_atomic", {
      p_org_id: CANONICAL_ORG_ID,
      p_patient_id: "b0000000-0000-0000-0000-000000000001",
      p_items: [{ item_name: "Test", unit_price: 100, quantity: 1, service_category: "MISC" }],
      p_cashier_id: "00000000-0000-0000-0000-000000000999",
      p_initial_payment_amount: 100
    });

    if (error && (error.message?.includes("fetch") || error.message?.includes("network") || error.message?.includes("ENOTFOUND"))) {
      t.skip("Skipped due to network isolation");
      return;
    }

    assert.ok(error !== null || (data && data.success === false), "Must fail for unauthorized / invalid caller");
  });

  test("5. Desktop download page provides verified .exe and .msi links with actual sizes", () => {
    const pagePath = path.join(ROOT, "app/(public)/downloads/desktop/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    assert.match(content, /Onnesha-Hospital-Setup-.*\$\{version\}\.exe|Onnesha-Hospital-Setup-.*\.exe/, "Must link to NSIS setup executable");
    assert.match(content, /Onnesha-Hospital-.*\$\{version\}\.msi|Onnesha-Hospital-.*\.msi/, "Must link to MSI package");
    assert.match(content, /~2\.0 MB/, "Must display realistic NSIS setup size");
    assert.match(content, /~2\.5 MB/, "Must display realistic MSI package size");
  });

  test("6. Desktop latest.json manifest points to valid deployment assets", () => {
    const manifestPath = path.join(ROOT, "public/downloads/desktop/latest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.match(manifest.version, /^1\.0\.[34]/);
    assert.match(manifest.platforms["windows-x86_64"].installer_exe, /Onnesha-Hospital-Setup-1\.0\.\d+\.exe/);
    assert.match(manifest.platforms["windows-x86_64"].installer_msi, /Onnesha-Hospital-1\.0\.\d+\.msi/);
    assert.equal(manifest.signing.enabled, false);
  });
});
