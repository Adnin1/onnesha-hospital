import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface BloodDonor {
  id: string;
  organization_id: string;
  donor_code: string;
  full_name: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  phone: string;
  last_donation_date?: string;
  screening_status: "pending" | "passed" | "failed";
  created_at: string;
}

export interface BloodBagItem {
  id: string;
  organization_id: string;
  bag_number: string;
  donor_id?: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  component_type: "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate";
  collection_date: string;
  expiry_date: string;
  storage_location?: string;
  status: "available" | "reserved" | "issued" | "discarded";
  created_at: string;
  donor_name?: string;
  patient_id?: string;
  patient_name?: string;
}

export async function getBloodInventoryAction(bloodGroup?: string): Promise<{
  success: boolean;
  data?: BloodBagItem[];
  error?: string;
}> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BLOOD_BANK_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: blood_bank.view required" };
  }

  try {
    const supabase = createClient();
    let query = supabase
      .from("blood_inventory")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("expiry_date", { ascending: true });

    if (bloodGroup && bloodGroup !== "ALL") {
      query = query.eq("blood_group", bloodGroup);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as BloodBagItem[]) || [] };
  } catch (err: unknown) {
    console.error("[BloodBankActions] getBloodInventoryAction error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load blood inventory." };
  }
}

export async function registerBloodBagAction(payload: {
  bag_number: string;
  donor_id?: string;
  donor_name?: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  component_type: "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate";
  collection_date: string;
  expiry_date: string;
  storage_location?: string;
}): Promise<{ success: boolean; data?: BloodBagItem; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BLOOD_BANK_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: blood_bank.manage required" };
  }

  try {
    const supabase = createClient();
    const { data: inserted, error } = await supabase
      .from("blood_inventory")
      .insert({
        organization_id: session.organizationId,
        bag_number: payload.bag_number,
        donor_id: payload.donor_id,
        blood_group: payload.blood_group,
        component_type: payload.component_type,
        collection_date: payload.collection_date,
        expiry_date: payload.expiry_date,
        storage_location: payload.storage_location || "Central Blood Bank Refrigerator",
        status: "available",
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: inserted as BloodBagItem };
  } catch (err: unknown) {
    console.error("[BloodBankActions] registerBloodBagAction error:", err);
    const msg = err instanceof Error ? err.message : "Failed to register blood bag.";
    return { success: false, error: msg };
  }
}

export async function issueBloodBagAction(payload: {
  bag_id: string;
  patient_id: string;
  patient_name?: string;
  cross_match_result: "compatible" | "incompatible";
}): Promise<{ success: boolean; error?: string }> {
  if (payload.cross_match_result !== "compatible") {
    return { success: false, error: "রক্তের ব্যাগ রোগীটির সাথে ইনকম্প্যাটিবল (Incompatible). ক্রস-ম্যাচ ব্যতীত রক্ত প্রদান নিষিদ্ধ।" };
  }

  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BLOOD_BANK_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: blood_bank.manage required" };
  }

  try {
    const supabase = createClient();

    // Verify patient belongs to this organization
    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("id")
      .eq("id", payload.patient_id)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (pErr || !patient) {
      return { success: false, error: "Patient not found in this organization." };
    }

    const { data: updated, error } = await supabase
      .from("blood_inventory")
      .update({
        status: "issued",
      })
      .eq("id", payload.bag_id)
      .eq("organization_id", session.organizationId)
      .eq("status", "available")
      .select();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!updated || updated.length !== 1) {
      return { success: false, error: "Blood bag is not available or does not exist." };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[BloodBankActions] issueBloodBagAction error:", err);
    const msg = err instanceof Error ? err.message : "Failed to issue blood bag.";
    return { success: false, error: msg };
  }
}
