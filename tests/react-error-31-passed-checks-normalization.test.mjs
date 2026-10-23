import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("diagnostics action safely maps object-shaped passed_checks ({ check, status }) to strings", () => {
  const actionsSource = fs.readFileSync("lib/diagnostics/actions.ts", "utf8");
  assert.match(actionsSource, /passed_checks:\s*Array\.isArray\(res\.passed_checks\)/);
  assert.match(actionsSource, /item\s*&&\s*typeof\s*item\s*===\s*"object"\s*&&\s*"check"\s*in\s*item/);
});

test("SystemHealthAlertBanner extracts checkName safely to avoid React Error #31", () => {
  const bannerSource = fs.readFileSync("components/app/SystemHealthAlertBanner.tsx", "utf8");
  assert.match(bannerSource, /const checkName = typeof item === "string" \? item :/);
  assert.match(bannerSource, /<span className="font-mono text-\[11px\] truncate">\{checkName\}<\/span>/);
});

test("System Health page handles both string and object check elements without crashing", () => {
  const pageSource = fs.readFileSync("app/(hospital)/app/system-health/page.tsx", "utf8");
  assert.match(pageSource, /typeof item === "string" \? item === key : /);
  assert.match(pageSource, /"check"\s*in\s*item/);
});

test("/check-token layout defines explicit openGraph metadata pointing to /check-token", () => {
  const layoutSource = fs.readFileSync("app/(public)/check-token/layout.tsx", "utf8");
  assert.match(layoutSource, /openGraph:\s*\{/);
  assert.match(layoutSource, /url:\s*"\/check-token"/);
  assert.match(layoutSource, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
});
