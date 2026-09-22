import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { getDhakaDateString } from "@/lib/datetime";
import {
  EmployeeRecord,
  AttendanceRecordItem,
  PayrollRunRecord,
} from "@/types/hr";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Employees Roster with Department and Designation
 */
export async function getEmployeesAction(): Promise<
  ActionResult<{ employees: EmployeeRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden: hr.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .select(`
        *,
        employee_designations (title),
        departments (name)
      `)
      .eq("organization_id", session.organizationId)
      .order("employee_code", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    interface EmpRow {
      id: string;
      organization_id: string;
      employee_code: string;
      full_name: string;
      department_id?: string | null;
      designation_id?: string | null;
      phone: string;
      email?: string | null;
      joining_date: string;
      biometric_device_pin?: string | null;
      basic_salary: number;
      house_rent: number;
      medical_allowance: number;
      status: "ACTIVE" | "ON_LEAVE" | "TERMINATED" | "RESIGNED";
      created_at?: string;
      departments?: { name: string } | null;
      employee_designations?: { title: string } | null;
    }

    const employees: EmployeeRecord[] = ((data || []) as unknown as EmpRow[]).map((e) => ({
      ...e,
      department: e.departments || undefined,
      designation: e.employee_designations || undefined,
    }));

    return { success: true, data: { employees } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load staff directory";
    return { success: false, error: msg };
  }
}

/**
 * 2. Register New Employee
 */
export async function createEmployeeAction(params: {
  fullName: string;
  phone: string;
  email?: string;
  departmentId?: string;
  designationId?: string;
  basicSalary?: number;
  biometricPin?: string;
  joiningDate?: string;
}): Promise<ActionResult<{ employee: EmployeeRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.manage");
  } catch {
    return { success: false, error: "403 Forbidden: hr.manage required" };
  }

  try {
    const supabase = await createClient();
    const { data: codeData, error: codeErr } = await supabase.rpc("generate_employee_code", {
      p_org_id: session.organizationId,
    });
    if (codeErr || !codeData) {
      return { success: false, error: codeErr?.message || "Failed to generate employee code from database sequence." };
    }
    const employeeCode = codeData as string;

    const { data: emp, error } = await supabase
      .from("employees").insert({
        organization_id: session.organizationId,
        employee_code: employeeCode,
        full_name: params.fullName,
        phone: params.phone,
        email: params.email || null,
        department_id: params.departmentId || null,
        designation_id: params.designationId || null,
        basic_salary: params.basicSalary || 20000.0,
        house_rent: Number(((params.basicSalary || 20000) * 0.4).toFixed(2)),
        medical_allowance: 2000.0,
        biometric_device_pin: params.biometricPin || null,
        joining_date: params.joiningDate || getDhakaDateString(),
        status: "ACTIVE",
      })
      .select()
      .single();

    if (error || !emp) {
      return { success: false, error: error?.message || "Failed to create employee" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "HR",
      entityType: "employee",
      entityId: emp.id,
      newValues: {
        employeeCode,
        fullName: params.fullName,
        phone: params.phone,
      },
    });

    return { success: true, data: { employee: emp as EmployeeRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to register employee";
    return { success: false, error: msg };
  }
}

/**
 * 3. Record Biometric Device Punch (Check-in / Check-out)
 */
export async function recordBiometricPunchAction(params: {
  employeeId: string;
  punchType: "CHECK_IN" | "CHECK_OUT";
  verificationMode?: "FINGERPRINT" | "FACE" | "CARD" | "MANUAL";
  punchTime?: string;
}): Promise<ActionResult<{ punch: AttendanceRecordItem }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden: hr permission required" };
  }

  try {
    const supabase = await createClient();
    const punchDate = params.punchTime ? new Date(params.punchTime) : new Date();

    // Check if check-in is late (past 09:15 AM)
    const isLate =
      params.punchType === "CHECK_IN" &&
      (punchDate.getHours() > 9 || (punchDate.getHours() === 9 && punchDate.getMinutes() > 15));

    const { data: punch, error } = await supabase
      .from("attendance_records").insert({
        organization_id: session.organizationId,
        employee_id: params.employeeId,
        punch_time: punchDate.toISOString(),
        punch_type: params.punchType,
        verification_mode: params.verificationMode || "FINGERPRINT",
        is_late: isLate,
      })
      .select()
      .single();

    if (error || !punch) {
      return { success: false, error: error?.message || "Failed to record punch" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "HR",
      entityType: "attendance_punch",
      entityId: punch.id,
      newValues: {
        employeeId: params.employeeId,
        punchType: params.punchType,
        isLate,
      },
    });

    return { success: true, data: { punch: punch as AttendanceRecordItem } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record biometric punch";
    return { success: false, error: msg };
  }
}

/**
 * 4. Get Today's Attendance Feed
 */
export async function getTodayAttendanceAction(): Promise<
  ActionResult<{ records: AttendanceRecordItem[]; presentCount: number; lateCount: number }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden: hr.view required" };
  }

  try {
    const supabase = await createClient();
    const today = getDhakaDateString();

    const { data, error } = await supabase
      .from("attendance_records")
      .select(`
        *,
        employees (id, employee_code, full_name, phone)
      `)
      .eq("organization_id", session.organizationId)
      .gte("punch_time", `${today}T00:00:00.000Z`)
      .order("punch_time", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    interface AttRow {
      id: string;
      organization_id: string;
      employee_id: string;
      device_id?: string | null;
      punch_time: string;
      punch_type: "CHECK_IN" | "CHECK_OUT";
      verification_mode: "FINGERPRINT" | "FACE" | "CARD" | "MANUAL";
      is_late: boolean;
      created_at?: string;
      employees?: {
        id: string;
        employee_code: string;
        full_name: string;
        phone: string;
      } | null;
    }

    const records: AttendanceRecordItem[] = ((data || []) as unknown as AttRow[]).map((r) => ({
      ...r,
      employee: r.employees || undefined,
    }));

    const uniquePresent = new Set(records.map((r) => r.employee_id));
    const lateCount = records.filter((r) => r.is_late).length;

    return {
      success: true,
      data: {
        records,
        presentCount: uniquePresent.size,
        lateCount,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load today's attendance";
    return { success: false, error: msg };
  }
}

/**
 * 5a. Create Payroll Run — calculates gross, deductions, and net per employee
 */
export async function createPayrollRunAction(params: {
  monthYear: string; // e.g. "2026-09"
}): Promise<ActionResult<{ payrollRun: PayrollRunRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.manage");
  } catch {
    return { success: false, error: "403 Forbidden: hr.manage required" };
  }

  const supabase = await createClient();

  // Guard: prevent duplicate run for same month
  const { data: existing } = await supabase
    .from("payroll_runs")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("month_year", params.monthYear)
    .single();

  if (existing) {
    return { success: false, error: `Payroll run for ${params.monthYear} already exists` };
  }

  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, basic_salary, house_rent, medical_allowance")
    .eq("organization_id", session.organizationId)
    .eq("status", "ACTIVE");

  if (empErr) return { success: false, error: empErr.message };

  let totalGross = 0;
  let totalDeductions = 0;

  const lineItems = (emps || []).map((e) => {
    const gross =
      Number(e.basic_salary || 0) +
      Number(e.house_rent || 0) +
      Number(e.medical_allowance || 0);
    // Standard 5% provident fund deduction — adjust per policy
    const deduction = Number((gross * 0.05).toFixed(2));
    totalGross += gross;
    totalDeductions += deduction;
    return {
      organization_id: session.organizationId as string,
      employee_id: e.id,
      month_year: params.monthYear,
      gross_salary: gross,
      deductions: deduction,
      net_salary: Number((gross - deduction).toFixed(2)),
    };
  });

  const totalNet = Number((totalGross - totalDeductions).toFixed(2));

  const { data: run, error: runErr } = await supabase
    .from("payroll_runs")
    .insert({
      organization_id: session.organizationId,
      month_year: params.monthYear,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      status: "DRAFT",
    })
    .select()
    .single();

  if (runErr) return { success: false, error: runErr.message };

  // Insert per-employee payslip lines
  const payslipLines = lineItems.map((li) => ({
    ...li,
    payroll_run_id: run.id,
  }));

  const { error: lineErr } = await supabase
    .from("payroll_line_items")
    .insert(payslipLines);

  if (lineErr) {
    // Rollback run on line failure
    await supabase.from("payroll_runs").delete().eq("id", run.id);
    return { success: false, error: `Payroll line insert failed: ${lineErr.message}` };
  }

  await recordAuditLog({
    organizationId: session.organizationId,
    userId: session.userId || undefined,
    action: "CREATE",
    module: "HR",
    entityType: "payroll_run",
    entityId: run.id,
    newValues: { month_year: params.monthYear, total_gross: totalGross, total_net: totalNet },
  });

  return { success: true, data: { payrollRun: run as PayrollRunRecord } };
}

/**
 * 5b. Get individual employee payslip for a given month
 */
export async function getPayslipAction(params: {
  employeeId: string;
  monthYear: string;
}): Promise<
  ActionResult<{
    employee: { id: string; full_name: string; employee_code: string };
    monthYear: string;
    grossSalary: number;
    deductions: number;
    netSalary: number;
    payrollRunStatus: string | null;
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const supabase = await createClient();

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .eq("id", params.employeeId)
    .eq("organization_id", session.organizationId)
    .single();

  if (empErr || !emp) return { success: false, error: "Employee not found" };

  const { data: line, error: lineErr } = await supabase
    .from("payroll_line_items")
    .select("*, payroll_runs(status)")
    .eq("employee_id", params.employeeId)
    .eq("month_year", params.monthYear)
    .eq("organization_id", session.organizationId)
    .single();

  if (lineErr || !line) {
    return { success: false, error: `No payslip found for ${params.monthYear}` };
  }

  return {
    success: true,
    data: {
      employee: emp,
      monthYear: params.monthYear,
      grossSalary: Number(line.gross_salary),
      deductions: Number(line.deductions),
      netSalary: Number(line.net_salary),
      payrollRunStatus: (line.payroll_runs as { status: string } | null)?.status ?? null,
    },
  };
}

/**
 * 5c. Get employee leave applications
 */
export async function getEmployeeLeaveAction(params?: {
  employeeId?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
}): Promise<ActionResult<{ leaves: Array<{
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: string;
  approved_by?: string | null;
}> }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const supabase = await createClient();
  let query = supabase
    .from("employee_leaves")
    .select("*")
    .eq("organization_id", session.organizationId);

  if (params?.employeeId) query = query.eq("employee_id", params.employeeId);
  if (params?.status) query = query.eq("status", params.status);

  const { data, error } = await query.order("start_date", { ascending: false }).limit(100);
  if (error) return { success: false, error: error.message };

  return { success: true, data: { leaves: (data || []) as typeof data & Array<{ id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; total_days: number; reason: string; status: string; approved_by?: string | null }> } };
}

