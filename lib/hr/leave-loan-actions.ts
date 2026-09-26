"use client";

import { createClient } from "@/lib/supabase/client";

export interface EmployeeLeave {
  id: string;
  employee_id: string;
  leave_type: "CASUAL" | "SICK" | "EARNED" | "MATERNITY" | "UNPAID";
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  created_at: string;
  employees?: {
    id: string;
    first_name: string;
    last_name: string;
    employee_code: string;
    department: string;
  };
}

export interface EmployeeLoan {
  id: string;
  loan_number: string;
  employee_id: string;
  principal_amount: number;
  monthly_installment: number;
  repaid_amount: number;
  status: "PENDING" | "ACTIVE" | "SETTLED" | "DEFAULTED";
  disbursed_at: string | null;
  created_at: string;
  employees?: {
    id: string;
    first_name: string;
    last_name: string;
    employee_code: string;
  };
}

export async function getLeaveApplicationsAction(): Promise<{
  success: boolean;
  data?: EmployeeLeave[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("employee_leave_applications")
      .select(`
        *,
        employees (id, first_name, last_name, employee_code, department)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as EmployeeLeave[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load leave applications";
    return { success: false, error: msg };
  }
}

export async function getEmployeeLoansAction(): Promise<{
  success: boolean;
  data?: EmployeeLoan[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("employee_loans")
      .select(`
        *,
        employees (id, first_name, last_name, employee_code)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as EmployeeLoan[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load employee loans";
    return { success: false, error: msg };
  }
}

export async function reviewLeaveApplicationAction(params: {
  application_id: string;
  status: "APPROVED" | "REJECTED";
  rejection_reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data: userProfile } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("employee_leave_applications")
      .update({
        status: params.status,
        approved_by: userProfile?.user?.id || null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: params.rejection_reason?.trim() || null,
      })
      .eq("id", params.application_id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to review leave application";
    return { success: false, error: msg };
  }
}
