import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { reportSystemRuntimeIncident } from "@/lib/diagnostics/troubleshooter";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ExpenseCategoryRecord {
  id: string;
  organization_id: string;
  name: string;
  category_code?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface ExpenseRecord {
  id: string;
  organization_id: string;
  category_id: string;
  title: string;
  amount: number;
  voucher_number?: string;
  paid_to: string;
  expense_date: string;
  payment_method: string;
  payment_reference?: string;
  expense_type: string;
  doctor_id?: string;
  duty_shift?: string;
  department?: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "PAID" | "VOID" | "VOIDED";
  due_amount: number;
  notes?: string;
  created_at: string;
  category?: {
    id: string;
    name: string;
    category_code?: string;
  };
  doctor?: {
    id: string;
    full_name: string;
    designation?: string;
    specialization?: string;
    bmdc_reg_number?: string;
  };
}

export interface ExpenseAnalyticsSummary {
  total_expense_amount: number;
  expense_count: number;
  doctor_expense_total: number;
  ot_expense_total: number;
  utility_expense_total: number;
  cash_paid_total: number;
  bank_paid_total: number;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  { category_code: "EXP-DOC", name: "Doctor Consultation & Honorarium" },
  { category_code: "EXP-OT", name: "OT & Surgical Consumables" },
  { category_code: "EXP-PHARM", name: "Pharmacy & Medicine Inventory" },
  { category_code: "EXP-LAB", name: "Diagnostic Reagents & Lab Kits" },
];

async function reportExpenseReadFailure(params: {
  organizationId: string;
  operation: string;
  location: string;
  errorCode: string;
  reason: string;
}): Promise<void> {
  try {
    await reportSystemRuntimeIncident({
      organizationId: params.organizationId,
      module: "ACCOUNTING_EXPENSES",
      location: params.location,
      severity: "WARNING",
      errorCode: params.errorCode,
      title: "Expense data could not be loaded",
      reason: params.reason,
      recommendation: "Verify the current session and organization, Supabase availability, read permissions, and the relevant query/schema. Retry after checking whether the issue persists.",
      details: {
        operation: params.operation,
        occurred_at: new Date().toISOString(),
      },
    });
  } catch (reportError: unknown) {
    console.error("[ExpenseRead] Diagnostic reporting also failed:", reportError instanceof Error ? reportError.message : "Unknown incident error");
  }
}


/**
 * 1. Fetch Expense Categories for Active Organization
 */
export async function getExpenseCategoriesAction(): Promise<
  ActionResult<{ categories: ExpenseCategoryRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { categories: (data || []) as ExpenseCategoryRecord[] } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error loading expense categories",
    };
  }
}

/**
 * 2. Create or Update an Expense Category
 */
export async function saveExpenseCategoryAction(params: {
  id?: string;
  name: string;
  categoryCode?: string;
  description?: string;
}): Promise<ActionResult<{ category: ExpenseCategoryRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("accounting.manage");
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "403 Forbidden: accounting.manage required",
    };
  }

  if (!params.name || params.name.trim().length < 2) {
    return { success: false, error: "Category name must be at least 2 characters." };
  }

  try {
    const supabase = await createClient();
    const payload = {
      organization_id: session.organizationId,
      name: params.name.trim(),
      category_code: params.categoryCode ? params.categoryCode.trim().toUpperCase() : null,
      description: params.description?.trim() || null,
      is_active: true,
    };

    let result;
    if (params.id) {
      result = await supabase
        .from("expense_categories")
        .update(payload)
        .eq("id", params.id)
        .eq("organization_id", session.organizationId)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("expense_categories")
        .insert(payload)
        .select("*")
        .single();
    }

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, data: { category: result.data as ExpenseCategoryRecord } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error saving expense category",
    };
  }
}

/**
 * 3. Fetch Hospital Expenses with Filters
 */
