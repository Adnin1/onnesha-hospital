import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 38: v1.1.58 Production Closure, Bed/Cabin CRUD, OT Booking & Financial Reporting", () => {
  // Test 1: Bed & Cabin Matrix interactive CRUD actions & occupancy safeguards
  test("1. Bed & Cabin Matrix: Exports update and delete actions with occupancy safeguards", () => {
    const bedActionsPath = path.join(rootDir, "lib", "ipd", "bed-actions.ts");
    assert.ok(fs.existsSync(bedActionsPath), "lib/ipd/bed-actions.ts must exist");
    const content = fs.readFileSync(bedActionsPath, "utf8");

    assert.match(content, /export async function updateBedDetailsAction/, "Must export updateBedDetailsAction");
    assert.match(content, /export async function deleteBedAction/, "Must export deleteBedAction");
    assert.match(content, /export async function updateCabinDetailsAction/, "Must export updateCabinDetailsAction");
    assert.match(content, /export async function deleteCabinAction/, "Must export deleteCabinAction");
    assert.match(content, /Cannot delete an actively occupied bed/, "Must prevent deleting occupied bed");
    assert.match(content, /Cannot delete an actively occupied cabin/, "Must prevent deleting occupied cabin");

    const modalPath = path.join(rootDir, "components", "beds", "EditBedOrCabinModal.tsx");
    assert.ok(fs.existsSync(modalPath), "components/beds/EditBedOrCabinModal.tsx must exist");
    const modalContent = fs.readFileSync(modalPath, "utf8");
    assert.match(modalContent, /updateBedDetailsAction/, "Modal must wire updateBedDetailsAction");
    assert.match(modalContent, /deleteBedAction/, "Modal must wire deleteBedAction");
  });

  // Test 2: Critical Care Unit and Bed dynamic management
  test("2. Critical Care: Exports unit creation, tariff update, unit deletion, and bed addition actions", () => {
    const ccActionsPath = path.join(rootDir, "lib", "critical-care", "actions.ts");
    assert.ok(fs.existsSync(ccActionsPath), "lib/critical-care/actions.ts must exist");
    const content = fs.readFileSync(ccActionsPath, "utf8");

    assert.match(content, /export async function createCriticalCareUnitAction/, "Must export createCriticalCareUnitAction");
    assert.match(content, /export async function updateCriticalCareUnitAction/, "Must export updateCriticalCareUnitAction");
    assert.match(content, /export async function deleteCriticalCareUnitAction/, "Must export deleteCriticalCareUnitAction");
    assert.match(content, /export async function addCriticalCareBedAction/, "Must export addCriticalCareBedAction");
    assert.match(content, /Cannot delete unit while patients are actively admitted/, "Must safeguard active admission unit deletion");

    const ccModalPath = path.join(rootDir, "components", "critical-care", "CriticalCareUnitModal.tsx");
    assert.ok(fs.existsSync(ccModalPath), "components/critical-care/CriticalCareUnitModal.tsx must exist");
  });

  // Test 3: Patient Intake OT surgery option and 5%-60% discount enforcement
  test("3. Unified Patient Intake: Incorporates OT Surgery booking and enforces 5%-60% discount", () => {
    const patientActionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    const actionsContent = fs.readFileSync(patientActionsPath, "utf8");

    assert.match(actionsContent, /ot\?:/, "UnifiedPatientIntakePayload must support ot field");
    assert.match(actionsContent, /otBookingId\?: string/, "Intake return type must include otBookingId");
    assert.match(actionsContent, /from\("ot_bookings"\)/, "Must insert into ot_bookings on OT selection");

    const intakeModalPath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    const modalContent = fs.readFileSync(intakeModalPath, "utf8");
    assert.match(modalContent, /Operation Theatre \(OT\)/, "Must render OT service selection card");
    assert.match(modalContent, /otEnabled/, "Must track otEnabled state");
    assert.match(modalContent, /ot_rooms/, "Must load ot_rooms catalog");
    assert.match(modalContent, /Number\(admissionDiscountPercent\) < 5 \|\| Number\(admissionDiscountPercent\) > 60/, "Must enforce 5%-60% discount validation");
  });

  // Test 4: Billing quick adder, discount range, and automatic print trigger
  test("4. Billing Engine: Displays OT service category, enforces 5%-60% discount, and triggers instant print", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.match(content, /OT_SURGERY/, "Must include OT_SURGERY filter group");
    assert.match(content, /p < 5 \|\| p > 60/, "Must enforce 5%-60% discount validation");
    assert.match(content, /window\.print\(\)/, "Must automatically trigger print on invoice creation");
  });

  // Test 5: Utility hardening & Patient Registry error resilience
  test("5. Error Resilience: Utility functions and patient list tolerate null/undefined safely", () => {
    const utilsPath = path.join(rootDir, "lib", "utils.ts");
    const utilsContent = fs.readFileSync(utilsPath, "utf8");

    assert.match(utilsContent, /formatCurrencyBDT\(amount: number \| null \| undefined\)/, "Currency formatter must tolerate null/undefined");
    assert.match(utilsContent, /formatDateBDT\(dateStr: string \| Date \| null \| undefined\)/, "Date formatter must tolerate null/undefined");
    assert.match(utilsContent, /formatTimeBDT\(dateStr: string \| Date \| null \| undefined\)/, "Time formatter must tolerate null/undefined");

    const patientsPagePath = path.join(rootDir, "app", "(hospital)", "app", "patients", "page.tsx");
    const patientsContent = fs.readFileSync(patientsPagePath, "utf8");
    assert.match(patientsContent, /\(p\.full_name\s*\|\|\s*""\)\.toLowerCase\(\)/, "Patients page must safely filter full_name");
  });

  // Test 6: Core 6 financial reporting tabs in Reports Page
  test("6. Financial Reporting: All 6 core financial reporting views are wired and accessible", () => {
    const reportsPagePath = path.join(rootDir, "app", "(hospital)", "app", "reports", "page.tsx");
    const content = fs.readFileSync(reportsPagePath, "utf8");

    assert.match(content, /সার্বিক ইনভয়েস লেজার/, "Must render সার্বিক ইনভয়েস লেজার tab");
    assert.match(content, /বিভাগভিত্তিক আয় \(Departmental\)/, "Must render বিভাগভিত্তিক আয় tab");
    assert.match(content, /পেমেন্ট মাধ্যম \(Payment Channels\)/, "Must render পেমেন্ট মাধ্যম tab");
    assert.match(content, /লাভ-ক্ষতি বিবরণী \(Profit & Loss\)/, "Must render লাভ-ক্ষতি বিবরণী tab");
    assert.match(content, /বকেয়া বয়স ও অডিট \(AR Aging\)/, "Must render বকেয়া বয়স ও অডিট tab");
    assert.match(content, /বকেয়া খতিয়ান \(Dues Ledger\)/, "Must render বকেয়া খতিয়ান tab");
  });

  // Test 7: Synchronized version across all manifests (1.1.58+)
  test("7. Version Synchronization: version is synchronized across all files (1.1.58+)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    assert.match(pkg.version, /^1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)$/, "package.json must be 1.1.58-1.1.74");

    const pkgLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));
    assert.match(pkgLock.version, /^1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)$/, "package-lock.json must match");
    assert.match(pkgLock.packages[""].version, /^1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)$/, "package-lock.json empty package must match");

    const dockerfile = fs.readFileSync(path.join(rootDir, "Dockerfile"), "utf8");
    assert.match(dockerfile, /LABEL version="1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)"/, "Dockerfile LABEL version must match");

    const cargoToml = fs.readFileSync(path.join(rootDir, "src-tauri", "Cargo.toml"), "utf8");
    assert.match(cargoToml, /version\s*=\s*"1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)"/, "Cargo.toml version must match");

    const tauriConf = JSON.parse(fs.readFileSync(path.join(rootDir, "src-tauri", "tauri.conf.json"), "utf8"));
    assert.match(tauriConf.version, /^1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)$/, "tauri.conf.json version must match");

    const sw = fs.readFileSync(path.join(rootDir, "public", "sw.js"), "utf8");
    assert.match(sw, /CACHE_VERSION\s*=\s*'ohms-static-v5-1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)'/, "sw.js CACHE_VERSION must match");

    const latestJson = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "downloads", "desktop", "latest.json"), "utf8"));
    assert.match(latestJson.version, /^1\.1\.(58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74)$/, "latest.json version must match");
  });
});
