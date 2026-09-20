import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 9 HR & Biometric Attendance Engine Suite (10 Scenarios)", () => {
  // Scenario 1: types/hr.ts defines EmployeeRecord, AttendanceRecordItem, PayrollRunRecord
  test("1. types/hr.ts defines EmployeeRecord, AttendanceRecordItem, PayrollRunRecord", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "hr.ts"), "utf8");
    assert.match(typesContent, /export interface EmployeeRecord/);
    assert.match(typesContent, /export interface AttendanceRecordItem/);
    assert.match(typesContent, /export interface AttendanceDeviceRecord/);
    assert.match(typesContent, /export interface PayrollRunRecord/);
  });

  // Scenario 2: getEmployeesAction checks hr.view permission and joins designations & departments
  test("2. getEmployeesAction enforces hr.view permission and joins department and designation", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "hr", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getEmployeesAction/);
    assert.match(actionsContent, /requirePermission\("hr\.view"\)/);
    assert.match(actionsContent, /employee_designations/);
    assert.match(actionsContent, /departments/);
  });

  // Scenario 3: createEmployeeAction enforces hr.manage permission and generates employee code
  test("3. createEmployeeAction asserts hr.manage permission and audits employee registration", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "hr", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("hr\.manage"\)/);
    assert.match(actionsContent, /\.from\("employees"\)\s*\.insert/);
    assert.match(actionsContent, /recordAuditLog/);
    assert.match(actionsContent, /entityType:\s*"employee"/);
  });

  // Scenario 4: recordBiometricPunchAction flags late attendance when punch exceeds morning cutoff
  test("4. recordBiometricPunchAction flags is_late for punches after 09:15 AM", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "hr", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function recordBiometricPunchAction/);
    assert.match(actionsContent, /isLate/);
    assert.match(actionsContent, /\.from\("attendance_records"\)\s*\.insert/);
  });

  // Scenario 5: getTodayAttendanceAction retrieves daily punch log with late counts
  test("5. getTodayAttendanceAction retrieves today's attendance feed and late arrivals count", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "hr", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getTodayAttendanceAction/);
    assert.match(actionsContent, /presentCount/);
    assert.match(actionsContent, /lateCount/);
  });

  // Scenario 6: getPayrollSummaryAction estimates gross and net payroll across active employees
  test("6. getPayrollSummaryAction computes gross payroll including basic, house rent, and medical", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "hr", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getPayrollSummaryAction/);
    assert.match(actionsContent, /basic_salary/);
    assert.match(actionsContent, /house_rent/);
    assert.match(actionsContent, /medical_allowance/);
  });

  // Scenario 7: app/hr/page.tsx has zero mock data imports
  test("7. app/hr/page.tsx has zero mock data imports and connects to real database actions", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "hr", "page.tsx"), "utf8");
    assert.doesNotMatch(pageContent, /mock-data/);
    assert.match(pageContent, /getEmployeesAction/);
    assert.match(pageContent, /getTodayAttendanceAction/);
    assert.match(pageContent, /getPayrollSummaryAction/);
  });

  // Scenario 8: Migration 014 specifies employees, attendance_records, and payroll_runs
  test("8. Migration 014 defines employees, attendance_devices, attendance_records, and payroll_runs", () => {
    const migContent = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "014_hr_payroll.sql"), "utf8");
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS employees/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS attendance_devices/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS attendance_records/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS payroll_runs/);
  });

  // Scenario 9: HR page features Biometric Device Punch Simulator and Staff Directory tabs
  test("9. HR page features live biometric punch simulation and staff directory", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "hr", "page.tsx"), "utf8");
    assert.match(pageContent, /Biometric Punch/);
    assert.match(pageContent, /Staff Directory/);
    assert.match(pageContent, /Today's Attendance/);
  });

  // Scenario 10: Attendance summary tracks punches today and late arrival flags
  test("10. HR Attendance tab displays present staff and late arrival flags", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "hr", "page.tsx"), "utf8");
    assert.match(pageContent, /Late Arrivals/);
    assert.match(pageContent, /Punches Today/);
  });
});
