import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { InvoiceRecord } from "@/types/billing";
import { sanitizePostgrestSearchTerm } from "./financial";

export { sanitizePostgrestSearchTerm } from "./financial";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FinancialDashboardAggregatesData {
  totalInvoices: number;
  activeInvoices: number;
  voidedInvoices: number;
  grossRevenue: number;
  totalDiscounts: number;
  netRevenue: number;
  grossCollections: number;
  totalRefunds: number;
  netCollections: number;
  historicalArDue: number;
  collectionRatePct: number;
  dueRatePct: number;
}

export interface PaymentChannelBreakdownData {
  method: string;
  transactionCount: number;
  totalCollected: number;
  percentageOfTotal: number;
}

export interface DepartmentRevenueBreakdownData {
  category: string;
  itemCount: number;
  totalRevenue: number;
  percentageOfTotal: number;
}

export interface AccountsReceivableAgingData {
  asOfDate: string;
  totalInvoicesDue: number;
  totalAR: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  days_91_120: number;
  days_120_plus: number;
  reconciliationDifference: number;
  isReconciled: boolean;
}

export interface ProfitAndLossSummaryData {
  periodStart: string;
  periodEnd: string;
  accrualBasis: {
    grossRevenue: number;
    discounts: number;
    netRecognizedRevenue: number;
    operatingExpenses: number;
    netOperatingSurplus: number;
    expenseBreakdown: Array<{ category: string; amount: number }>;
  };
  cashMovement: {
    patientCollections: number;
    totalCashInflow: number;
    refunds: number;
    operatingDisbursements: number;
    totalCashOutflow: number;
    netCashMovement: number;
  };
}

