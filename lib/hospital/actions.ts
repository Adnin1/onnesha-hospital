/**
 * Hospital Master Data & Administrative Control Actions
 *
 * Provides authoritative management of hospital name, Bengali branding,
 * physical address, hotlines, and contact details.
 *
 * Strictly role-gated: only Super Admin, Hospital Administrator, or Admin
 * can edit, modify, or update hospital master data.
 */

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";
import { HOSPITAL_METADATA } from "@/config/hospital";

export interface HospitalMasterData {
  id: string;
  name: string;
  banglaName: string;
  code: string;
  phone: string;
  emergencyHotline: string;
  ambulanceHotline: string;
  email: string;
  address: string;
  regNo?: string;
  updatedAt?: string;
}

export const APPROVED_HOSPITAL_DATA: HospitalMasterData = {
  id: HOSPITAL_METADATA.id,
  name: "Annesha Hospital and Diagnostic Center",
  banglaName: "অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার",
  code: "OH",
  phone: "01718835623",
  emergencyHotline: "01718835623",
  ambulanceHotline: "01904210065",
  email: "aaih.apon@gmail.com",
  address: "সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া",
  regNo: HOSPITAL_METADATA.regNo || "",
};

export async function getHospitalMasterDataAction(): Promise<{
  success: boolean;
  data: HospitalMasterData;
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, code, phone, email, address, updated_at")
      .eq("id", HOSPITAL_METADATA.id)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("organization_settings")
      .select("emergency_hotline, ambulance_hotline")
      .eq("organization_id", HOSPITAL_METADATA.id)
      .maybeSingle();

    return {
      success: true,
      data: {
        id: org?.id || APPROVED_HOSPITAL_DATA.id,
        name: org?.name || APPROVED_HOSPITAL_DATA.name,
        banglaName: APPROVED_HOSPITAL_DATA.banglaName,
        code: org?.code || APPROVED_HOSPITAL_DATA.code,
        phone: org?.phone || APPROVED_HOSPITAL_DATA.phone,
        emergencyHotline: settings?.emergency_hotline || org?.phone || APPROVED_HOSPITAL_DATA.emergencyHotline,
        ambulanceHotline: settings?.ambulance_hotline || APPROVED_HOSPITAL_DATA.ambulanceHotline,
        email: org?.email || APPROVED_HOSPITAL_DATA.email,
        address: org?.address || APPROVED_HOSPITAL_DATA.address,
        regNo: HOSPITAL_METADATA.regNo || "",
        updatedAt: org?.updated_at || new Date().toISOString(),
      },
    };
  } catch {
    return {
      success: true,
      data: APPROVED_HOSPITAL_DATA,
    };
  }
}

export async function updateHospitalMasterDataAction(payload: Partial<HospitalMasterData>): Promise<{
  success: boolean;
  data?: HospitalMasterData;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const isSuperAdminOrAdmin =
      session.roles?.includes("super_admin") ||
      session.roles?.includes("hospital_administrator") ||
      session.roles?.includes("admin");

    if (!isSuperAdminOrAdmin) {
      return {
        success: false,
        error: "Unauthorized: Modifying Hospital Master Data requires Super Admin or Hospital Administrator role.",
      };
    }

    const orgId = session.organizationId || HOSPITAL_METADATA.id;
    const supabase = createClient();

    // 1. Update organizations table
    const orgUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
    if (payload.name && payload.name.trim()) orgUpdate.name = payload.name.trim();
    if (payload.phone && payload.phone.trim()) orgUpdate.phone = payload.phone.trim();
    if (payload.email && payload.email.trim()) orgUpdate.email = payload.email.trim();
    if (payload.address && payload.address.trim()) orgUpdate.address = payload.address.trim();

    const { error: orgErr } = await supabase
      .from("organizations")
      .update(orgUpdate)
      .eq("id", orgId);

    if (orgErr) {
      return { success: false, error: `Failed to update hospital organization: ${orgErr.message}` };
    }

    // 2. Update organization_settings table
    const settingsUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
    if (payload.emergencyHotline && payload.emergencyHotline.trim()) {
      settingsUpdate.emergency_hotline = payload.emergencyHotline.trim();
    }
    if (payload.ambulanceHotline && payload.ambulanceHotline.trim()) {
      settingsUpdate.ambulance_hotline = payload.ambulanceHotline.trim();
    }

    await supabase
      .from("organization_settings")
      .upsert({ organization_id: orgId, ...settingsUpdate }, { onConflict: "organization_id" });

    // 3. Log audit event
    try {
      await supabase.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: session.userId,
        module: "SETTINGS",
        action: "HOSPITAL_MASTER_DATA_UPDATE",
        details: {
          changes: payload,
          updated_by: session.email || session.userId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Non-blocking audit log
    }

    return await getHospitalMasterDataAction();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Hospital master data update failed",
    };
  }
}
