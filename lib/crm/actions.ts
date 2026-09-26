"use client";

import { createClient } from "@/lib/supabase/client";

export interface CorporateClient {
  id: string;
  company_name: string;
  company_code: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string | null;
  credit_limit: number;
  current_receivable: number;
  discount_rate_opd: number;
  discount_rate_ipd: number;
  discount_rate_diag: number;
  is_active: boolean;
  created_at: string;
}

export interface CrmFollowup {
  id: string;
  patient_id: string;
  followup_type: "POST_OP" | "DISCHARGE" | "CHRONIC_CARE" | "MISSED_APPOINTMENT" | "FEEDBACK";
  scheduled_date: string;
  status: "SCHEDULED" | "COMPLETED" | "UNREACHABLE" | "CANCELLED";
  outcome_notes: string | null;
  completed_at: string | null;
  created_at: string;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
    phone: string;
  };
}

export async function getCorporateClientsAction(): Promise<{
  success: boolean;
  data?: CorporateClient[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("corporate_clients")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as CorporateClient[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load corporate clients";
    return { success: false, error: msg };
  }
}

export async function createCorporateClientAction(params: {
  company_name: string;
  company_code: string;
  contact_person: string;
  contact_phone: string;
  contact_email?: string;
  credit_limit: number;
  discount_rate_opd?: number;
  discount_rate_ipd?: number;
  discount_rate_diag?: number;
}): Promise<{ success: boolean; data?: CorporateClient; error?: string }> {
  try {
    if (!params.company_name.trim()) return { success: false, error: "Company name is required" };
    if (!params.company_code.trim()) return { success: false, error: "Company code is required" };
    if (!params.contact_phone.trim()) return { success: false, error: "Contact phone is required" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("corporate_clients")
      .insert({
        company_name: params.company_name.trim(),
        company_code: params.company_code.trim().toUpperCase(),
        contact_person: params.contact_person.trim(),
        contact_phone: params.contact_phone.trim(),
        contact_email: params.contact_email?.trim() || null,
        credit_limit: params.credit_limit || 0,
        discount_rate_opd: params.discount_rate_opd || 0,
        discount_rate_ipd: params.discount_rate_ipd || 0,
        discount_rate_diag: params.discount_rate_diag || 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CorporateClient };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create corporate client";
    return { success: false, error: msg };
  }
}

export async function getCrmFollowupsAction(): Promise<{
  success: boolean;
  data?: CrmFollowup[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("patient_crm_followups")
      .select(`
        *,
        patients (id, full_name, patient_code, phone)
      `)
      .order("scheduled_date", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as CrmFollowup[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load CRM follow-ups";
    return { success: false, error: msg };
  }
}
