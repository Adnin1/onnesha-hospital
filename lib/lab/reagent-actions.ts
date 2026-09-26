"use client";

import { createClient } from "@/lib/supabase/client";

export interface ReagentLot {
  id: string;
  reagent_name: string;
  lot_number: string;
  tests_per_lot: number;
  tests_remaining: number;
  expiry_date: string;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  created_at: string;
}

export async function getReagentLotsAction(): Promise<{
  success: boolean;
  data?: ReagentLot[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pathology_reagent_lots")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as ReagentLot[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load reagent inventory";
    return { success: false, error: msg };
  }
}

export async function addReagentLotAction(params: {
  reagent_name: string;
  lot_number: string;
  tests_per_lot: number;
  expiry_date: string;
}): Promise<{ success: boolean; data?: ReagentLot; error?: string }> {
  try {
    if (!params.reagent_name.trim()) return { success: false, error: "Reagent name is required" };
    if (!params.lot_number.trim()) return { success: false, error: "Lot number is required" };
    if (params.tests_per_lot <= 0) return { success: false, error: "Tests capacity must be positive" };
    if (!params.expiry_date) return { success: false, error: "Expiry date is required" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("pathology_reagent_lots")
      .insert({
        reagent_name: params.reagent_name.trim(),
        lot_number: params.lot_number.trim(),
        tests_per_lot: params.tests_per_lot,
        tests_remaining: params.tests_per_lot,
        expiry_date: params.expiry_date,
        status: "ACTIVE",
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as ReagentLot };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record reagent lot";
    return { success: false, error: msg };
  }
}
