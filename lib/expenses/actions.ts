import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";

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
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "PAID" | "VOID";
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
    if (params?.status && params.status !== "ALL") {
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
      return { success: false, error: error.message };
    }

    return { success: true, data: { expenses: (data || []) as unknown as ExpenseRecord[] } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error loading expenses",
    };
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
  if (!params.amount || params.amount <= 0) {
    return { success: false, error: "Expense amount must be greater than zero." };
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
      return { success: false, error: error.message };
    }

    const res = data as {
      success: boolean;
      expense_id: string;
      voucher_number: string;
      gl_result?: unknown;
    };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "ACCOUNTING",
      entityType: "expenses",
      entityId: res.expense_id,
      newValues: {
        title: params.title,
        amount: params.amount,
        voucher_number: res.voucher_number,
        payment_method: params.paymentMethod,
        doctor_id: params.doctorId,
      },
    });

    return {
      success: true,
      data: {
        expenseId: res.expense_id,
        voucherNumber: res.voucher_number,
      },
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
    const { data, error } = await supabase.rpc("get_expense_analytics_summary", {
      p_org_id: session.organizationId,
      p_start_date: params?.startDate || null,
      p_end_date: params?.endDate || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const summary: ExpenseAnalyticsSummary = {
      total_expense_amount: Number(row?.total_expense_amount || 0),
      expense_count: Number(row?.expense_count || 0),
      doctor_expense_total: Number(row?.doctor_expense_total || 0),
      ot_expense_total: Number(row?.ot_expense_total || 0),
      utility_expense_total: Number(row?.utility_expense_total || 0),
      cash_paid_total: Number(row?.cash_paid_total || 0),
      bank_paid_total: Number(row?.bank_paid_total || 0),
    };

    return { success: true, data: { summary } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error loading expense analytics",
    };
  }
}

/**
 * 6. Void an Expense Voucher
 */
export async function voidExpenseAction(
  expenseId: string,
  voidReason: string
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

  if (!voidReason || voidReason.trim().length < 4) {
    return { success: false, error: "A valid void reason (at least 4 characters) is required." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("expenses")
      .update({
        status: "VOID",
        void_reason: voidReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "VOID",
      module: "ACCOUNTING",
      entityType: "expenses",
      entityId: expenseId,
      newValues: {
        status: "VOID",
        void_reason: voidReason.trim(),
      },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error voiding expense voucher",
    };
  }
}