/**
 * 5d. Apply for Employee Leave
 */
export async function applyLeaveAction(params: {
  employeeId: string;
  leaveType: "ANNUAL" | "SICK" | "CASUAL" | "MATERNITY" | "UNPAID";
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<ActionResult<{ leaveId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const start = new Date(params.startDate);
  const end = new Date(params.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return { success: false, error: "Invalid date range" };
  }

  const totalDays =
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_leaves")
    .insert({
      organization_id: session.organizationId,
      employee_id: params.employeeId,
      leave_type: params.leaveType,
      start_date: params.startDate,
      end_date: params.endDate,
      total_days: totalDays,
      reason: params.reason,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await recordAuditLog({
    organizationId: session.organizationId,
    userId: session.userId || undefined,
    action: "CREATE",
    module: "HR",
    entityType: "employee_leave",
    entityId: data.id,
    newValues: { employee_id: params.employeeId, leave_type: params.leaveType, total_days: totalDays },
  });

  return { success: true, data: { leaveId: data.id } };
}

/**
 * 5. Get Monthly Payroll Summary
 */
export async function getPayrollSummaryAction(): Promise<
  ActionResult<{
    monthYear: string;
    totalStaff: number;
    estimatedGross: number;
    estimatedNet: number;
    payrollRuns: PayrollRunRecord[];
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("hr.view");
  } catch {
    return { success: false, error: "403 Forbidden: hr.view required" };
  }

  try {
    const supabase = await createClient();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // 1. Fetch active employees to sum salary
    const { data: emps } = await supabase
      .from("employees")
      .select("basic_salary, house_rent, medical_allowance")
      .eq("organization_id", session.organizationId)
      .eq("status", "ACTIVE");

    let totalGross = 0;
    (emps || []).forEach((e) => {
      const gross =
        Number(e.basic_salary || 0) +
        Number(e.house_rent || 0) +
        Number(e.medical_allowance || 0);
      totalGross += gross;
    });

    // 2. Fetch payroll runs
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("month_year", { ascending: false });

    return {
      success: true,
      data: {
        monthYear: currentMonth,
        totalStaff: (emps || []).length,
        estimatedGross: totalGross,
        estimatedNet: Number((totalGross * 0.95).toFixed(2)),
        payrollRuns: (runs || []) as PayrollRunRecord[],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to calculate payroll";
    return { success: false, error: msg };
  }
}
