"use client";

import { createClient } from "@/lib/supabase/client";

export interface HospitalLicense {
  id: string;
  license_type: string;
  license_number: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  renewal_reminder_days: number;
  status: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "RENEWAL_APPLIED";
  document_url: string | null;
  created_at: string;
}

export async function getHospitalLicensesAction(): Promise<{
  success: boolean;
  data?: HospitalLicense[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("hospital_licenses")
      .select("*")
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as HospitalLicense[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load hospital licenses";
    return { success: false, error: msg };
  }
}

export async function registerHospitalLicenseAction(params: {
  license_type: string;
  license_number: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  document_url?: string;
}): Promise<{ success: boolean; data?: HospitalLicense; error?: string }> {
  try {
    if (!params.license_number.trim()) return { success: false, error: "License number is required" };
    if (!params.issuing_authority.trim()) return { success: false, error: "Issuing authority is required" };
    if (!params.issue_date || !params.expiry_date) return { success: false, error: "Issue and expiry dates are required" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("hospital_licenses")
      .insert({
        license_type: params.license_type,
        license_number: params.license_number.trim(),
        issuing_authority: params.issuing_authority.trim(),
        issue_date: params.issue_date,
        expiry_date: params.expiry_date,
        status: "VALID",
        document_url: params.document_url?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as HospitalLicense };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to register hospital license";
    return { success: false, error: msg };
  }
}
