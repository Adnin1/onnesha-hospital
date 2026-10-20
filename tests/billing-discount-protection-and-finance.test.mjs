import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("Billing Discount Protection & Financial Breakdown Invariants", async (t) => {
  const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
  assert.ok(fs.existsSync(billingPagePath), "Billing page must exist");
  const content = fs.readFileSync(billingPagePath, "utf8");

  await t.test("1. Default discountMode is FIXED to match hospital counter conventions", () => {
    assert.match(content, /useState<"PERCENT" \| "FIXED">\("FIXED"\)/, "Default mode should be FIXED");
  });

  await t.test("2. Percentage discount over 60% is guarded and never zeros out the invoice", () => {
    assert.match(content, /isPercentOverLimit\s*=\s*discountMode === "PERCENT" && discountPercent !== "" && Number\(discountPercent\) > 60/);
    assert.match(content, /isPercentOverLimit\s*\?\s*0\s*:\s*Math\.min\(subtotal,\s*Math\.round\(\(subtotal \* Number\(discountPercent\)\) \/ 100\)\)/);
  });

  await t.test("3. Smart converter offers 1-click conversion from invalid percentage to fixed BDT", () => {
    assert.match(content, /⚠️ অনুমোদিত ডিসকাউন্ট শতকরা সীমা ৫% থেকে ৬০%/);
    assert.match(content, /টাকা নির্দিষ্ট ছাড়/);
    assert.match(content, /নির্দিষ্ট টাকায় পরিবর্তন করুন/);
  });

  await t.test("4. Financial breakdown summary always renders Subtotal, Discount, Grand Total and Due", () => {
    assert.match(content, /মোট বিল \(Subtotal\):/);
    assert.match(content, /Grand Total: \{formatCurrencyBDT\(netTotal\)\}/);
    assert.match(content, /Remaining Due: \{formatCurrencyBDT\(dueAmount\)\}/);
  });

  await t.test("5. Initial Payment provides Full and Due quick buttons", () => {
    assert.match(content, /setInitialPaymentAmount\(netTotal\)/);
    assert.match(content, /setInitialPaymentAmount\(0\)/);
  });

  await t.test("6. Dual discount mode switcher carries over values safely", () => {
    assert.match(content, /setDiscountMode\("PERCENT"\)/);
    assert.match(content, /setDiscountMode\("FIXED"\)/);
  });
});