export async function getExpensesAction(params?: {
  categoryId?: string;
  doctorId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  limit?: number;
}): Promise<ActionResult<{ expenses: ExpenseRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("expenses")
      .select(`
        *,
        category:expense_categories (id, name, category_code),
        doctor:doctors (id, full_name, designation, specialization, bmdc_reg_number)
      `)
      .eq("organization_id", session.organizationId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(params?.limit || 100);

    if (params?.categoryId && params.categoryId !== "ALL") {
      query = query.eq("category_id", params.categoryId);
    }
    if (params?.doctorId && params.doctorId !== "ALL") {
      query = query.eq("doctor_id", params.doctorId);
    }
    if (params?.status === "ACTIVE") {
      query = query.not("status", "in", '("VOID","VOIDED")');
    } else if (params?.status === "VOIDED") {
      query = query.in("status", ["VOID", "VOIDED"]);
    } else if (params?.status && params.status !== "ALL") {
      query = query.eq("status", params.status);
    }
    if (params?.startDate) {
      query = query.gte("expense_date", params.startDate);
    }
    if (params?.endDate) {
      query = query.lte("expense_date", params.endDate);
    }

    const { data, error } = await query;
    if (error) {
      await reportExpenseReadFailure({
        organizationId: session.organizationId,
        operation: "READ_EXPENSE_VOUCHERS",
        location: "lib/expenses/actions.ts:getExpensesAction -> public.expenses SELECT",
        errorCode: error.code || "EXPENSE_LIST_QUERY_FAILED",
        reason: "Expense voucher query failed (" + (error.code || "UNKNOWN") + "): " + error.message,
      });
      return { success: false, error: error.message };
    }

    return { success: true, data: { expenses: (data || []) as unknown as ExpenseRecord[] } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error loading expenses";
    await reportExpenseReadFailure({
      organizationId: session.organizationId,
      operation: "READ_EXPENSE_VOUCHERS",
      location: "lib/expenses/actions.ts:getExpensesAction",
      errorCode: "EXPENSE_LIST_UNEXPECTED_EXCEPTION",
      reason: message,
    });
    return { success: false, error: message };
  }
}

/**
 * 4. Record New Hospital Expense & Post GL Atomically
 */
export async function createExpenseAction(params: {
  categoryId: string;
  title: string;
  amount: number;
  paymentMethod?: string;
  paymentReference?: string;
  paidTo?: string;
  expenseDate?: string;
  expenseType?: string;
  doctorId?: string;
  dutyShift?: string;
  department?: string;
  notes?: string;
}): Promise<ActionResult<{ expenseId: string; voucherNumber: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("accounting.post");
  } catch {
    try {
      await requirePermission("billing.create");
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "403 Forbidden: accounting.post or billing.create required",
      };
    }
  }

  if (!params.title || params.title.trim().length < 2) {
    return { success: false, error: "Expense description is required." };
  }
  if (
    !Number.isFinite(params.amount) ||
    params.amount <= 0 ||
    Math.round(params.amount * 100) !== params.amount * 100
  ) {
    return { success: false, error: "Expense amount must be greater than zero and have at most two decimal places." };
  }
  if (!params.categoryId) {
    return { success: false, error: "Please select an expense category." };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("record_hospital_expense_atomic", {
      p_org_id: session.organizationId,
      p_category_id: params.categoryId,
      p_title: params.title.trim(),
      p_amount: params.amount,
      p_payment_method: params.paymentMethod || "CASH",
      p_payment_reference: params.paymentReference?.trim() || null,
      p_paid_to: params.paidTo?.trim() || "Vendor / Payee",
      p_expense_date: params.expenseDate || new Date().toISOString().split("T")[0],
      p_expense_type: params.expenseType || "GENERAL",
      p_doctor_id: params.doctorId || null,
      p_duty_shift: params.dutyShift || null,
      p_department: params.department || null,
      p_notes: params.notes?.trim() || null,
      p_created_by: session.userId,
    });

    if (error) {
      const errorCode = error.code || "EXPENSE_CREATE_RPC_FAILED";
      try {
        await reportSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "ACCOUNTING_EXPENSES",
          location: "lib/expenses/actions.ts:createExpenseAction -> public.record_hospital_expense_atomic",
          severity: "CRITICAL",
          errorCode,
          title: "Expense voucher creation failed",
          reason: "Database rejected expense voucher creation (" + errorCode + "): " + (error.message || "No database error details returned."),
          recommendation: "Check the category and organization, active expense/cash/bank accounts, journal constraints and database migration state. If the response was lost, check voucher history before retrying.",
          details: {
            operation: "CREATE_EXPENSE_VOUCHER",
            rpc_name: "record_hospital_expense_atomic",
            occurred_at: new Date().toISOString(),
          },
        });
      } catch (reportError: unknown) {
        console.error("[ExpenseCreate] Could not persist the failure incident:", reportError instanceof Error ? reportError.message : "Unknown incident error");
      }
      return {
        success: false,
        error: "Expense voucher was not confirmed as created (" + errorCode + "). Check voucher history before retrying. " + error.message,
      };
    }

    const res = data && typeof data === "object" && !Array.isArray(data)
      ? data as {
          success?: unknown;
          expense_id?: unknown;
          voucher_number?: unknown;
          journal_entry_id?: unknown;
          journal_entry_number?: unknown;
        }
      : null;

    const validCreation = Boolean(
      res &&
      res.success === true &&
      typeof res.expense_id === "string" &&
      res.expense_id.length > 0 &&
      typeof res.voucher_number === "string" &&
      res.voucher_number.length > 0 &&
      typeof res.journal_entry_id === "string" &&
      res.journal_entry_id.length > 0
    );

    if (!validCreation || !res) {
      const reason = res && typeof res.success === "boolean" && res.success === false
        ? "The database RPC returned a business failure."
        : "The database RPC did not return a confirmed expense ID, voucher number and linked journal ID.";
      try {
        await reportSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "ACCOUNTING_EXPENSES",
          location: "lib/expenses/actions.ts:createExpenseAction -> public.record_hospital_expense_atomic response validation",
          severity: "CRITICAL",
          errorCode: "EXPENSE_CREATE_NOT_CONFIRMED",
          title: "Expense voucher creation was not confirmed",
          reason,
          recommendation: "Inspect the database transaction and recent voucher/journal records before retrying. Do not assume an invalid RPC response means no write occurred.",
          details: {
            operation: "CREATE_EXPENSE_VOUCHER",
            rpc_name: "record_hospital_expense_atomic",
            occurred_at: new Date().toISOString(),
          },
        });
      } catch (reportError: unknown) {
        console.error("[ExpenseCreate] Could not persist the response validation incident:", reportError instanceof Error ? reportError.message : "Unknown incident error");
      }

      return {
        success: false,
        error: "The database did not confirm the expense and its GL journal link. Refresh voucher history and verify whether a voucher was created before retrying.",
      };
    }

    let auditWarning: string | undefined;
    try {
      await recordAuditLog({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "CREATE",
        module: "ACCOUNTING",
        entityType: "expenses",
        entityId: res.expense_id,
        newValues: {
          title: params.title.trim(),
          amount: params.amount,
          voucher_number: res.voucher_number,
          journal_entry_id: res.journal_entry_id,
          payment_method: params.paymentMethod || "CASH",
          doctor_id: params.doctorId || null,
        },
      });
    } catch (auditError: unknown) {
      auditWarning = "Voucher and GL journal were created, but the application audit log could not be confirmed. Do not retry the creation; refresh history and contact an administrator.";
      try {
        await reportSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "ACCOUNTING_EXPENSES",
          location: "lib/expenses/actions.ts:createExpenseAction -> recordAuditLog",
          severity: "CRITICAL",
          errorCode: "EXPENSE_CREATE_AUDIT_LOG_FAILED",
          title: "Expense created but audit logging failed",
          reason: auditError instanceof Error ? auditError.message : "Unknown audit logging error",
          recommendation: "Verify the durable expense/journal linkage and repair the audit log without creating another expense.",
          details: {
            operation: "CREATE_EXPENSE_VOUCHER_AUDIT",
            expense_id: res.expense_id,
            rpc_name: "record_hospital_expense_atomic",
            occurred_at: new Date().toISOString(),
          },
        });
      } catch (reportError: unknown) {
        console.error("[ExpenseCreate] Audit warning incident could not be persisted:", reportError instanceof Error ? reportError.message : "Unknown incident error");
      }
    }

    return {
      success: true,
      data: {
        expenseId: res.expense_id,
        voucherNumber: res.voucher_number,
      },
      ...(auditWarning ? { error: auditWarning } : {}),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error creating expense voucher",
    };
  }
}

