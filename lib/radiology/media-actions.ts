"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

export interface RadiologyMediaStock {
  id: string;
  media_type: string;
  current_quantity: number;
  reorder_level: number;
  unit_cost: number;
  created_at: string;
}

export async function getRadiologyMediaStockAction(): Promise<{
  success: boolean;
  data?: RadiologyMediaStock[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("radiology_media_stock")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("media_type", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as RadiologyMediaStock[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load radiology media stock";
    return { success: false, error: msg };
  }
}

export async function recordMediaConsumptionAction(params: {
  media_id: string;
  study_id?: string;
  quantity_used: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!params.media_id) return { success: false, error: "Media item required" };
    if (params.quantity_used <= 0) return { success: false, error: "Quantity must be positive" };

    const supabase = createClient();
    const { data: userProfile } = await supabase.auth.getUser();

    const { error: insertErr } = await supabase
      .from("radiology_media_consumption")
      .insert({
        media_id: params.media_id,
        study_id: params.study_id || null,
        quantity_used: params.quantity_used,
        technician_id: userProfile?.user?.id || null,
      });

    if (insertErr) throw insertErr;

    // Adjust balance in stock
    const session = await getCurrentUserSession();
    const { data: currentStock } = await supabase
      .from("radiology_media_stock")
      .select("current_quantity")
      .eq("id", params.media_id)
      .eq("organization_id", session.organizationId)
      .single();

    if (currentStock) {
      const { data: updatedRows, error: updateErr } = await supabase
        .from("radiology_media_stock")
        .update({
          current_quantity: Math.max(0, currentStock.current_quantity - params.quantity_used),
        })
        .eq("id", params.media_id)
        .eq("organization_id", session.organizationId)
        .eq("current_quantity", currentStock.current_quantity)
        .select();

      if (updateErr) throw updateErr;
      if (!updatedRows || updatedRows.length !== 1) {
        throw new Error("Concurrency conflict or lost update");
      }
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record media consumption";
    return { success: false, error: msg };
  }
}
