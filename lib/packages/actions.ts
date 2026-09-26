"use client";

import { createClient } from "@/lib/supabase/client";

export interface HealthPackage {
  id: string;
  package_code: string;
  package_name: string;
  description: string | null;
  price: number;
  validity_days: number;
  included_services: Array<{
    service_type: "OPD" | "LAB" | "RAD";
    name: string;
    quota: number;
  }>;
  is_active: boolean;
  created_at: string;
}

export interface PackageSubscription {
  id: string;
  package_id: string;
  patient_id: string;
  subscription_number: string;
  start_date: string;
  end_date: string;
  remaining_services: Array<{
    service_type: "OPD" | "LAB" | "RAD";
    name: string;
    remaining: number;
  }>;
  status: "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "CANCELLED";
  created_at: string;
  health_packages?: HealthPackage;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
    phone: string;
  };
}

export async function getHealthPackagesAction(): Promise<{
  success: boolean;
  data?: HealthPackage[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("health_packages")
      .select("*")
      .order("package_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as HealthPackage[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load health packages";
    return { success: false, error: msg };
  }
}

export async function createHealthPackageAction(params: {
  package_code: string;
  package_name: string;
  description?: string;
  price: number;
  validity_days: number;
  included_services: Array<{
    service_type: "OPD" | "LAB" | "RAD";
    name: string;
    quota: number;
  }>;
}): Promise<{ success: boolean; data?: HealthPackage; error?: string }> {
  try {
    if (!params.package_code.trim()) return { success: false, error: "Package code is required" };
    if (!params.package_name.trim()) return { success: false, error: "Package name is required" };
    if (params.price < 0) return { success: false, error: "Price cannot be negative" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("health_packages")
      .insert({
        package_code: params.package_code.trim().toUpperCase(),
        package_name: params.package_name.trim(),
        description: params.description?.trim() || null,
        price: params.price,
        validity_days: params.validity_days || 365,
        included_services: params.included_services,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as HealthPackage };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create health package";
    return { success: false, error: msg };
  }
}