/**
 * 5. Get Expense Analytics Summary
 */
export async function getExpenseAnalyticsAction(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ActionResult<{ summary: ExpenseAnalyticsSummary }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    // Query active expenses directly for mathematically guaranteed reconciliation
    let query = supabase
      .from("expenses")
      .select("amount, expense_type, payment_method, status")
      .eq("organization_id", session.organizationId)
      .not("status", "in", '("VOID","VOIDED")');

    if (params?.startDate) {
      query = query.gte("expense_date", params.startDate);
    }
    if (params?.endDate) {
      query = query.lte("expense_date", params.endDate);
    }

    const { data: expRows, error: expErr } = await query;
    if (expErr) {
      await reportExpenseReadFailure({
        organizationId: session.organizationId,
        operation: "READ_EXPENSE_ANALYTICS",
        location: "lib/expenses/actions.ts:getExpenseAnalyticsAction -> public.expenses SELECT",
        errorCode: expErr.code || "EXPENSE_ANALYTICS_QUERY_FAILED",
        reason: "Expense analytics query failed (" + (expErr.code || "UNKNOWN") + "): " + expErr.message,
      });
      return { success: false, error: expErr.message };
    }

    const rows = expRows || [];
    let totalAmount = 0;
    let doctorTotal = 0;
    let otTotal = 0;
    let utilityTotal = 0;
    let cashTotal = 0;
    let bankTotal = 0;

    for (const r of rows) {
      const amt = Number(r.amount || 0);
      totalAmount += amt;
      const type = (r.expense_type || "").toUpperCase();
      if (type.includes("DOCTOR") || type.includes("HONORARIUM") || type.includes("SURGEON") || type.includes("ANAESTHETIST")) {
        doctorTotal += amt;
      } else if (type.includes("OT") || type.includes("SURGERY")) {
        otTotal += amt;
      } else if (type.includes("UTILITY") || type.includes("BILL")) {
        utilityTotal += amt;
      }

      const pMethod = (r.payment_method || "").toUpperCase();
      if (pMethod === "CASH") {
        cashTotal += amt;
      } else {
        bankTotal += amt;
      }
    }

    const summary: ExpenseAnalyticsSummary = {
      total_expense_amount: totalAmount,
      expense_count: rows.length,
      doctor_expense_total: doctorTotal,
      ot_expense_total: otTotal,
      utility_expense_total: utilityTotal,
      cash_paid_total: cashTotal,
      bank_paid_total: bankTotal,
    };

    return { success: true, data: { summary } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown expense analytics exception";
    await reportExpenseReadFailure({
      organizationId: session.organizationId,
      operation: "READ_EXPENSE_ANALYTICS",
      location: "lib/expenses/actions.ts:getExpenseAnalyticsAction",
      errorCode: "EXPENSE_ANALYTICS_UNEXPECTED_EXCEPTION",
      reason: message,
    });
    return { success: false, error: message };
  }
}