export interface PaginatedInvoicesResult {
  invoices: InvoiceRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 1. Authoritative Financial Dashboard Aggregates Action
 */
export async function getFinancialDashboardAggregatesAction(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<FinancialDashboardAggregatesData>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_financial_dashboard_aggregates", {
      p_org_id: session.organizationId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = data as {
      total_invoices: number;
      active_invoices: number;
      voided_invoices: number;
      gross_revenue: number;
      total_discounts: number;
      net_revenue: number;
      gross_collections: number;
      total_refunds: number;
      net_collections: number;
      historical_ar_due: number;
      collection_rate_pct: number;
      due_rate_pct: number;
    };

    return {
      success: true,
      data: {
        totalInvoices: Number(row.total_invoices || 0),
        activeInvoices: Number(row.active_invoices || 0),
        voidedInvoices: Number(row.voided_invoices || 0),
        grossRevenue: Number(row.gross_revenue || 0),
        totalDiscounts: Number(row.total_discounts || 0),
        netRevenue: Number(row.net_revenue || 0),
        grossCollections: Number(row.gross_collections || 0),
        totalRefunds: Number(row.total_refunds || 0),
        netCollections: Number(row.net_collections || 0),
        historicalArDue: Number(row.historical_ar_due || 0),
        collectionRatePct: Number(row.collection_rate_pct || 0),
        dueRatePct: Number(row.due_rate_pct || 0),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load financial aggregates",
    };
  }
}

/**
 * 2. Authoritative Payment Channel Breakdown Action
 */
export async function getPaymentChannelBreakdownAction(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<PaymentChannelBreakdownData[]>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_payment_channel_breakdown", {
      p_org_id: session.organizationId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = (data || []) as Array<{
      method: string;
      transaction_count: number;
      total_collected: number;
      percentage_of_total: number;
    }>;

    return {
      success: true,
      data: rows.map((r) => ({
        method: r.method,
        transactionCount: Number(r.transaction_count || 0),
        totalCollected: Number(r.total_collected || 0),
        percentageOfTotal: Number(r.percentage_of_total || 0),
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load payment channel breakdown",
    };
  }
}

/**
 * 3. Authoritative Department Revenue Breakdown Action
 */
export async function getDepartmentRevenueBreakdownAction(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<DepartmentRevenueBreakdownData[]>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_department_revenue_breakdown", {
      p_org_id: session.organizationId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = (data || []) as Array<{
      category: string;
      item_count: number;
      total_revenue: number;
      percentage_of_total: number;
    }>;

    return {
      success: true,
      data: rows.map((r) => ({
        category: r.category,
        itemCount: Number(r.item_count || 0),
        totalRevenue: Number(r.total_revenue || 0),
        percentageOfTotal: Number(r.percentage_of_total || 0),
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load department breakdown",
    };
  }
}

/**
 * 4. Authoritative Accounts Receivable Aging Action (True As-Of Reconstruction)
 */
export async function getAccountsReceivableAgingAction(params: {
  asOfDate: string;
}): Promise<ActionResult<AccountsReceivableAgingData>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_accounts_receivable_aging", {
      p_org_id: session.organizationId,
      p_as_of_date: params.asOfDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = data as {
      as_of_date: string;
      total_invoices_due: number;
      total_ar: number;
      current_0_30: number;
      days_31_60: number;
      days_61_90: number;
      days_91_120: number;
      days_120_plus: number;
      reconciliation_difference: number;
      is_reconciled: boolean;
    };

    return {
      success: true,
      data: {
        asOfDate: row.as_of_date || params.asOfDate,
        totalInvoicesDue: Number(row.total_invoices_due || 0),
        totalAR: Number(row.total_ar || 0),
        current_0_30: Number(row.current_0_30 || 0),
        days_31_60: Number(row.days_31_60 || 0),
        days_61_90: Number(row.days_61_90 || 0),
        days_91_120: Number(row.days_91_120 || 0),
        days_120_plus: Number(row.days_120_plus || 0),
        reconciliationDifference: Number(row.reconciliation_difference || 0),
        isReconciled: Boolean(row.is_reconciled),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load AR aging",
    };
  }
}

/**
 * 5. Authoritative Profit & Loss Summary Action (Accrual P&L and Cash Movement)
 */
export async function getProfitAndLossSummaryAction(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<ProfitAndLossSummaryData>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_profit_and_loss_summary", {
      p_org_id: session.organizationId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = data as {
      period_start: string;
      period_end: string;
      accrual_basis: {
        gross_revenue: number;
        discounts: number;
        net_recognized_revenue: number;
        operating_expenses: number;
        net_operating_surplus: number;
        expense_breakdown: Array<{ category: string; amount: number }>;
      };
      cash_movement: {
        patient_collections: number;
        total_cash_inflow: number;
        refunds: number;
        operating_disbursements: number;
        total_cash_outflow: number;
        net_cash_movement: number;
      };
    };

    return {
      success: true,
      data: {
        periodStart: row.period_start || params.startDate,
        periodEnd: row.period_end || params.endDate,
        accrualBasis: {
          grossRevenue: Number(row.accrual_basis?.gross_revenue || 0),
          discounts: Number(row.accrual_basis?.discounts || 0),
          netRecognizedRevenue: Number(row.accrual_basis?.net_recognized_revenue || 0),
          operatingExpenses: Number(row.accrual_basis?.operating_expenses || 0),
          netOperatingSurplus: Number(row.accrual_basis?.net_operating_surplus || 0),
          expenseBreakdown: Array.isArray(row.accrual_basis?.expense_breakdown)
            ? row.accrual_basis.expense_breakdown.map((e) => ({
                category: e.category,
                amount: Number(e.amount || 0),
              }))
            : [],
        },
        cashMovement: {
          patientCollections: Number(row.cash_movement?.patient_collections || 0),
          totalCashInflow: Number(row.cash_movement?.total_cash_inflow || 0),
          refunds: Number(row.cash_movement?.refunds || 0),
          operatingDisbursements: Number(row.cash_movement?.operating_disbursements || 0),
          totalCashOutflow: Number(row.cash_movement?.total_cash_outflow || 0),
          netCashMovement: Number(row.cash_movement?.net_cash_movement || 0),
        },
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load P&L summary",
    };
  }
}


/**
 * 6. Server-Side Paginated Invoices for Reporting Detail View
 */
export async function getPaginatedReportInvoicesAction(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  endExclusiveDate?: string;
}): Promise<ActionResult<PaginatedInvoicesResult>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize || 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("invoices")
      .select(
        `
        id,
        organization_id,
        invoice_number,
        patient_id,
        visit_id,
        subtotal,
        discount_amount,
        discount_reason,
        tax_amount,
        grand_total,
        paid_amount,
        due_amount,
        status,
        is_voided,
        void_reason,
        voided_at,
        voided_by,
        created_at,
        updated_at,
        patients (id, patient_code, full_name, phone, gender)
      `,
        { count: "exact" }
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (params.startDate) {
      query = query.gte("created_at", params.startDate);
    }
    const endBoundary = params.endExclusiveDate || params.endDate;
    if (endBoundary) {
      query = query.lt("created_at", endBoundary);
    }

    if (params.status && params.status !== "all" && params.status !== "ALL") {
      if (params.status === "paid" || params.status === "PAID") {
        query = query.eq("status", "PAID").eq("is_voided", false);
      } else if (params.status === "due" || params.status === "DUE") {
        query = query.in("status", ["UNPAID", "PARTIALLY_PAID"]).eq("is_voided", false);
      } else if (params.status === "void" || params.status === "VOID") {
        query = query.eq("is_voided", true);
      } else {
        query = query.eq("status", params.status);
      }
    }

    const sanitizedSearch = sanitizePostgrestSearchTerm(params.searchQuery);
    if (sanitizedSearch.length > 0) {
      query = query.ilike("invoice_number", `%${sanitizedSearch}%`);
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface InvoiceDbRow {
      id: string;
      organization_id: string;
      invoice_number: string;
      patient_id: string;
      visit_id: string | null;
      subtotal: number | string;
      discount_amount: number | string;
      discount_reason: string | null;
      tax_amount: number | string;
      grand_total: number | string;
      paid_amount: number | string;
      due_amount: number | string;
      status: InvoiceRecord["status"];
      is_voided: boolean;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      created_at: string;
      updated_at: string;
      invoice_items?: unknown[];
      payments?: unknown[];
      refunds?: unknown[];
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender: string;
      } | null;
    }

    const mappedInvoices: InvoiceRecord[] = ((data as unknown as InvoiceDbRow[]) || []).map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      invoice_number: row.invoice_number,
      patient_id: row.patient_id,
      visit_id: row.visit_id,
      subtotal: Number(row.subtotal || 0),
      discount_amount: Number(row.discount_amount || 0),
      discount_reason: row.discount_reason,
      tax_amount: Number(row.tax_amount || 0),
      grand_total: Number(row.grand_total || 0),
      paid_amount: Number(row.paid_amount || 0),
      due_amount: Number(row.due_amount || 0),
      status: row.status,
      is_voided: Boolean(row.is_voided),
      void_reason: row.void_reason,
      voided_at: row.voided_at,
      voided_by: row.voided_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      items: (row.invoice_items as InvoiceRecord["items"]) || [],
      payments: (row.payments as InvoiceRecord["payments"]) || [],
      refunds: (row.refunds as InvoiceRecord["refunds"]) || [],
      patient: row.patients || undefined,
    }));

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      success: true,
      data: {
        invoices: mappedInvoices,
        totalCount,
        page,
        pageSize,
        totalPages,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load paginated invoices",
    };
  }
}

