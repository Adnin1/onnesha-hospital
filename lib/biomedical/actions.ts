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
    return { success: true, data: (data as BiomedicalDevice[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load biomedical devices";
    return { success: false, error: msg };
  }
}