/**
 * 6. Void an Expense Voucher (Atomic GL Reversal)
 */
export async function voidExpenseAction(
  expenseId: string,
  voidReason: string,
  fundsRecoveredConfirmed = false
): Promise<ActionResult<{ success: boolean; status: string }>> {
  const session = await getCurrentUserSession(true);
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: active hospital session required." };
  }

  try {
    await requirePermission("accounting.manage");
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "403 Forbidden: accounting.manage required",
    };
  }

  if (!expenseId?.trim() || !voidReason?.trim() || voidReason.trim().length < 4) {
    return { success: false, error: "A valid voucher and void reason (at least 4 characters) are required." };
  }

  const reportVoidFailure = async (errorCode: string, reason: string): Promise<void> => {
    try {
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId as string,
        module: "ACCOUNTING_EXPENSES",
        location: "lib/expenses/actions.ts:voidExpenseAction -> public.void_hospital_expense_atomic",
        severity: "CRITICAL",
        errorCode,
        title: "Expense voucher void failed",
        reason,
        recommendation: "Review the voucher state, accounting permission, linked journal and RPC response. Preserve posted accounting history; retry only after the root cause has been corrected.",
        details: {
          expense_id: expenseId,
          operation: "VOID_EXPENSE_VOUCHER",
          rpc_name: "void_hospital_expense_atomic",
          occurred_at: new Date().toISOString(),
        },
      });
    } catch (reportError: unknown) {
      // Reporting must never mask the original voucher error returned to the user.
      console.error("[ExpenseVoid] Incident reporting also failed:", reportError instanceof Error ? reportError.message : "Unknown incident error");
    }
  };

  try {
    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc("void_hospital_expense_atomic", {
      p_org_id: session.organizationId,
      p_expense_id: expenseId,
      p_void_reason: voidReason.trim(),
      p_voided_by: session.userId,
      p_funds_recovered: fundsRecoveredConfirmed,
    });

    if (rpcError) {
      const errorCode = rpcError.code || "EXPENSE_VOID_RPC_ERROR";
      const reason = "Database RPC failed (" + errorCode + "): " + (rpcError.message || "No database error details returned.");
      await reportVoidFailure(errorCode, reason);
      return {
        success: false,
        error: "Voucher void failed [" + errorCode + "]. System diagnostics has been notified. " +
          (rpcError.message || "Please contact the system administrator."),
      };
    }

    const rpcResult = data && typeof data === "object" && !Array.isArray(data)
      ? data as { success?: unknown; error?: unknown; error_code?: unknown; message?: unknown; status?: unknown }
      : null;

    // PostgREST may return { success:false } as valid data while the transport error is null.
    if (!rpcResult || rpcResult.success !== true) {
      const reason = typeof rpcResult?.error === "string"
        ? rpcResult.error
        : typeof rpcResult?.message === "string"
          ? rpcResult.message
          : "The database did not confirm that this voucher was voided.";
      const errorCode = typeof rpcResult?.error_code === "string"
        ? rpcResult.error_code
        : "EXPENSE_VOID_NOT_CONFIRMED";

      // Missing confirmation is an expected business guard, not a system fault.
      // The UI prevents this case; this server-side check protects direct RPC callers too.
      if (errorCode !== "EXPENSE_VOID_FUNDS_NOT_CONFIRMED") {
        await reportVoidFailure(errorCode, reason);
      }

      return {
        success: false,
        error: "Voucher was not voided. " + reason +
          (errorCode === "EXPENSE_VOID_FUNDS_NOT_CONFIRMED"
            ? ""
            : " The incident was sent to system diagnostics."),
      };
    }

    // Read-after-write verification is required before displaying a success state.
    const { data: persistedExpense, error: verifyError } = await supabase
      .from("expenses")
      .select("id, status, void_reason")
      .eq("id", expenseId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (
      verifyError ||
      !persistedExpense ||
      !["VOID", "VOIDED"].includes(String(persistedExpense.status || "").toUpperCase())
    ) {
      const reason = verifyError
        ? "RPC returned success but voucher status verification failed (" + (verifyError.code || "DB_READ_ERROR") + "): " + verifyError.message
        : "RPC returned success but persisted voucher status is not VOID or VOIDED.";
      await reportVoidFailure("EXPENSE_VOID_POSTCONDITION_FAILED", reason);
      return {
        success: false,
        error: "Voucher status could not be verified in the database. It has not been reported as successful; review the system alert before retrying.",
      };
    }

    try {
      await recordAuditLog({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "VOID",
        module: "ACCOUNTING",
        entityType: "expenses",
        entityId: expenseId,
        newValues: {
          status: persistedExpense.status,
          void_reason: voidReason.trim(),
          funds_not_disbursed_or_recovered_confirmed: fundsRecoveredConfirmed,
        },
      });
    } catch (auditError: unknown) {
      const message = auditError instanceof Error ? auditError.message : "Unknown audit log exception";
      await reportVoidFailure("EXPENSE_VOID_AUDIT_LOG_FAILED", message);
      // The voucher has already been voided and verified; do not invite a duplicate retry.
      return {
        success: true,
        data: { success: true, status: String(persistedExpense.status) },
        error: "Voucher was voided and verified, but writing its application audit entry failed. A system alert was raised; contact an administrator.",
      };
    }

    return {
      success: true,
      data: { success: true, status: String(persistedExpense.status) },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown expense void exception";
    await reportVoidFailure("EXPENSE_VOID_UNEXPECTED_EXCEPTION", message);
    return {
      success: false,
      error: "Unexpected error while voiding the voucher. System diagnostics has been notified; refresh and review its status before retrying.",
    };
  }
}

/**
 * 7. Update an Unposted or Draft Expense
 */
export async function updateExpenseAction(params: {
  expenseId: string;
  title?: string;
  amount?: number;
  paidTo?: string;
  notes?: string;
  categoryId?: string;
  paymentMethod?: string;
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("accounting.manage");
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "403 Forbidden: accounting.manage required",
    };
  }

  if (!params.expenseId?.trim()) {
    return { success: false, error: "A valid expense voucher ID is required." };
  }
  if (params.amount !== undefined && (
    !Number.isFinite(params.amount) ||
    params.amount <= 0 ||
    Math.round(params.amount * 100) !== params.amount * 100
  )) {
    return { success: false, error: "Expense amount must be positive and have at most two decimal places." };
  }

  const reportUpdateFailure = async (errorCode: string, location: string, reason: string) => {
    try {
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId as string,
        module: "ACCOUNTING_EXPENSES",
        location,
        severity: "CRITICAL",
        errorCode,
        title: "Expense voucher update failed",
        reason,
        recommendation: "Inspect the voucher's current status, linked journal, tenant scope and database constraints. Do not retry until the persisted voucher state has been checked.",
        details: {
          operation: "UPDATE_EXPENSE_VOUCHER",
          expense_id: params.expenseId,
          occurred_at: new Date().toISOString(),
        },
      });
    } catch (reportError: unknown) {
      console.error("[ExpenseUpdate] Could not persist incident:", reportError instanceof Error ? reportError.message : "Unknown incident error");
    }
  };

  try {
    const supabase = await createClient();
    const { data: exp, error: fetchError } = await supabase
      .from("expenses")
      .select("id, status, title, amount, paid_to, category_id, payment_method, journal_entry_id")
      .eq("id", params.expenseId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (fetchError || !exp) {
      const message = fetchError
        ? "Could not read voucher before editing (" + (fetchError.code || "DB_READ_ERROR") + "): " + fetchError.message
        : "Expense voucher was not found in the active organization.";
      await reportUpdateFailure("EXPENSE_UPDATE_LOOKUP_FAILED", "lib/expenses/actions.ts:updateExpenseAction -> public.expenses SELECT", message);
      return { success: false, error: message };
    }

    const status = String(exp.status || "").toUpperCase();
    if (status === "VOID" || status === "VOIDED") {
      return { success: false, error: "Cannot edit a voided expense voucher." };
    }

    const requested = {
      title: params.title !== undefined ? params.title.trim() : exp.title,
      amount: params.amount !== undefined ? params.amount : Number(exp.amount),
      paidTo: params.paidTo !== undefined ? params.paidTo.trim() : exp.paid_to,
      categoryId: params.categoryId !== undefined ? params.categoryId : exp.category_id,
      paymentMethod: params.paymentMethod !== undefined ? params.paymentMethod : exp.payment_method,
    };
    if (requested.title.length < 2) {
      return { success: false, error: "Expense title must be at least 2 characters." };
    }

    const financialChanges =
      requested.title !== exp.title ||
      Number(requested.amount) !== Number(exp.amount) ||
      requested.paidTo !== exp.paid_to ||
      requested.categoryId !== exp.category_id ||
      requested.paymentMethod !== exp.payment_method;

    // The creation RPC posts the voucher and an immediate cash/bank journal together.
    // Editing these values without a reversal would desynchronize source transaction and GL.
    const isPostedOrLinked =
      ["POSTED", "PAID", "REVERSED"].includes(status) ||
      Boolean(exp.journal_entry_id);

    if (isPostedOrLinked && financialChanges) {
      return {
        success: false,
        error: "This voucher is posted or linked to a journal and cannot have its title, amount, payee, category or payment method edited directly. Use the authorized void/reversal workflow (confirm funds were not paid or were returned), then create a corrected voucher. Notes-only edits are allowed.",
      };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (params.title !== undefined) updates.title = requested.title;
    if (params.amount !== undefined) updates.amount = requested.amount;
    if (params.paidTo !== undefined) updates.paid_to = requested.paidTo || exp.paid_to;
    if (params.notes !== undefined) updates.notes = params.notes.trim() || null;
    if (params.categoryId !== undefined) updates.category_id = requested.categoryId;
    if (params.paymentMethod !== undefined) updates.payment_method = requested.paymentMethod;

    const { data: updated, error: updateError } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", params.expenseId)
      .eq("organization_id", session.organizationId)
      .select("id, status, title, amount")
      .maybeSingle();

    if (updateError || !updated) {
      const message = updateError
        ? "Voucher update failed (" + (updateError.code || "DB_UPDATE_ERROR") + "): " + updateError.message
        : "Voucher update did not confirm an affected row.";
      await reportUpdateFailure("EXPENSE_UPDATE_WRITE_FAILED", "lib/expenses/actions.ts:updateExpenseAction -> public.expenses UPDATE", message);
      return { success: false, error: message };
    }

    try {
      await recordAuditLog({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "UPDATE",
        module: "ACCOUNTING",
        entityType: "expenses",
        entityId: params.expenseId,
        oldValues: { title: exp.title, amount: exp.amount, paid_to: exp.paid_to, category_id: exp.category_id, payment_method: exp.payment_method },
        newValues: updates,
      });
    } catch (auditError: unknown) {
      const message = auditError instanceof Error ? auditError.message : "Unknown audit log error";
      await reportUpdateFailure("EXPENSE_UPDATE_AUDIT_LOG_FAILED", "lib/expenses/actions.ts:updateExpenseAction -> recordAuditLog", message);
      return {
        success: true,
        data: { success: true },
        error: "Voucher changes were saved, but the application audit log failed. Do not retry this update; contact an administrator.",
      };
    }

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown expense update exception";
    await reportUpdateFailure("EXPENSE_UPDATE_UNEXPECTED_EXCEPTION", "lib/expenses/actions.ts:updateExpenseAction", message);
    return { success: false, error: "Unexpected error while updating the expense voucher. System diagnostics has been notified." };
  }
}

/**
 * 8. Archive or Toggle Expense Category
 */
export async function archiveExpenseCategoryAction(
  categoryId: string,
  isActive: boolean
): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("accounting.manage");
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "403 Forbidden: accounting.manage required",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", categoryId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "ACCOUNTING",
      entityType: "expense_categories",
      entityId: categoryId,
      newValues: { is_active: isActive },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error updating category status",
    };
  }
}