/**
 * 7. Full-Dataset Invoices for CSV Export (without page limits, with UTF-8 BOM)
 */
export async function getExportReportInvoicesAction(params: {
  status?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  endExclusiveDate?: string;
}): Promise<ActionResult<{ invoices: InvoiceRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("reports.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: reports.view required" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("invoices")
      .select(
        `
        id,
        organization_id,
        invoice_number,
        patient_id,
        visit_id,
        subtotal,
        discount_amount,
        discount_reason,
        tax_amount,
        grand_total,
        paid_amount,
        due_amount,
        status,
        is_voided,
        void_reason,
        created_at,
        patients (id, patient_code, full_name, phone)
      `
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (params.startDate) {
      query = query.gte("created_at", params.startDate);
    }
    const endBoundary = params.endExclusiveDate || params.endDate;
    if (endBoundary) {
      query = query.lt("created_at", endBoundary);
    }

    if (params.status && params.status !== "all" && params.status !== "ALL") {
      if (params.status === "paid" || params.status === "PAID") {
        query = query.eq("status", "PAID").eq("is_voided", false);
      } else if (params.status === "due" || params.status === "DUE") {
        query = query.in("status", ["UNPAID", "PARTIALLY_PAID"]).eq("is_voided", false);
      } else if (params.status === "void" || params.status === "VOID") {
        query = query.eq("is_voided", true);
      } else {
        query = query.eq("status", params.status);
      }
    }

    const sanitizedSearch = sanitizePostgrestSearchTerm(params.searchQuery);
    if (sanitizedSearch.length > 0) {
      query = query.ilike("invoice_number", `%${sanitizedSearch}%`);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface ExportInvoiceDbRow {
      id: string;
      organization_id: string;
      invoice_number: string;
      patient_id: string;
      visit_id: string | null;
      subtotal: number | string;
      discount_amount: number | string;
      discount_reason: string | null;
      tax_amount: number | string;
      grand_total: number | string;
      paid_amount: number | string;
      due_amount: number | string;
      status: InvoiceRecord["status"];
      is_voided: boolean;
      void_reason: string | null;
      created_at: string;
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
      } | null;
    }

    const mappedInvoices: InvoiceRecord[] = ((data as unknown as ExportInvoiceDbRow[]) || []).map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      invoice_number: row.invoice_number,
      patient_id: row.patient_id,
      visit_id: row.visit_id,
      subtotal: Number(row.subtotal || 0),
      discount_amount: Number(row.discount_amount || 0),
      discount_reason: row.discount_reason,
      tax_amount: Number(row.tax_amount || 0),
      grand_total: Number(row.grand_total || 0),
      paid_amount: Number(row.paid_amount || 0),
      due_amount: Number(row.due_amount || 0),
      status: row.status,
      is_voided: Boolean(row.is_voided),
      void_reason: row.void_reason,
      created_at: row.created_at,
      updated_at: row.created_at,
      items: [],
      payments: [],
      patient: row.patients
        ? {
            id: row.patients.id,
            patient_code: row.patients.patient_code,
            full_name: row.patients.full_name,
            phone: row.patients.phone,
          }
        : undefined,
    }));

    return { success: true, data: { invoices: mappedInvoices } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load invoices for export",
    };
  }
}

