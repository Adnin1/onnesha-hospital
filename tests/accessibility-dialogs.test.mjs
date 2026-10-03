import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Accessible Dialogs & Zero Raw Browser Dialog Invariant Suite", async (t) => {
  await t.test("1. ConfirmDialog component exists with WAI-ARIA modal dialog attributes", () => {
    const dialogPath = path.join(ROOT, "components/ui/ConfirmDialog.tsx");
    assert.ok(fs.existsSync(dialogPath), "components/ui/ConfirmDialog.tsx must exist");

    const content = fs.readFileSync(dialogPath, "utf8");
    assert.ok(content.includes('role="dialog"'), 'ConfirmDialog must have role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'ConfirmDialog must have aria-modal="true"');
    assert.ok(content.includes('aria-labelledby="confirm-dialog-title"'), "ConfirmDialog must have aria-labelledby");
    assert.ok(content.includes('aria-describedby="confirm-dialog-desc"'), "ConfirmDialog must have aria-describedby");
    assert.ok(content.includes('Escape'), "ConfirmDialog must handle Escape key dismissal");
    assert.ok(content.includes('min-h-[44px]'), "ConfirmDialog buttons must meet touch target minimums (44px)");
  });

  await t.test("2. Zero raw window.alert, alert, confirm, or prompt calls in application pages", () => {
    const appDir = path.join(ROOT, "app");
    const componentsDir = path.join(ROOT, "components");
    const libDir = path.join(ROOT, "lib");

    function findRawDialogs(dir) {
      const files = fs.readdirSync(dir, { recursive: true });
      const violations = [];
      const dialogPattern = /\b(alert|confirm|prompt)\s*\(/;

      for (const f of files) {
        if (!f.endsWith(".tsx") && !f.endsWith(".ts")) continue;
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) continue;

        // Skip BeforeInstallPromptEvent prompt() in InstallPrompt.tsx
        if (f.includes("InstallPrompt.tsx")) continue;

        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          // ignore comments
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (dialogPattern.test(line) || line.includes("window.alert") || line.includes("window.confirm") || line.includes("window.prompt")) {
            violations.push(`${f}:${idx + 1}: ${trimmed}`);
          }
        });
      }
      return violations;
    }

    const appViolations = findRawDialogs(appDir);
    const componentViolations = findRawDialogs(componentsDir);
    const libViolations = findRawDialogs(libDir);

    const allViolations = [...appViolations, ...componentViolations, ...libViolations];
    assert.deepEqual(
      allViolations,
      [],
      `Found forbidden raw browser dialogs:\n${allViolations.join("\n")}`
    );
  });

  await t.test("3. Critical Care page uses accessible ConfirmDialog for patient discharge/transfer", () => {
    const file = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/critical-care/page.tsx"), "utf8");
    assert.ok(file.includes("ConfirmDialog"), "Critical care page must use ConfirmDialog");
    assert.ok(!file.includes("window.confirm"), "Critical care page must not contain window.confirm");
  });

  await t.test("4. Security settings page uses accessible ConfirmDialog for TOTP unenrollment", () => {
    const file = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/settings/security/page.tsx"), "utf8");
    assert.ok(file.includes("ConfirmDialog"), "Security page must use ConfirmDialog");
    assert.ok(!file.includes("confirm("), "Security page must not contain confirm(");
  });

  await t.test("5. Staff settings page uses accessible ConfirmDialog for status changes", () => {
    const file = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/settings/staff/page.tsx"), "utf8");
    assert.ok(file.includes("ConfirmDialog"), "Staff settings page must use ConfirmDialog");
    assert.ok(!file.includes("window.confirm"), "Staff settings page must not contain window.confirm");
  });

  await t.test("6. Occupied bed panel uses accessible ConfirmDialog for housekeeping cleaning dispatch", () => {
    const file = fs.readFileSync(path.join(ROOT, "components/beds/OccupiedBedPanel.tsx"), "utf8");
    assert.ok(file.includes("ConfirmDialog"), "OccupiedBedPanel must use ConfirmDialog");
    assert.ok(!file.includes("confirm("), "OccupiedBedPanel must not contain confirm(");
  });
});