/**
 * 9. Idempotent Monthly Recurring Expenses Generator
 * Generates monthly retainers without creating duplicate entries for the same month
 */
export async function generateMonthlyRecurringExpensesAction(
  targetMonthDate?: string
): Promise<ActionResult<{ generatedCount: number; skippedCount: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("accounting.manage");
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "403 Forbidden: accounting.manage required",
    };
  }

  const effectiveDate = targetMonthDate || new Date().toISOString().split("T")[0];
  const monthStart = effectiveDate.substring(0, 7) + "-01";

  try {
    const supabase = await createClient();

    // 1. Get active categories
    const { data: categories } = await supabase
      .from("expense_categories")
      .select("id, name, category_code")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true);

    const docCategory = categories?.find(
      (c) => c.category_code === "DOCTOR_EXPENSE" || c.name.toLowerCase().includes("doctor")
    );

    if (!docCategory) {
      return { success: true, data: { generatedCount: 0, skippedCount: 0 } };
    }

    // 2. Fetch doctors with monthly retainer configured
    const { data: doctors } = await supabase
      .from("doctors")
      .select("id, full_name")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true);

    let generatedCount = 0;
    let skippedCount = 0;

    for (const doc of doctors || []) {
      // Check if monthly expense already exists for this doctor in this month
      const { data: existing } = await supabase
        .from("expenses")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("doctor_id", doc.id)
        .eq("expense_type", "MONTHLY_RETAINER")
        .gte("expense_date", monthStart)
        .lte("expense_date", effectiveDate)
        .neq("status", "VOIDED")
        .limit(1);

      if (existing && existing.length > 0) {
        skippedCount++;
        continue;
      }

      // Check previous monthly retainer amount for this doctor
      const { data: prevRetainer } = await supabase
        .from("expenses")
        .select("amount")
        .eq("organization_id", session.organizationId)
        .eq("doctor_id", doc.id)
        .eq("expense_type", "MONTHLY_RETAINER")
        .neq("status", "VOIDED")
        .order("expense_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const retainerAmount = prevRetainer?.amount ? Number(prevRetainer.amount) : 0;
      if (retainerAmount > 0) {
        const monthName = new Date(effectiveDate).toLocaleString("default", { month: "long", year: "numeric" });
        const createRes = await createExpenseAction({
          categoryId: docCategory.id,
          title: `Monthly Retainer: ${doc.full_name} (${monthName})`,
          amount: retainerAmount,
          paymentMethod: "BANK_TRANSFER",
          paidTo: doc.full_name,
          expenseDate: effectiveDate,
          expenseType: "MONTHLY_RETAINER",
          doctorId: doc.id,
          notes: `Automated recurring monthly retainer voucher for ${doc.full_name}`,
        });
        if (createRes.success) {
          generatedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    return { success: true, data: { generatedCount, skippedCount } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error generating monthly recurring expenses",
    };
  }
}
