import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface BloodDonor {
  id: string;
  organization_id: string;
  donor_code: string;
  full_name: string;
  age?: number;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  phone: string;
  donor_type?: "voluntary" | "replacement" | "directed";
  sourcing_blood_bank?: string;
  nid_or_passport?: string;
  address?: string;
  details?: string;
  last_donation_date?: string;
  screening_status: "pending" | "passed" | "failed";
  created_at: string;
}

export interface BloodBagItem {
  id: string;
  organization_id: string;
  bag_number: string;
  donor_id?: string;
  donor_name?: string;
  donor_age?: number;
  donor_phone?: string;
  sourcing_blood_bank?: string;
  donor_type?: string;
  donor_details?: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  component_type: "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate";
  collection_date: string;
  expiry_date: string;
  storage_location?: string;
  status: "available" | "reserved" | "issued" | "discarded";
  created_at: string;
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
  donor_age?: number;
  donor_phone?: string;
  donor_type?: string;
  sourcing_blood_bank?: string;
  donor_details?: string;
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
        donor_name: payload.donor_name,
        donor_age: payload.donor_age,
        donor_phone: payload.donor_phone,
        donor_type: payload.donor_type || "voluntary",
        sourcing_blood_bank: payload.sourcing_blood_bank || "Annesha Central Blood Bank (In-House)",
        donor_details: payload.donor_details,
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
  major_crossmatch?: "compatible" | "incompatible";
  minor_crossmatch?: "compatible" | "incompatible";
  technologist_name?: string;
  notes?: string;
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
      .select("id, full_name, patient_code")
      .eq("id", payload.patient_id)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (pErr || !patient) {
      return { success: false, error: "Patient not found in this organization." };
    }

    // Get current bag details
    const { data: currentBag, error: bagErr } = await supabase
      .from("blood_inventory")
      .select("*")
      .eq("id", payload.bag_id)
      .eq("organization_id", session.organizationId)
      .single();

    if (bagErr || !currentBag) {
      return { success: false, error: "Blood bag not found." };
    }

    if (currentBag.status !== "available") {
      return { success: false, error: "Blood bag is not available or has already been issued." };
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

    // Record transfusion
    await supabase.from("blood_transfusion_records").insert({
      organization_id: session.organizationId,
      bag_id: payload.bag_id,
      patient_id: payload.patient_id,
      donor_name: currentBag.donor_name || "Screened Donor",
      donor_age: currentBag.donor_age || null,
      donor_phone: currentBag.donor_phone || null,
      donor_blood_group: currentBag.blood_group,
      sourcing_blood_bank: currentBag.sourcing_blood_bank || "Annesha Central Blood Bank (In-House)",
      donor_type: currentBag.donor_type || "voluntary",
      crossmatch_result: payload.cross_match_result,
      major_crossmatch: payload.major_crossmatch || "compatible",
      minor_crossmatch: payload.minor_crossmatch || "compatible",
      technologist_name: payload.technologist_name || session.profile?.full_name || "Technologist",
      verified_by: session.userId,
      adverse_reaction_notes: payload.notes || null,
    });

    return { success: true };
  } catch (err: unknown) {
    console.error("[BloodBankActions] issueBloodBagAction error:", err);
    const msg = err instanceof Error ? err.message : "Failed to issue blood bag.";
    return { success: false, error: msg };
  }
}

export async function registerAndIssueBloodBagAction(payload: {
  bag_number: string;
  donor_name: string;
  donor_age: number;
  donor_phone: string;
  donor_blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  donor_type?: string;
  sourcing_blood_bank?: string;
  donor_details?: string;
  component_type: "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate";
  patient_id: string;
  major_crossmatch: "compatible" | "incompatible";
  minor_crossmatch: "compatible" | "incompatible";
  technologist_verified: boolean;
  notes?: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BLOOD_BANK_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: blood_bank.manage required" };
  }

  if (payload.major_crossmatch !== "compatible" || payload.minor_crossmatch !== "compatible") {
    return { success: false, error: "ক্রস-ম্যাচ ইনকম্প্যাটিবল হলে রক্ত প্রদান নিষিদ্ধ (Cross-Match Incompatible)." };
  }

  if (!payload.technologist_verified) {
    return { success: false, error: "ল্যাব টেকনোলজিস্টের প্রত্যয়ন ও সম্মতি আবশ্যক।" };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("register_and_issue_blood_bag_atomic", {
      p_org_id: session.organizationId,
      p_user_id: session.userId,
      p_bag_number: payload.bag_number,
      p_donor_name: payload.donor_name.trim(),
      p_donor_age: payload.donor_age,
      p_donor_phone: payload.donor_phone.trim(),
      p_donor_blood_group: payload.donor_blood_group,
      p_donor_type: payload.donor_type || "voluntary",
      p_sourcing_blood_bank: payload.sourcing_blood_bank || "Annesha Central Blood Bank (In-House)",
      p_donor_details: payload.donor_details || "",
      p_component_type: payload.component_type,
      p_patient_id: payload.patient_id,
      p_major_crossmatch: payload.major_crossmatch,
      p_minor_crossmatch: payload.minor_crossmatch,
      p_technologist_verified: payload.technologist_verified,
      p_notes: payload.notes || "Cross-match and transfusion release completed.",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; error?: string; bag_number?: string };
    if (res && res.success === false) {
      return { success: false, error: res.error || "Failed to process cross-match and transfusion." };
    }

    return { success: true, data: res };
  } catch (err: unknown) {
    console.error("[BloodBankActions] registerAndIssueBloodBagAction error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to register and issue blood bag." };
  }
}

export interface BloodTransfusionRecord {
  id: string;
  organization_id: string;
  bag_id: string;
  patient_id: string;
  donor_name?: string;
  donor_age?: number;
  donor_phone?: string;
  donor_blood_group?: string;
  sourcing_blood_bank?: string;
  donor_type?: string;
  crossmatch_result: "compatible" | "incompatible";
  major_crossmatch?: "compatible" | "incompatible";
  minor_crossmatch?: "compatible" | "incompatible";
  technologist_name?: string;
  verified_by: string;
  transfusion_start_time: string;
  adverse_reaction_notes?: string;
  status: "ACTIVE" | "VOIDED";
  created_at: string;
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone?: string;
    gender?: string;
    blood_group?: string;
  };
  blood_inventory?: {
    bag_number: string;
    blood_group: string;
    component_type: string;
  };
}

