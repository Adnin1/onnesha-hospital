"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";

export interface InsurancePayer {
  id: string;
  organization_id: string;
  payer_name: string;
  payer_code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface InsuranceClaim {
  id: string;
  organization_id?: string;
  claim_number: string;
  payer_id: string;
  patient_id: string;
  invoice_id: string;
  claim_amount: number;
  approved_amount: number;
  status: "SUBMITTED" | "PRE_AUTHORIZED" | "APPROVED" | "DISBURSED" | "REJECTED";
  created_at: string;
  insurance_payers?: {
    payer_name: string;
    payer_code: string;
  };
  patients?: {
    full_name: string;
    patient_code: string;
    phone?: string;
  };
  invoices?: {
    invoice_number?: string;
    total_amount?: number;
  };
}

/**
 * Default standard healthcare insurance payers for Bangladesh corporate healthcare market.
 */
const DEFAULT_PAYERS = [
  { payer_name: "MetLife Bangladesh (Alico)", payer_code: "METLIFE" },
  { payer_name: "Green Delta Insurance Company Ltd", payer_code: "GREEN_DELTA" },
  { payer_name: "Pragati Life Insurance Ltd", payer_code: "PRAGATI" },
  { payer_name: "Delta Life Insurance Co Ltd", payer_code: "DELTA_LIFE" },
  { payer_name: "Sena Kalyan Insurance Company", payer_code: "SENA_KALYAN" },
];

/**
 * 1. Fetch Insurance Payers (Auto-bootstraps defaults if empty)
 */
export async function getInsurancePayersAction(): Promise<{
  success: boolean;
  data?: InsurancePayer[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("insurance_payers")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("payer_name", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      // Auto-bootstrap standard corporate payers
      const toInsert = DEFAULT_PAYERS.map((p) => ({
        organization_id: session.organizationId,
        payer_name: p.payer_name,
        payer_code: p.payer_code,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from("insurance_payers")
        .insert(toInsert)
        .select("*");

      if (!insertErr && inserted) {
        return { success: true, data: inserted as InsurancePayer[] };
      }
    }

    return { success: true, data: (data as InsurancePayer[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load insurance payers";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create New Corporate Insurance Payer
 */
export async function createInsurancePayerAction(payload: {
  payer_name: string;
  payer_code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}): Promise<{
  success: boolean;
  data?: InsurancePayer;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    if (!payload.payer_name.trim() || !payload.payer_code.trim()) {
      return { success: false, error: "Payer name and code are required." };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("insurance_payers")
      .insert({
        organization_id: session.organizationId,
        payer_name: payload.payer_name.trim(),
        payer_code: payload.payer_code.trim().toUpperCase(),
      })
      .select("*")
      .single();

    if (error) throw error;
    return { success: true, data: data as InsurancePayer };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create insurance payer";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Insurance Claims
 */
export async function getInsuranceClaimsAction(): Promise<{
  success: boolean;
  data?: InsuranceClaim[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("insurance_claims")
      .select(`
        *,
        insurance_payers (payer_name, payer_code),
        patients (full_name, patient_code, phone)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as InsuranceClaim[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load insurance claims";
    return { success: false, error: msg };
  }
}

/**
 * 4. Submit New Insurance Claim
 */
export async function createInsuranceClaimAction(payload: {
  payer_id: string;
  patient_id: string;
  invoice_id?: string;
  claim_amount: number;
  notes?: string;
}): Promise<{
  success: boolean;
  data?: InsuranceClaim;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized" };
    }

    if (!payload.payer_id) {
      return { success: false, error: "অনুগ্রহ করে বীমা কোম্পানি (Payer) নির্বাচন করুন।" };
    }
    if (!payload.patient_id) {
      return { success: false, error: "অনুগ্রহ করে রোগী নির্বাচন করুন।" };
    }
    if (!payload.claim_amount || payload.claim_amount <= 0) {
      return { success: false, error: "ক্লেইম টাকার পরিমাণ ০ এর বেশি হতে হবে।" };
    }

    const supabase = createClient();

    // If no explicit invoice_id provided, look up the patient's latest invoice or fallback
    let invoiceId = payload.invoice_id;
    if (!invoiceId) {
      const { data: invData } = await supabase
        .from("invoices")
        .select("id")
        .eq("patient_id", payload.patient_id)
        .eq("organization_id", session.organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invData?.id) {
        invoiceId = invData.id;
      }
    }

    if (!invoiceId) {
      // Find any valid invoice in the org to satisfy FK constraint if patient has no bill yet
      const { data: anyInv } = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", session.organizationId)
        .limit(1)
        .maybeSingle();

      if (!anyInv?.id) {
        return { success: false, error: "ক্লেইম রেজিস্টার করার জন্য হাসপাতালে ন্যূনতম ১টি ইনভয়েস থাকা আবশ্যক।" };
      }
      invoiceId = anyInv.id;
    }

    // Generate unique claim number
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const claimNumber = `CLM-${dateStr}-${randSuffix}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("insurance_claims")
      .insert({
        organization_id: session.organizationId,
        claim_number: claimNumber,
        payer_id: payload.payer_id,
        patient_id: payload.patient_id,
        invoice_id: invoiceId,
        claim_amount: payload.claim_amount,
        approved_amount: 0,
        status: "SUBMITTED",
      })
      .select(`
        *,
        insurance_payers (payer_name, payer_code),
        patients (full_name, patient_code, phone)
      `)
      .single();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message || "Failed to insert claim");
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "insurance_claim",
      entityId: inserted.id,
      newValues: {
        claim_number: claimNumber,
        claim_amount: payload.claim_amount,
        payer_id: payload.payer_id,
      },
    });

    return { success: true, data: inserted as InsuranceClaim };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit insurance claim";
    return { success: false, error: msg };
  }
}

/**
 * 5. Update Insurance Claim Status (Pre-Authorize, Approve, Disburse, Reject)
 */
export async function updateInsuranceClaimStatusAction(payload: {
  claim_id: string;
  status: "SUBMITTED" | "PRE_AUTHORIZED" | "APPROVED" | "DISBURSED" | "REJECTED";
  approved_amount?: number;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const updateObj: Record<string, unknown> = {
      status: payload.status,
    };

    if (payload.approved_amount !== undefined) {
      updateObj.approved_amount = payload.approved_amount;
    } else if (payload.status === "APPROVED" || payload.status === "DISBURSED") {
      // If approved without explicit amount, fetch claim amount
      const { data: existing } = await supabase
        .from("insurance_claims")
        .select("claim_amount, approved_amount")
        .eq("id", payload.claim_id)
        .eq("organization_id", session.organizationId)
        .single();

      if (existing && existing.approved_amount <= 0) {
        updateObj.approved_amount = existing.claim_amount;
      }
    }

    const { error } = await supabase
      .from("insurance_claims")
      .update(updateObj)
      .eq("id", payload.claim_id)
      .eq("organization_id", session.organizationId);

    if (error) throw error;

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "BILLING",
      entityType: "insurance_claim",
      entityId: payload.claim_id,
      newValues: updateObj,
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update claim status";
    return { success: false, error: msg };
  }
}
