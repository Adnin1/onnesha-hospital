"use client";

import { createClient } from "@/lib/supabase/client";

export interface DietChartRecord {
  id: string;
  patient_id: string;
  visit_id?: string | null;
  diet_order: string;
  dietary_restrictions: string | null;
  breakfast_plan: string | null;
  lunch_plan: string | null;
  dinner_plan: string | null;
  snack_plan: string | null;
  calories_target_kcal: number | null;
  ordered_by: string;
  is_active: boolean;
  created_at: string;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
  };
  profiles?: {
    id: string;
    full_name: string;
  };
}

export async function getInpatientDietChartsAction(patientId?: string): Promise<{
  success: boolean;
  data?: DietChartRecord[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    let query = supabase
      .from("patient_diet_charts")
      .select(`
        *,
        patients (id, full_name, patient_code),
        profiles:ordered_by (id, full_name)
      `)
      .order("created_at", { ascending: false });

    if (patientId) {
      query = query.eq("patient_id", patientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as DietChartRecord[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load diet charts";
    return { success: false, error: msg };
  }
}

export async function createDietChartAction(params: {
  patient_id: string;
  visit_id?: string;
  diet_order: string;
  dietary_restrictions?: string;
  breakfast_plan?: string;
  lunch_plan?: string;
  dinner_plan?: string;
  snack_plan?: string;
  calories_target_kcal?: number;
}): Promise<{ success: boolean; data?: DietChartRecord; error?: string }> {
  try {
    if (!params.patient_id) return { success: false, error: "Patient ID is required" };
    if (!params.diet_order.trim()) return { success: false, error: "Diet order type is required" };

    const supabase = createClient();
    const { data: userProfile, error: profileErr } = await supabase.auth.getUser();
    if (profileErr || !userProfile.user) {
      return { success: false, error: "User authentication required" };
    }

    const { data, error } = await supabase
      .from("patient_diet_charts")
      .insert({
        patient_id: params.patient_id,
        visit_id: params.visit_id || null,
        diet_order: params.diet_order.trim(),
        dietary_restrictions: params.dietary_restrictions?.trim() || null,
        breakfast_plan: params.breakfast_plan?.trim() || null,
        lunch_plan: params.lunch_plan?.trim() || null,
        dinner_plan: params.dinner_plan?.trim() || null,
        snack_plan: params.snack_plan?.trim() || null,
        calories_target_kcal: params.calories_target_kcal || null,
        ordered_by: userProfile.user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as DietChartRecord };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record diet chart";
    return { success: false, error: msg };
  }
}
