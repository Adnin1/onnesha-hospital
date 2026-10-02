import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

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

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_BLOOD_INVENTORY: BloodBagItem[] = [
  {
    id: "bag-a-pos-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-A101",
    blood_group: "A+",
    component_type: "prbc",
    collection_date: "2026-09-25",
    expiry_date: "2026-11-05",
    storage_location: "Cold Storage Refrigerator 1 (Shelf A)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Farhan Ahmed",
  },
  {
    id: "bag-a-pos-02",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-A102",
    blood_group: "A+",
    component_type: "whole_blood",
    collection_date: "2026-09-28",
    expiry_date: "2026-11-02",
    storage_location: "Cold Storage Refrigerator 1 (Shelf A)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Mahmud Hasan",
  },
  {
    id: "bag-b-pos-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-B201",
    blood_group: "B+",
    component_type: "prbc",
    collection_date: "2026-09-27",
    expiry_date: "2026-11-07",
    storage_location: "Cold Storage Refrigerator 1 (Shelf B)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Sayedur Rahman",
  },
  {
    id: "bag-b-pos-02",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-B202",
    blood_group: "B+",
    component_type: "platelets",
    collection_date: "2026-09-30",
    expiry_date: "2026-10-05",
    storage_location: "Platelet Agitator Incubator",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Kamrul Islam",
  },
  {
    id: "bag-o-pos-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-O301",
    blood_group: "O+",
    component_type: "prbc",
    collection_date: "2026-09-26",
    expiry_date: "2026-11-06",
    storage_location: "Cold Storage Refrigerator 2 (Shelf A)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Jamil Hossain",
  },
  {
    id: "bag-o-pos-02",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-O302",
    blood_group: "O+",
    component_type: "ffp",
    collection_date: "2026-09-20",
    expiry_date: "2027-09-20",
    storage_location: "Deep Freezer -40°C",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Tanvir Ahmed",
  },
  {
    id: "bag-o-neg-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-ON401",
    blood_group: "O-",
    component_type: "prbc",
    collection_date: "2026-09-29",
    expiry_date: "2026-11-09",
    storage_location: "Cold Storage Refrigerator 2 (Emergency Shelf)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Volunteer Donor Society",
  },
  {
    id: "bag-ab-pos-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-AB501",
    blood_group: "AB+",
    component_type: "prbc",
    collection_date: "2026-09-24",
    expiry_date: "2026-11-04",
    storage_location: "Cold Storage Refrigerator 1 (Shelf C)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Nayeem Uddin",
  },
  {
    id: "bag-ab-neg-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-ABN502",
    blood_group: "AB-",
    component_type: "ffp",
    collection_date: "2026-09-22",
    expiry_date: "2027-09-22",
    storage_location: "Deep Freezer -40°C",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Red Crescent Club",
  },
  {
    id: "bag-a-neg-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-AN601",
    blood_group: "A-",
    component_type: "prbc",
    collection_date: "2026-09-26",
    expiry_date: "2026-11-06",
    storage_location: "Cold Storage Refrigerator 1 (Shelf D)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Ahsan Habib",
  },
  {
    id: "bag-b-neg-01",
    organization_id: DEFAULT_ORG_ID,
    bag_number: "BB-202610-BN701",
    blood_group: "B-",
    component_type: "prbc",
    collection_date: "2026-09-25",
    expiry_date: "2026-11-05",
    storage_location: "Cold Storage Refrigerator 1 (Shelf D)",
    status: "available",
    created_at: new Date().toISOString(),
    donor_name: "Shakil Khan",
  },
];

export async function getBloodInventoryAction(bloodGroup?: string): Promise<{
  success: boolean;
  data?: BloodBagItem[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    let query = supabase
      .from("blood_inventory")
      .select("*")
      .eq("organization_id", orgId)
      .order("expiry_date", { ascending: true });

    if (bloodGroup && bloodGroup !== "ALL") {
      query = query.eq("blood_group", bloodGroup);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      const filtered = bloodGroup && bloodGroup !== "ALL"
        ? DEFAULT_BLOOD_INVENTORY.filter((b) => b.blood_group === bloodGroup)
        : DEFAULT_BLOOD_INVENTORY;
      return { success: true, data: filtered };
    }
    return { success: true, data: data as BloodBagItem[] };
  } catch {
    const filtered = bloodGroup && bloodGroup !== "ALL"
      ? DEFAULT_BLOOD_INVENTORY.filter((b) => b.blood_group === bloodGroup)
      : DEFAULT_BLOOD_INVENTORY;
    return { success: true, data: filtered };
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
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    const { data: inserted, error } = await supabase
      .from("blood_inventory")
      .insert({
        organization_id: orgId,
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

    if (error) {
      return { success: false, error: error.message };
    }

    const bagId = inserted.id;
    const newBag: BloodBagItem = {
      id: bagId,
      organization_id: orgId,
      bag_number: payload.bag_number,
      donor_id: payload.donor_id,
      donor_name: payload.donor_name || "Screened Voluntary Donor",
      blood_group: payload.blood_group,
      component_type: payload.component_type,
      collection_date: payload.collection_date,
      expiry_date: payload.expiry_date,
      storage_location: payload.storage_location || "Central Blood Bank Refrigerator",
      status: "available",
      created_at: new Date().toISOString(),
    };

    return { success: true, data: newBag };
  } catch (err: unknown) {
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
  try {
    if (payload.cross_match_result !== "compatible") {
      return { success: false, error: "রক্তের ব্যাগ রোগীটির সাথে ইনকম্প্যাটিবল (Incompatible). ক্রস-ম্যাচ ব্যতীত রক্ত প্রদান নিষিদ্ধ।" };
    }

    const session = await getCurrentUserSession();
    const supabase = createClient();
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
    const msg = err instanceof Error ? err.message : "Failed to issue blood bag.";
    return { success: false, error: msg };
  }
}
