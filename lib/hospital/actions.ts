/**
 * Hospital Master Data & Administrative Control Actions
 *
 * Provides authoritative management of hospital name, Bengali branding,
 * physical address, hotlines, and contact details.
 *
 * Strictly role-gated: only Super Admin, Hospital Administrator, or Admin
 * can edit, modify, or update hospital master data.
 *
 * Database failures fail closed and return success: false with clear diagnostics.
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
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, code, phone, email, address, updated_at")
      .eq("id", HOSPITAL_METADATA.id)
      .maybeSingle();

    if (orgError) {
      return {
        success: false,
        error: `Database query failed for organizations: ${orgError.message}`,
        data: APPROVED_HOSPITAL_DATA,
      };
    }

    if (!org) {
      return {
        success: false,
        error: "Hospital organization record not found in database. Using approved master configuration.",
        data: APPROVED_HOSPITAL_DATA,
      };
    }

    const { data: settings, error: settingsError } = await supabase
      .from("organization_settings")
      .select("emergency_hotline, ambulance_hotline")
      .eq("organization_id", HOSPITAL_METADATA.id)
      .maybeSingle();

    if (settingsError) {
      return {
        success: false,
        error: `Database query failed for organization_settings: ${settingsError.message}`,
        data: APPROVED_HOSPITAL_DATA,
      };
    }

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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to retrieve hospital master data from database",
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

    // Input format validation
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
      return { success: false, error: "Invalid hospital contact email format" };
    }
    if (payload.phone && !/^[0-9+() -]{6,20}$/.test(payload.phone.trim())) {
      return { success: false, error: "Invalid hospital reception phone number format" };
    }
    if (payload.emergencyHotline && !/^[0-9+() -]{6,20}$/.test(payload.emergencyHotline.trim())) {
      return { success: false, error: "Invalid emergency hotline number format" };
    }
    if (payload.ambulanceHotline && !/^[0-9+() -]{6,20}$/.test(payload.ambulanceHotline.trim())) {
      return { success: false, error: "Invalid ambulance hotline number format" };
    }

    const orgId = session.organizationId || HOSPITAL_METADATA.id;
    const supabase = createClient();

    // 1. Try atomic PostgreSQL RPC update
    let rpcSucceeded = false;
    try {
      const { error: rpcErr } = await supabase.rpc("update_hospital_master_profile", {
        p_name: payload.name?.trim() || null,
        p_address: payload.address?.trim() || null,
        p_phone: payload.phone?.trim() || null,
        p_emergency_hotline: payload.emergencyHotline?.trim() || null,
        p_ambulance_hotline: payload.ambulanceHotline?.trim() || null,
        p_email: payload.email?.trim() || null,
      });

      if (!rpcErr) {
        rpcSucceeded = true;
      }
    } catch {
      rpcSucceeded = false;
    }

    // 2. Direct tables fallback if RPC not installed
    if (!rpcSucceeded) {
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

      const settingsUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
      if (payload.emergencyHotline && payload.emergencyHotline.trim()) {
        settingsUpdate.emergency_hotline = payload.emergencyHotline.trim();
      }
      if (payload.ambulanceHotline && payload.ambulanceHotline.trim()) {
        settingsUpdate.ambulance_hotline = payload.ambulanceHotline.trim();
      }

      const { error: setErr } = await supabase
        .from("organization_settings")
        .upsert({ organization_id: orgId, ...settingsUpdate }, { onConflict: "organization_id" });

      if (setErr) {
        return { success: false, error: `Failed to update hospital settings: ${setErr.message}` };
      }
    }

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
    } catch (auditErr) {
      console.warn("Audit log insert warning:", auditErr);
    }

    return await getHospitalMasterDataAction();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Hospital master data update failed",
    };
  }
}
