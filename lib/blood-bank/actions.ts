import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";

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
}

export async function getBloodInventoryAction(bloodGroup?: string): Promise<{
  success: boolean;
  data?: BloodBagItem[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

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
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as BloodBagItem[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load blood inventory." };
  }
}

export async function registerBloodBagAction(payload: {
  bag_number: string;
  donor_id?: string;
  blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  component_type: "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate";
  collection_date: string;
  expiry_date: string;
  storage_location?: string;
}): Promise<{ success: boolean; data?: BloodBagItem; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }
    await requirePermission("clinical.write");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("blood_inventory")
      .insert({
        organization_id: session.organizationId,
        bag_number: payload.bag_number,
        donor_id: payload.donor_id,
        blood_group: payload.blood_group,
        component_type: payload.component_type,
        collection_date: payload.collection_date,
        expiry_date: payload.expiry_date,
        storage_location: payload.storage_location,
        status: "available",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as BloodBagItem };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to register blood bag." };
  }
}