export async function getBloodTransfusionRecordsAction(): Promise<{
  success: boolean;
  data?: BloodTransfusionRecord[];
  error?: string;
}> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.BLOOD_BANK_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("blood_transfusion_records")
      .select("*, patients(id, patient_code, full_name, phone, gender, blood_group), blood_inventory(bag_number, blood_group, component_type)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as unknown as BloodTransfusionRecord[]) || [] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load transfusion records." };
  }
}

export async function cancelOrVoidBloodTransfusionAction(params: {
  transfusionId: string;
  reason?: string;
  permanentDelete?: boolean;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  const isAllowed =
    session.roles.includes("super_admin") ||
    session.roles.includes("admin") ||
    session.roles.includes("hospital_administrator") ||
    session.roles.includes("lab_technician") ||
    session.roles.includes("doctor") ||
    session.permissions.includes(PERMISSIONS.BLOOD_BANK_MANAGE) ||
    session.permissions.includes(PERMISSIONS.BLOOD_BANK_CROSSMATCH);

  if (!isAllowed) {
    return { success: false, error: "403 Forbidden: Insufficient blood bank permissions." };
  }

  try {
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc("cancel_or_void_blood_transfusion_atomic", {
      p_org_id: session.organizationId,
      p_transfusion_id: params.transfusionId,
      p_user_id: session.userId,
      p_reason: params.reason || "Mistake entry cancelled by user",
      p_permanent_delete: params.permanentDelete || false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const resObj = res as { success?: boolean; message?: string; error?: string };
    if (resObj && resObj.success === false) {
      return { success: false, error: resObj.error || "Failed to cancel/delete transfusion record." };
    }

    return { success: true, message: resObj?.message || "Transfusion record processed successfully and blood bag restored to inventory." };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error cancelling/deleting transfusion record." };
  }
}

export async function updateBloodTransfusionNotesAction(params: {
  transfusionId: string;
  notes: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("blood_transfusion_records")
      .update({
        adverse_reaction_notes: params.notes.trim(),
      })
      .eq("id", params.transfusionId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, message: "Transfusion notes updated successfully." };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error updating notes." };
  }
}

export async function updateBloodTransfusionDossierAction(params: {
  transfusionId: string;
  donorName: string;
  donorPhone: string;
  donorAge: number;
  donorBloodGroup: string;
  majorCrossmatch: "compatible" | "incompatible";
  minorCrossmatch: "compatible" | "incompatible";
  crossmatchResult: "compatible" | "incompatible";
  technologistName: string;
  notes: string;
  sourcingBloodBank?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc("update_blood_transfusion_dossier_atomic", {
      p_org_id: session.organizationId,
      p_transfusion_id: params.transfusionId,
      p_user_id: session.userId,
      p_donor_name: params.donorName.trim(),
      p_donor_phone: params.donorPhone.trim(),
      p_donor_age: params.donorAge,
      p_donor_blood_group: params.donorBloodGroup,
      p_major_crossmatch: params.majorCrossmatch,
      p_minor_crossmatch: params.minorCrossmatch,
      p_crossmatch_result: params.crossmatchResult,
      p_technologist_name: params.technologistName.trim(),
      p_adverse_reaction_notes: params.notes.trim(),
      p_sourcing_blood_bank: params.sourcingBloodBank || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const resObj = res as { success?: boolean; message?: string; error?: string };
    if (resObj && resObj.success === false) {
      return { success: false, error: resObj.error || "Failed to update transfusion dossier." };
    }

    return { success: true, message: resObj?.message || "Transfusion dossier updated successfully." };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error updating dossier." };
  }
}
