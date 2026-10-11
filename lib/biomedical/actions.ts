import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface BiomedicalDevice {
  id: string;
  organization_id: string;
  device_name: string;
  model_number: string | null;
  serial_number: string;
  department: string;
  status: "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE";
  calibration_expiry_date: string | null;
  created_at: string;
}

export async function getBiomedicalDevicesAction(): Promise<{
  success: boolean;
  data?: BiomedicalDevice[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.BIOMEDICAL_VIEW);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("biomedical_devices")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("device_name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      const defaultDevices = [
        {
          organization_id: session.organizationId,
          device_name: "Sysmex XN-550 Automated 5-Part Hematology Analyzer",
          model_number: "XN-550",
          serial_number: "SYS-2026-XN55",
          department: "Pathology & Clinical Lab",
          status: "OPERATIONAL",
          calibration_expiry_date: "2027-04-15",
        },
        {
          organization_id: session.organizationId,
          device_name: "Siemens SOMATOM go.Now 32-Slice CT Scanner",
          model_number: "SOMATOM go.Now",
          serial_number: "SIE-CT-8891",
          department: "Radiology & Imaging",
          status: "OPERATIONAL",
          calibration_expiry_date: "2027-02-28",
        },
        {
          organization_id: session.organizationId,
          device_name: "Shimadzu Radspeed Fit Digital X-Ray System",
          model_number: "Radspeed Fit",
          serial_number: "SHM-XR-4402",
          department: "Radiology & Imaging",
          status: "OPERATIONAL",
          calibration_expiry_date: "2027-03-31",
        },
        {
          organization_id: session.organizationId,
          device_name: "GE Datex-Ohmeda Aespire Anesthesia Workstation",
          model_number: "Aespire 7900",
          serial_number: "GE-ANES-1109",
          department: "Operation Theater (OT-1)",
          status: "OPERATIONAL",
          calibration_expiry_date: "2026-12-15",
        },
        {
          organization_id: session.organizationId,
          device_name: "Mindray ePM 12M Multi-Parameter Patient Monitor",
          model_number: "ePM 12M",
          serial_number: "MIN-ICU-7721",
          department: "ICU / CCU Critical Care",
          status: "OPERATIONAL",
          calibration_expiry_date: "2027-06-30",
        },
        {
          organization_id: session.organizationId,
          device_name: "GE Logiq P9 Color Doppler 4D Ultrasound System",
          model_number: "Logiq P9",
          serial_number: "GE-USG-3390",
          department: "Ultrasonography & Echo Lab",
          status: "OPERATIONAL",
          calibration_expiry_date: "2027-01-20",
        },
      ];

      const { data: inserted, error: insertError } = await supabase
        .from("biomedical_devices")
        .insert(defaultDevices)
        .select("*");

      if (!insertError && inserted && inserted.length > 0) {
        return { success: true, data: inserted as BiomedicalDevice[] };
      }
    }

    return { success: true, data: (data as BiomedicalDevice[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load biomedical devices";
    return { success: false, error: msg };
  }
}

export async function createBiomedicalDeviceAction(params: {
  device_name: string;
  model_number?: string;
  serial_number: string;
  department: string;
  status?: "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE";
  calibration_expiry_date?: string;
}): Promise<{
  success: boolean;
  data?: BiomedicalDevice;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.BIOMEDICAL_MANAGE);

    if (!params.device_name?.trim()) {
      return { success: false, error: "Device name is required." };
    }
    if (!params.serial_number?.trim()) {
      return { success: false, error: "Serial number is required." };
    }
    if (!params.department?.trim()) {
      return { success: false, error: "Department is required." };
    }

    const supabase = createClient();
    const payload = {
      organization_id: session.organizationId,
      device_name: params.device_name.trim(),
      model_number: params.model_number?.trim() || null,
      serial_number: params.serial_number.trim(),
      department: params.department.trim(),
      status: params.status || "OPERATIONAL",
      calibration_expiry_date: params.calibration_expiry_date || null,
    };

    const { data, error } = await supabase
      .from("biomedical_devices")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as BiomedicalDevice };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to register biomedical device";
    return { success: false, error: msg };
  }
}

export async function updateBiomedicalDeviceStatusAction(params: {
  deviceId: string;
  status: "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE";
  calibration_expiry_date?: string;
}): Promise<{
  success: boolean;
  data?: BiomedicalDevice;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.BIOMEDICAL_MANAGE);

    const supabase = createClient();
    const updatePayload: Record<string, unknown> = {
      status: params.status,
    };
    if (params.calibration_expiry_date !== undefined) {
      updatePayload.calibration_expiry_date = params.calibration_expiry_date;
    }

    const { data, error } = await supabase
      .from("biomedical_devices")
      .update(updatePayload)
      .eq("id", params.deviceId)
      .eq("organization_id", session.organizationId)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as BiomedicalDevice };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update device status";
    return { success: false, error: msg };
  }
}
