/**
 * Enterprise Print Service & Audit Action
 * Handles browser print execution and audits every document print/reprint.
 */

import { createClient } from "@/lib/supabase/client";
import { RecordPrintActionParams } from "./types";

export class PrintService {
  /**
   * Records a document print or reprint event for financial and medical compliance.
   */
  static async recordPrintLog(params: RecordPrintActionParams): Promise<{ success: boolean; logId?: string }> {
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("document_print_logs")
        .insert({
          document_type: params.documentType,
          document_reference_id: params.documentReferenceId,
          patient_id: params.patientId || null,
          printed_by: userData?.user?.id || null,
          print_format: params.printFormat,
          is_reprint: params.isReprint ?? false,
          reprint_reason: params.reprintReason || null,
        })
        .select("id")
        .single();

      if (error) {
        return { success: false };
      }

      return { success: true, logId: data?.id };
    } catch {
      return { success: false };
    }
  }

  /**
   * Invokes native window.print() after recording audit log.
   */
  static async executePrint(params: RecordPrintActionParams): Promise<void> {
    await this.recordPrintLog(params);
    if (typeof window !== "undefined") {
      window.print();
    }
  }
}
