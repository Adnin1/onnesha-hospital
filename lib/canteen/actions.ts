"use client";

import { createClient } from "@/lib/supabase/client";

export interface CanteenMenuItem {
  id: string;
  item_name: string;
  item_category: string;
  price: number;
  is_available: boolean;
  created_at: string;
}

export async function getCanteenMenuItemsAction(): Promise<{
  success: boolean;
  data?: CanteenMenuItem[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("canteen_menu_items")
      .select("*")
      .order("item_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as CanteenMenuItem[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load canteen menu";
    return { success: false, error: msg };
  }
}
