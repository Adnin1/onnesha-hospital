import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { getDhakaDateString } from "@/lib/datetime";
import { PERMISSIONS } from "@/lib/permissions";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface AccountRecord {
  id: string;
  organization_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface JournalEntryLineItem {
  id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntryRecord {
  id: string;
  organization_id: string;
  entry_number: string;
  entry_date: string;
  reference_type?: string | null;
  reference_id?: string | null;
  description: string;
  status: "DRAFT" | "POSTED" | "VOID" | "REVERSED";
  total_debit: number;
  total_credit: number;
  posted_by?: string | null;
  created_at: string;
  lines?: JournalEntryLineItem[];
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Chart of Accounts for current tenant
 */
export async function getChartOfAccountsAction(): Promise<ActionResult<{ accounts: AccountRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("account_code", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { accounts: (data as AccountRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch Chart of Accounts";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create or initialize a GL Account
 */
export async function createAccountAction(input: {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id?: string;
}): Promise<ActionResult<{ account: AccountRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient accounting permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const payload = {
      organization_id: session.organizationId,
      account_code: input.account_code.trim(),
      account_name: input.account_name.trim(),
      account_type: input.account_type,
      parent_account_id: input.parent_account_id || null,
      is_active: true,
    };

    const { data, error } = await supabase
      .from("chart_of_accounts")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "ACCOUNTING",
      entityType: "chart_of_accounts",
      entityId: data.id,
      newValues: { account_code: input.account_code, account_name: input.account_name },
    });

    return { success: true, data: { account: data as AccountRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create account";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Journal Entries with their lines
 */
export async function getJournalEntriesAction(params?: {
  limit?: number;
  reference_type?: string;
}): Promise<ActionResult<{ entries: JournalEntryRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("journal_entries")
      .select(`
        *,
        lines:journal_entry_lines (
          id,
          account_id,
          debit,
          credit,
          description,
          account:chart_of_accounts (account_code, account_name)
        )
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.reference_type) {
      query = query.eq("reference_type", params.reference_type);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface RawLine {
      id: string;
      account_id: string;
      debit: number | string;
      credit: number | string;
      description?: string;
      account?: { account_code: string; account_name: string } | null;
    }

    interface RawEntry {
      id: string;
      organization_id: string;
      entry_number: string;
      entry_date: string;
      reference_type?: string | null;
      reference_id?: string | null;
      description: string;
      status: "DRAFT" | "POSTED" | "VOID" | "REVERSED";
      total_debit: number | string;
      total_credit: number | string;
      posted_by?: string | null;
      created_at: string;
      lines?: RawLine[];
    }

    const entries: JournalEntryRecord[] = ((data || []) as unknown as RawEntry[]).map((e) => ({
      id: e.id,
      organization_id: e.organization_id,
      entry_number: e.entry_number,
      entry_date: e.entry_date,
      reference_type: e.reference_type,
      reference_id: e.reference_id,
      description: e.description,
      status: e.status,
      total_debit: Number(e.total_debit || 0),
      total_credit: Number(e.total_credit || 0),
      posted_by: e.posted_by,
      created_at: e.created_at,
      lines: (e.lines || []).map((l) => ({
        id: l.id,
        account_id: l.account_id,
        account_code: l.account?.account_code,
        account_name: l.account?.account_name,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description,
      })),
    }));

    return { success: true, data: { entries } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch journal entries";
    return { success: false, error: msg };
  }
}

/**
 * 4. Post Journal Entry Atomically (Enforcing Sum(Debit) === Sum(Credit))
 */
export async function postJournalEntryAction(input: {
  entry_number: string;
  entry_date?: string;
  reference_type?: string;
  reference_id?: string;
  description: string;
  lines: { account_id: string; debit: number; credit: number; description?: string }[];
}): Promise<ActionResult<{ entry_id: string; entry_number: string; total_debit: number; total_credit: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient accounting permissions";
    return { success: false, error: msg };
  }

  if (!input.lines || input.lines.length < 2) {
    return { success: false, error: "Journal entry must have at least two lines" };
  }

  // Validate line-level mutual exclusivity constraint (debit XOR credit)
  for (const line of input.lines) {
    const d = Number(line.debit) || 0;
    const c = Number(line.credit) || 0;
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      return {
        success: false,
        error: `Invalid journal line: Each line must have debit > 0 XOR credit > 0 (found debit=${d}, credit=${c})`,
      };
    }
  }

  // Double-Entry Invariant check: Sum(Debit) === Sum(Credit)
  const totalDebit = input.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = input.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return {
      success: false,
      error: `Unbalanced journal entry: Total Debit (${totalDebit.toFixed(2)}) does not equal Total Credit (${totalCredit.toFixed(2)})`,
    };
  }

  if (totalDebit <= 0) {
    return { success: false, error: "Journal entry total must be greater than zero" };
  }

  try {
    const supabase = await createClient();
    const entryDate = input.entry_date || getDhakaDateString();

    // Call PostgreSQL RPC post_journal_entry_atomic
    const { data: rpcData, error: rpcError } = await supabase.rpc("post_journal_entry_atomic", {
      p_org_id: session.organizationId,
      p_entry_number: input.entry_number.trim(),
      p_entry_date: entryDate,
      p_reference_type: input.reference_type || "MANUAL",
      p_reference_id: input.reference_id || null,
      p_description: input.description.trim(),
      p_lines: input.lines,
      p_posted_by: session.userId,
    });

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "ACCOUNTING",
      entityType: "journal_entries",
      entityId: (rpcData as { entry_id: string })?.entry_id || input.entry_number,
      newValues: {
        entry_number: input.entry_number,
        total_debit: totalDebit,
        total_credit: totalCredit,
      },
    });

    return {
      success: true,
      data: {
        entry_id: (rpcData as { entry_id: string })?.entry_id,
        entry_number: input.entry_number,
        total_debit: totalDebit,
        total_credit: totalCredit,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post journal entry";
    return { success: false, error: msg };
  }
}

/**
 * 5. Generate Trial Balance
 */
export async function getTrialBalanceAction(): Promise<ActionResult<{ trialBalance: TrialBalanceRow[]; totalDebits: number; totalCredits: number; isBalanced: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    // Prefer authoritative PostgreSQL RPC get_trial_balance
    const { data: rpcRows, error: rpcError } = await supabase.rpc("get_trial_balance", {
      p_org_id: session.organizationId,
    });

    if (!rpcError && rpcRows && Array.isArray(rpcRows) && rpcRows.length > 0) {
      interface TrialBalanceRpcRow {
        account_id: string;
        account_code: string;
        account_name: string;
        account_type: AccountType;
        total_debit?: number | string;
        total_credit?: number | string;
        net_balance?: number | string;
      }
      let totalDebits = 0;
      let totalCredits = 0;
      const trialBalance: TrialBalanceRow[] = (rpcRows as unknown as TrialBalanceRpcRow[]).map((r) => {
        const d = Number(r.total_debit) || 0;
        const c = Number(r.total_credit) || 0;
        totalDebits += d;
        totalCredits += c;
        return {
          account_id: r.account_id,
          account_code: r.account_code,
          account_name: r.account_name,
          account_type: r.account_type,
          total_debit: d,
          total_credit: c,
          net_balance: Number(r.net_balance) || (d - c),
        };
      });

      return {
        success: true,
        data: {
          trialBalance,
          totalDebits,
          totalCredits,
          isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        },
      };
    }

    // Fallback: Fetch all accounts
    const { data: accounts, error: accError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .eq("organization_id", session.organizationId)
      .order("account_code", { ascending: true });

    if (accError) {
      return { success: false, error: accError.message };
    }

    // Fetch all posted journal lines
    const { data: lines, error: lineError } = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit, credit");

    if (lineError) {
      return { success: false, error: lineError.message };
    }

    const debitMap = new Map<string, number>();
    const creditMap = new Map<string, number>();

    for (const line of lines || []) {
      const aId = line.account_id;
      debitMap.set(aId, (debitMap.get(aId) || 0) + Number(line.debit || 0));
      creditMap.set(aId, (creditMap.get(aId) || 0) + Number(line.credit || 0));
    }

    let totalDebits = 0;
    let totalCredits = 0;

    const trialBalance: TrialBalanceRow[] = (accounts || []).map((acc) => {
      const d = debitMap.get(acc.id) || 0;
      const c = creditMap.get(acc.id) || 0;
      totalDebits += d;
      totalCredits += c;
      return {
        account_id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        total_debit: d,
        total_credit: c,
        net_balance: d - c,
      };
    });

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      success: true,
      data: {
        trialBalance,
        totalDebits,
        totalCredits,
        isBalanced,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to calculate trial balance";
    return { success: false, error: msg };
  }
}

/**
 * 6. ERP Integration 1: Post Billing Invoice to General Ledger
 */
export async function postBillingToGlAction(invoiceId: string): Promise<ActionResult<{ entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_billing_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: invoiceId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: { entry_number: (data as { entry_number: string })?.entry_number || "" },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post invoice to General Ledger";
    return { success: false, error: msg };
  }
}

/**
 * 7. ERP Integration 2: Record Pharmacy Sale with Stock Deduction & COGS GL
 */
export async function recordPharmacySaleErpAction(input: {
  patientId: string;
  items: Array<{ batch_id: string; quantity: number; unit_price: number }>;
  paymentMethod?: string;
  notes?: string;
}): Promise<ActionResult<{ sale_id: string; sale_number: string; total_sale: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_pharmacy_sale_erp_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: input.patientId,
      p_items: input.items,
      p_payment_method: input.paymentMethod || "CASH",
      p_notes: input.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as { sale_id: string; sale_number: string; total_sale: number; journal_entry_number: string },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process pharmacy ERP sale";
    return { success: false, error: msg };
  }
}

/**
 * 8. ERP Integration 3: Post Procurement GRN to Inventory & Supplier Payable GL
 */
export async function postGrnToInventoryAndGlAction(grnId: string): Promise<ActionResult<{ grn_id: string; total_amount: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_grn_to_inventory_and_gl_atomic", {
      p_org_id: session.organizationId,
      p_grn_id: grnId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { grn_id: string; total_amount: number; journal_entry: { entry_number: string } };
    return {
      success: true,
      data: {
        grn_id: payload.grn_id,
        total_amount: payload.total_amount,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post GRN to inventory and GL";
    return { success: false, error: msg };
  }
}

/**
 * 9. ERP Integration 4: Disburse Payroll to GL
 */
export async function disbursePayrollToGlAction(payrollRunId: string): Promise<ActionResult<{ payroll_run_id: string; total_disbursed: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("disburse_payroll_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_payroll_run_id: payrollRunId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { payroll_run_id: string; total_disbursed: number; journal_entry: { entry_number: string } };
    return {
      success: true,
      data: {
        payroll_run_id: payload.payroll_run_id,
        total_disbursed: payload.total_disbursed,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to disburse payroll to GL";
    return { success: false, error: msg };
  }
}

/**
 * 10. ERP Integration 5: Record Asset Depreciation to GL
 */
export async function recordAssetDepreciationToGlAction(input: {
  assetId: string;
  depreciationAmount: number;
  notes?: string;
}): Promise<ActionResult<{ asset_id: string; depreciation_amount: number; new_current_value: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_asset_depreciation_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_asset_id: input.assetId,
      p_depreciation_amount: input.depreciationAmount,
      p_notes: input.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as {
      asset_id: string;
      depreciation_amount: number;
      new_current_value: number;
      journal_entry: { entry_number: string };
    };

    return {
      success: true,
      data: {
        asset_id: payload.asset_id,
        depreciation_amount: payload.depreciation_amount,
        new_current_value: payload.new_current_value,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record asset depreciation to GL";
    return { success: false, error: msg };
  }
}

export interface FiscalPeriodRecord {
  id: string;
  organization_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at?: string | null;
  closed_by?: string | null;
  created_at: string;
}

/**
 * 11. Fetch Fiscal Periods
 */
export async function getFiscalPeriodsAction(): Promise<ActionResult<{ periods: FiscalPeriodRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fiscal_periods")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("start_date", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { periods: (data as FiscalPeriodRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch fiscal periods";
    return { success: false, error: msg };
  }
}

/**
 * 12. Close Fiscal Period
 */
export async function closeFiscalPeriodAction(periodId: string): Promise<ActionResult<{ period_id: string; is_closed: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient accounting permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_fiscal_period", {
      p_org_id: session.organizationId,
      p_period_id: periodId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "UPDATE",
      module: "ACCOUNTING",
      entityType: "fiscal_periods",
      entityId: periodId,
      newValues: { is_closed: true },
    });

    return { success: true, data: data as { period_id: string; is_closed: boolean } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to close fiscal period";
    return { success: false, error: msg };
  }
}

/**
 * 13. Reopen Fiscal Period (Super Admin only)
 */
export async function reopenFiscalPeriodAction(periodId: string): Promise<ActionResult<{ period_id: string; is_closed: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reopen_fiscal_period", {
      p_org_id: session.organizationId,
      p_period_id: periodId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "UPDATE",
      module: "ACCOUNTING",
      entityType: "fiscal_periods",
      entityId: periodId,
      newValues: { is_closed: false },
    });

    return { success: true, data: data as { period_id: string; is_closed: boolean } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reopen fiscal period";
    return { success: false, error: msg };
  }
}

/**
 * 14. Reverse Journal Entry Atomically
 */
export async function reverseJournalEntryAction(input: {
  originalEntryId: string;
  reversalReason: string;
  reversalDate?: string;
}): Promise<ActionResult<{ reversal_entry: { entry_id: string; entry_number: string } }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient accounting permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reverse_journal_entry_atomic", {
      p_org_id: session.organizationId,
      p_original_entry_id: input.originalEntryId,
      p_reversal_reason: input.reversalReason.trim(),
      p_reversal_date: input.reversalDate || getDhakaDateString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { reversal_entry: { entry_id: string; entry_number: string } };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "ACCOUNTING",
      entityType: "journal_entries",
      entityId: payload.reversal_entry?.entry_id || input.originalEntryId,
      newValues: {
        reversal_of: input.originalEntryId,
        reason: input.reversalReason,
        entry_number: payload.reversal_entry?.entry_number,
      },
    });

    return { success: true, data: payload };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reverse journal entry";
    return { success: false, error: msg };
  }
}

/**
 * 15. Post Supplier Invoice to Accounts Payable GL (3-Way Match)
 */
export async function postSupplierInvoiceToGlAction(supplierInvoiceId: string): Promise<ActionResult<{ supplier_invoice_id: string; match_status: string; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_supplier_invoice_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { supplier_invoice_id: string; match_status: string; journal_entry: { entry_number: string } };
    return {
      success: true,
      data: {
        supplier_invoice_id: payload.supplier_invoice_id,
        match_status: payload.match_status,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post supplier invoice to GL";
    return { success: false, error: msg };
  }
}

/**
 * 16. Record Supplier Invoice Payment to GL
 */
export async function recordSupplierPaymentToGlAction(input: {
  supplierInvoiceId: string;
  paymentAmount: number;
  paymentMethod?: string;
  bankAccountCode?: string;
  notes?: string;
}): Promise<ActionResult<{ supplier_invoice_id: string; payment_amount: number; payment_status: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_supplier_payment_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_supplier_invoice_id: input.supplierInvoiceId,
      p_payment_amount: input.paymentAmount,
      p_payment_method: input.paymentMethod || "BANK",
      p_bank_acc_code: input.bankAccountCode || "1020",
      p_notes: input.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as { supplier_invoice_id: string; payment_amount: number; payment_status: string },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record supplier payment to GL";
    return { success: false, error: msg };
  }
}

/**
 * 17. Post Payroll Accrual to GL
 */
export async function postPayrollAccrualToGlAction(payrollRunId: string): Promise<ActionResult<{ payroll_run_id: string; total_gross: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_payroll_accrual_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_payroll_run_id: payrollRunId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { payroll_run_id: string; total_gross: number; journal_entry: { entry_number: string } };
    return {
      success: true,
      data: {
        payroll_run_id: payload.payroll_run_id,
        total_gross: payload.total_gross,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post payroll accrual to GL";
    return { success: false, error: msg };
  }
}

/**
 * 18. Record Asset Maintenance to GL
 */
export async function recordAssetMaintenanceToGlAction(input: {
  maintenanceLogId: string;
  isCapitalized?: boolean;
  paymentAccountCode?: string;
}): Promise<ActionResult<{ maintenance_log_id: string; is_capitalized: boolean; cost: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_asset_maintenance_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_maintenance_log_id: input.maintenanceLogId,
      p_is_capitalized: input.isCapitalized ?? false,
      p_payment_account_code: input.paymentAccountCode || "1020",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as { maintenance_log_id: string; is_capitalized: boolean; cost: number },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record asset maintenance to GL";
    return { success: false, error: msg };
  }
}

/**
 * 19. Post Payment Receipt to General Ledger (DR Cash/Bank, CR Accounts Receivable)
 */
export async function postPaymentReceiptToGlAction(
  paymentId: string
): Promise<ActionResult<{ payment_id: string; receipt_number: string; journal_entry: unknown }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_payment_receipt_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_payment_id: paymentId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as { payment_id: string; receipt_number: string; journal_entry: unknown },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to post payment receipt to GL";
    return { success: false, error: msg };
  }
}

/**
 * 20. Void Invoice and Reverse GL Atomically
 */
export async function voidInvoiceAndReverseGlAction(
  invoiceId: string,
  reason: string
): Promise<ActionResult<{ invoice_id: string; invoice_number: string; is_voided: boolean; gl_reversal?: unknown }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BILLING_VOID);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient permissions to void invoices";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("void_invoice_and_reverse_gl_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: invoiceId,
      p_reason: reason.trim(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as { invoice_id: string; invoice_number: string; is_voided: boolean; gl_reversal?: unknown },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to void invoice and reverse GL";
    return { success: false, error: msg };
  }
}

/**
 * 21. Get General Ledger Statement for an Account
 */
export async function getGeneralLedgerReportAction(
  accountId: string,
  startDate?: string,
  endDate?: string
): Promise<ActionResult<{ lines: Array<{
  line_id: string;
  journal_entry_id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  reference_id?: string;
  line_description: string;
  debit: number;
  credit: number;
  running_balance: number;
}> }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_general_ledger_report", {
      p_org_id: session.organizationId,
      p_account_id: accountId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    interface GeneralLedgerReportRow {
      line_id: string;
      journal_entry_id: string;
      entry_number: string;
      entry_date: string;
      reference_type: string;
      reference_id?: string;
      line_description: string;
      debit: number;
      credit: number;
      running_balance: number;
    }

    return {
      success: true,
      data: { lines: (data || []) as unknown as GeneralLedgerReportRow[] },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch general ledger report";
    return { success: false, error: msg };
  }
}

/**
 * 22. Accounts Payable Aging Report
 * Groups unpaid supplier invoices into aging buckets: current, 1-30, 31-60, 61-90, 90+ days past due.
 */
export async function getAPAgingReportAction(): Promise<
  ActionResult<{
    asOfDate: string;
    totalOutstanding: number;
    buckets: {
      current: number;
      days_1_30: number;
      days_31_60: number;
      days_61_90: number;
      days_90_plus: number;
    };
    invoices: Array<{
      id: string;
      supplier_invoice_number: string;
      invoice_date: string;
      due_date: string;
      total_amount: number;
      days_overdue: number;
      bucket: "CURRENT" | "1-30" | "31-60" | "61-90" | "90+";
    }>;
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission("accounting.view");
  } catch {
    return { success: false, error: "403 Forbidden: accounting.view required" };
  }

  try {
    const supabase = await createClient();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("supplier_invoices")
      .select("id, supplier_invoice_number, invoice_date, due_date, total_amount, status")
      .eq("organization_id", session.organizationId)
      .in("status", ["PENDING", "POSTED"])
      .order("due_date", { ascending: true });

    if (error) return { success: false, error: error.message };

    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
    let totalOutstanding = 0;

    const invoices = (data || []).map((inv) => {
      const dueDate = new Date(inv.due_date);
      const diffMs = today.getTime() - dueDate.getTime();
      const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const amount = Number(inv.total_amount);
      totalOutstanding += amount;

      let bucket: "CURRENT" | "1-30" | "31-60" | "61-90" | "90+" = "CURRENT";
      if (daysOverdue === 0) {
        buckets.current += amount;
      } else if (daysOverdue <= 30) {
        buckets.days_1_30 += amount;
        bucket = "1-30";
      } else if (daysOverdue <= 60) {
        buckets.days_31_60 += amount;
        bucket = "31-60";
      } else if (daysOverdue <= 90) {
        buckets.days_61_90 += amount;
        bucket = "61-90";
      } else {
        buckets.days_90_plus += amount;
        bucket = "90+";
      }

      return {
        id: inv.id,
        supplier_invoice_number: inv.supplier_invoice_number as string,
        invoice_date: inv.invoice_date as string,
        due_date: inv.due_date as string,
        total_amount: amount,
        days_overdue: daysOverdue,
        bucket,
      };
    });

    return {
      success: true,
      data: {
        asOfDate: todayStr,
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        buckets: {
          current: Number(buckets.current.toFixed(2)),
          days_1_30: Number(buckets.days_1_30.toFixed(2)),
          days_31_60: Number(buckets.days_31_60.toFixed(2)),
          days_61_90: Number(buckets.days_61_90.toFixed(2)),
          days_90_plus: Number(buckets.days_90_plus.toFixed(2)),
        },
        invoices,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate AP aging report";
    return { success: false, error: msg };
  }
}

/**
 * 23. Income Summary (Profit & Loss) Report
 * Aggregates GL journal lines by account type for Revenue and Expense.
 */
export async function getIncomeSummaryAction(params: {
  periodStart: string;
  periodEnd: string;
}): Promise<
  ActionResult<{
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    revenueAccounts: Array<{ accountName: string; accountCode: string; total: number }>;
    expenseAccounts: Array<{ accountName: string; accountCode: string; total: number }>;
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission("accounting.view");
  } catch {
    return { success: false, error: "403 Forbidden: accounting.view required" };
  }

  if (!params.periodStart || !params.periodEnd) {
    return { success: false, error: "periodStart and periodEnd are required" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner (
          id,
          account_code,
          account_name,
          account_type
        )
      `)
      .eq("organization_id", session.organizationId)
      .gte("created_at", params.periodStart)
      .lte("created_at", params.periodEnd + "T23:59:59Z")
      .in("chart_of_accounts.account_type", ["REVENUE", "EXPENSE"]);

    if (error) return { success: false, error: error.message };

    const revenueMap = new Map<string, { accountName: string; accountCode: string; total: number }>();
    const expenseMap = new Map<string, { accountName: string; accountCode: string; total: number }>();

    interface GlLineRow {
      debit_amount: number;
      credit_amount: number;
      chart_of_accounts: {
        id: string;
        account_code: string;
        account_name: string;
        account_type: "REVENUE" | "EXPENSE";
      };
    }

    for (const line of (data || []) as unknown as GlLineRow[]) {
      const acct = line.chart_of_accounts;
      if (!acct) continue;
      if (acct.account_type === "REVENUE") {
        const existing = revenueMap.get(acct.id) ?? { accountName: acct.account_name, accountCode: acct.account_code, total: 0 };
        existing.total += Number(line.credit_amount || 0) - Number(line.debit_amount || 0);
        revenueMap.set(acct.id, existing);
      } else if (acct.account_type === "EXPENSE") {
        const existing = expenseMap.get(acct.id) ?? { accountName: acct.account_name, accountCode: acct.account_code, total: 0 };
        existing.total += Number(line.debit_amount || 0) - Number(line.credit_amount || 0);
        expenseMap.set(acct.id, existing);
      }
    }

    const revenueAccounts = Array.from(revenueMap.values())
      .map((a) => ({ ...a, total: Number(a.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
    const expenseAccounts = Array.from(expenseMap.values())
      .map((a) => ({ ...a, total: Number(a.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    const totalRevenue = revenueAccounts.reduce((s, a) => s + a.total, 0);
    const totalExpenses = expenseAccounts.reduce((s, a) => s + a.total, 0);

    return {
      success: true,
      data: {
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netIncome: Number((totalRevenue - totalExpenses).toFixed(2)),
        revenueAccounts,
        expenseAccounts,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate income summary";
    return { success: false, error: msg };
  }
}
