"use client";

import { createClient } from "@/lib/supabase/client";

export interface BiomedicalDevice {
  id: string;
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
    const supabase = createClient();
    const { data, error } = await supabase
      .from("biomedical_devices")
      .select("*")
      .order("device_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as BiomedicalDevice[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load biomedical devices";
    return { success: false, error: msg };
  }
}
