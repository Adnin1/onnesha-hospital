"use client";

import { createClient } from "@/lib/supabase/client";

export interface LisAnalyzer {
  id: string;
  device_name: string;
  device_model: string;
  protocol: "ASTM_1394" | "HL7_V2" | "SERIAL_RS232" | "TCP_IP";
  ip_address: string | null;
  port: number | null;
  status: "ONLINE" | "OFFLINE" | "STANDBY" | "ERROR";
  is_simulator: boolean;
  created_at: string;
}

export interface LisQueueMessage {
  id: string;
  analyzer_id: string;
  raw_payload: string;
  sample_barcode: string | null;
  status: "QUEUED" | "PARSED" | "PROCESSED" | "FAILED";
  parsed_results: Record<string, unknown> | null;
  created_at: string;
}

export async function getLisAnalyzersAction(): Promise<{
  success: boolean;
  data?: LisAnalyzer[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("lis_analyzer_registry")
      .select("*")
      .order("device_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as LisAnalyzer[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load LIS analyzers";
    return { success: false, error: msg };
  }
}

export async function simulateLisMessageAction(params: {
  analyzer_id: string;
  sample_barcode: string;
  test_code: string;
  result_value: string;
}): Promise<{ success: boolean; data?: LisQueueMessage; error?: string }> {
  try {
    const supabase = createClient();
    const payload = `H|\\^&|||LIS_SIMULATOR|||||||P|1\nP|1|||PATIENT_REF\nO|1|${params.sample_barcode}||^^^${params.test_code}\nR|1|^^^${params.test_code}|${params.result_value}|mg/dL||N||F\nL|1|N`;

    const { data, error } = await supabase
      .from("lis_message_queue")
      .insert({
        analyzer_id: params.analyzer_id,
        raw_payload: payload,
        sample_barcode: params.sample_barcode,
        status: "PARSED",
        parsed_results: {
          test_code: params.test_code,
          result_value: params.result_value,
          unit: "mg/dL",
          status: "PASSED",
        },
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as LisQueueMessage };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to ingest simulator LIS message";
    return { success: false, error: msg };
  }
}
