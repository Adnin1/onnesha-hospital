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

    if (!data || data.length === 0) {
      const defaultCategories = [
        {
          organization_id: session.organizationId,
          name: "Doctor Consultation & Honorarium",
          category_code: "EXP-DOC",
          description: "Visiting specialist fees, surgeon share, and clinical honorarium",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "OT & Surgical Consumables",
          category_code: "EXP-OT",
          description: "Operation theater sterile packs, anesthesia gas, suture, surgical consumables",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "Pharmacy & Medicine Inventory",
          category_code: "EXP-PHARM",
          description: "Direct pharmaceutical stock purchase and wholesale supplies",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "Staff & Nursing Honorarium",
          category_code: "EXP-NURSE",
          description: "Shift allowances, nursing overtime, and clinical support honorarium",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "Diagnostic Reagents & Lab Kits",
          category_code: "EXP-LAB",
          description: "Biochemistry reagents, control sera, test tubes, and blood bank bags",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "Hospital Utilities & Energy",
          category_code: "EXP-UTIL",
          description: "Electricity, generator fuel, medical oxygen, and municipal water",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "Biomedical Maintenance & Repair",
          category_code: "EXP-MAINT",
          description: "Equipment calibration, spare parts, radiology servicing",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          name: "General Administration & Office",
          category_code: "EXP-ADMIN",
          description: "Office supplies, printing, internet, software licensing",
          is_active: true,
        },
      ];

      const { data: inserted, error: insertError } = await supabase
        .from("expense_categories")
        .insert(defaultCategories)
        .select("*");

      if (!insertError && inserted && inserted.length > 0) {
        return { success: true, data: { categories: inserted as ExpenseCategoryRecord[] } };
      }
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
 * 6. Void an Expense Voucher (Atomic GL Reversal)
 */
export async function voidExpenseAction(
  expenseId: string,
  voidReason: string
): Promise<ActionResult<{ success: boolean; status: string }>> {
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
    const { data: _rpcRes, error: rpcErr } = await supabase.rpc("void_hospital_expense_atomic", {
      p_org_id: session.organizationId,
      p_expense_id: expenseId,
      p_void_reason: voidReason.trim(),
      p_voided_by: session.userId,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to void expense voucher." };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "VOID",
      module: "ACCOUNTING",
      entityType: "expenses",
      entityId: expenseId,
      newValues: {
        status: "VOIDED",
        void_reason: voidReason.trim(),
      },
    });

    return { success: true, data: { success: true, status: "VOIDED" } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error voiding expense voucher",
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

  try {
    const supabase = await createClient();

    // Check expense exists and is not voided
    const { data: exp, error: fetchErr } = await supabase
      .from("expenses")
      .select("id, status, title, amount")
      .eq("id", params.expenseId)
      .eq("organization_id", session.organizationId)
      .single();

    if (fetchErr || !exp) {
      return { success: false, error: "Expense voucher not found." };
    }

    if (exp.status === "VOID" || exp.status === "VOIDED") {
      return { success: false, error: "Cannot edit a voided expense voucher." };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (params.title && params.title.trim()) updates.title = params.title.trim();
    if (params.amount !== undefined && params.amount > 0) updates.amount = params.amount;
    if (params.paidTo && params.paidTo.trim()) updates.paid_to = params.paidTo.trim();
    if (params.notes !== undefined) updates.notes = params.notes.trim() || null;
    if (params.categoryId) updates.category_id = params.categoryId;
    if (params.paymentMethod) updates.payment_method = params.paymentMethod;

    const { error: updateErr } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", params.expenseId)
      .eq("organization_id", session.organizationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "ACCOUNTING",
      entityType: "expenses",
      entityId: params.expenseId,
      oldValues: { title: exp.title, amount: exp.amount },
      newValues: updates,
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error updating expense voucher",
    };
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
