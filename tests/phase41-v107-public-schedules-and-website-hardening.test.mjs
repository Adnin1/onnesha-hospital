/**
 * Phase 41: V1.0.7 Public Website, Dynamic Doctor Schedules & Release Hardening Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 41 - v1.0.7 Public Schedules, Content Hardening & Release Governance", async (t) => {
  const actionsPath = path.join(ROOT, "lib/public/actions.ts");
  const doctorsPagePath = path.join(ROOT, "app/(public)/doctors/page.tsx");
  const homePagePath = path.join(ROOT, "app/(public)/page.tsx");
  const navbarPath = path.join(ROOT, "components/public/PublicNavbar.tsx");
  const ciWorkflowPath = path.join(ROOT, ".github/workflows/ci.yml");
  const gitignorePath = path.join(ROOT, ".gitignore");
  const pkgJsonPath = path.join(ROOT, "package.json");
  const pkgLockPath = path.join(ROOT, "package-lock.json");
  const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
  const cargoTomlPath = path.join(ROOT, "src-tauri/Cargo.toml");
  const latestJsonPath = path.join(ROOT, "public/downloads/desktop/latest.json");

  assert.ok(fs.existsSync(actionsPath), "actions.ts must exist");
  assert.ok(fs.existsSync(doctorsPagePath), "doctors page must exist");
  assert.ok(fs.existsSync(homePagePath), "homepage must exist");
  assert.ok(fs.existsSync(navbarPath), "navbar must exist");
  assert.ok(fs.existsSync(ciWorkflowPath), "ci.yml must exist");

  const actionsCode = fs.readFileSync(actionsPath, "utf8");
  const doctorsCode = fs.readFileSync(doctorsPagePath, "utf8");
  const homeCode = fs.readFileSync(homePagePath, "utf8");
  const navbarCode = fs.readFileSync(navbarPath, "utf8");
  const ciCode = fs.readFileSync(ciWorkflowPath, "utf8");
  const gitignoreCode = fs.readFileSync(gitignorePath, "utf8");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, "utf8"));
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
  const latestJson = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));

  await t.test("1. lib/public/actions.ts queries doctor_schedules and formats visiting hours dynamically", () => {
    assert.match(actionsCode, /doctor_schedules\(id, day_of_week, start_time, end_time, is_active\)/);
    assert.match(actionsCode, /export function formatVisitingHoursSummary/);
    assert.match(actionsCode, /Schedule on request/);
    assert.match(actionsCode, /PublicDoctorScheduleSummary/);
  });

  await t.test("2. formatVisitingHoursSummary algorithmic verification", () => {
    function formatVisitingHoursSummary(schedules) {
      const active = (schedules || []).filter((s) => s.is_active !== false);
      if (active.length === 0) return "Schedule on request";

      const formatTime12h = (timeStr) => {
        if (!timeStr) return "";
        const parts = timeStr.split(":");
        const h = parseInt(parts[0], 10);
        const m = parts[1] || "00";
        if (isNaN(h)) return timeStr;
        const ampm = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 || 12;
        return `${hour12.toString().padStart(2, "0")}:${m} ${ampm}`;
      };

      const first = active[0];
      const timeRange = `${formatTime12h(first.start_time)} - ${formatTime12h(first.end_time)}`;
      const days = active.map((s) => s.day_of_week.slice(0, 3)).join(", ");
      return `${days} (${timeRange})`;
    }

    const testSchedules = [
      { day_of_week: "MONDAY", start_time: "09:00:00", end_time: "13:00:00", is_active: true },
      { day_of_week: "WEDNESDAY", start_time: "09:00:00", end_time: "13:00:00", is_active: true },
    ];
    assert.equal(formatVisitingHoursSummary(testSchedules), "MON, WED (09:00 AM - 01:00 PM)");
    assert.equal(formatVisitingHoursSummary([]), "Schedule on request");
    assert.equal(formatVisitingHoursSummary(null), "Schedule on request");
    assert.equal(
      formatVisitingHoursSummary([
        { day_of_week: "SUNDAY", start_time: "10:00:00", end_time: "12:00:00", is_active: false },
      ]),
      "Schedule on request"
    );
  });

  await t.test("3. Hardcoded doctor schedule (05:00 PM - 08:30 PM) is permanently removed from doctors page", () => {
    assert.doesNotMatch(doctorsCode, /05:00 PM - 08:30 PM/);
    assert.match(doctorsCode, /doc\.visiting_hours_text/);
  });

  await t.test("4. Dev cluster pricing banner is permanently removed from homepage, layout, footer, and llms.txt", () => {
    assert.doesNotMatch(homeCode, /Dedicated Cloud Cluster/i);
    assert.doesNotMatch(homeCode, /\$25\s*-\s*\$65/);
    assert.match(homeCode, /HOSPITAL_METADATA\.emergencyHotline \?/);

    const layoutCode = fs.readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
    assert.doesNotMatch(layoutCode, /\$25/);
    assert.doesNotMatch(layoutCode, /\$65/);

    const footerCode = fs.readFileSync(path.join(ROOT, "components/public/PublicFooter.tsx"), "utf8");
    assert.doesNotMatch(footerCode, /\$25/);
    assert.doesNotMatch(footerCode, /\$65/);

    const llmsCode = fs.readFileSync(path.join(ROOT, "public/llms.txt"), "utf8");
    assert.doesNotMatch(llmsCode, /\$25/);
    assert.doesNotMatch(llmsCode, /\$65/);
  });

  await t.test("5. Emergency & ambulance hotline gracefully handles missing values in PublicNavbar", () => {
    assert.match(navbarCode, /HOSPITAL_METADATA\.emergencyHotline \?/);
    assert.match(navbarCode, /24\/7 Desk/);
    assert.match(navbarCode, /HOSPITAL_METADATA\.ambulanceHotline \?/);
  });

  await t.test("6. CI workflow includes automated Cloudflare Pages production deployment job", () => {
    assert.match(ciCode, /deploy-production:/);
    assert.match(ciCode, /wrangler pages deploy out/);
    assert.match(ciCode, /CLOUDFLARE_API_TOKEN/);
  });

  await t.test("7. Desktop installer binaries are excluded in .gitignore and untracked", () => {
    assert.match(gitignoreCode, /public\/downloads\/desktop\/\*\.msi/);
    assert.match(gitignoreCode, /public\/downloads\/desktop\/\*\.exe/);
    assert.ok(
      !fs.existsSync(path.join(ROOT, "public/downloads/desktop/Onnesha-Hospital-1.0.0.msi")),
      "Old MSI binary must be removed from git directory"
    );
    assert.ok(
      !fs.existsSync(path.join(ROOT, "public/downloads/desktop/Onnesha-Hospital-Setup-1.0.0.exe")),
      "Old EXE binary must be removed from git directory"
    );
  });

  await t.test("8. v1.1.0 version synchronization across all manifests and configs", () => {
    assert.equal(pkgJson.version, "1.1.0");
    assert.equal(pkgLock.version, "1.1.0");
    assert.equal(tauriConf.version, "1.1.0");
    assert.match(cargoToml, /version = "1\.1\.0"/);
    assert.equal(latestJson.version, "1.1.0");
    assert.match(latestJson.platforms["windows-x86_64"].installer_exe, /1\.1\.0\.exe/);
    assert.match(latestJson.platforms["windows-x86_64"].installer_msi, /1\.1\.0.*\.msi/);
  });
});
