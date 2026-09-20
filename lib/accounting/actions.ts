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
  status: "DRAFT" | "POSTED" | "VOID";
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
      status: "DRAFT" | "POSTED" | "VOID";
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
    // Fetch all accounts
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
