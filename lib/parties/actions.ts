"use client";

import { createClient } from "@/lib/supabase/client";

export interface EnterpriseParty {
  id: string;
  party_code: string;
  party_name: string;
  party_type: "CUSTOMER" | "SUPPLIER" | "DOCTOR" | "CORPORATE" | "INSURER" | "VENDOR";
  phone: string | null;
  opening_balance: number;
  current_balance: number;
  created_at: string;
}

export async function getEnterprisePartiesAction(): Promise<{
  success: boolean;
  data?: EnterpriseParty[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("enterprise_parties")
      .select("*")
      .order("party_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as EnterpriseParty[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load enterprise parties";
    return { success: false, error: msg };
  }
}
