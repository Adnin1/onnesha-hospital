import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { DiagnosticOrderRecord } from "@/types/clinical-emr";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Get Diagnostic Pathology & Radiology Orders
 */
export async function getDiagnosticOrdersAction(params?: {
  patientId?: string;
  status?: string;
}): Promise<ActionResult<{ orders: DiagnosticOrderRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("diagnostic_orders")
      .select("*, patients(id, patient_code, full_name, gender, phone), doctors(id, full_name), diagnostic_order_items(*, diagnostic_tests(id, test_name, test_code, price, specimen_type), sample_collections(barcode), diagnostic_results(*, diagnostic_result_values(*, diagnostic_test_parameters(*))))")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (params?.patientId) {
      query = query.eq("patient_id", params.patientId);
    }
    if (params?.status) {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface OrderDbRow {
      id: string;
      organization_id: string;
      order_number: string;
      patient_id: string;
      visit_id?: string;
      referred_by_doctor_id?: string;
      status: DiagnosticOrderRecord["status"];
      created_at: string;
      updated_at: string;
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        gender: string;
        phone: string;
      } | null;
      doctors?: {
        id: string;
        full_name: string;
      } | null;
      diagnostic_order_items?: Array<{
        id: string;
        test_id: string;
        price: number;
        status: string;
        diagnostic_tests?: {
          id: string;
          test_name: string;
          test_code: string;
          price: number;
          specimen_type: string;
        } | null;
        sample_collections?: {
          barcode: string;
        } | null;
        diagnostic_results?: Array<{
          descriptive_findings?: string;
          diagnostic_result_values?: Array<{
            id: string;
            observed_value: string;
            is_abnormal: boolean;
            diagnostic_test_parameters?: {
              id: string;
              parameter_name: string;
              unit?: string;
              reference_range_male?: string;
              reference_range_female?: string;
              reference_range_child?: string;
            } | null;
          }>;
        }>;
      }>;
    }

    const orders: DiagnosticOrderRecord[] = ((data || []) as unknown as OrderDbRow[]).map((ord) => {
      let barcode = "";
      const tests = (ord.diagnostic_order_items || []).map((item) => {
        if (item.sample_collections?.barcode) {
          barcode = item.sample_collections.barcode;
        }

        const res = item.diagnostic_results?.[0];
        const paramsList = (res?.diagnostic_result_values || []).map((v) => ({
          id: v.id,
          test_id: item.test_id,
          parameter_name: v.diagnostic_test_parameters?.parameter_name || "Parameter",
          unit: v.diagnostic_test_parameters?.unit,
          reference_range_male: v.diagnostic_test_parameters?.reference_range_male,
          reference_range_female: v.diagnostic_test_parameters?.reference_range_female,
          observed_value: v.observed_value,
          is_abnormal: v.is_abnormal,
        }));

        return {
          id: item.id,
          test_id: item.test_id,
          test_name: item.diagnostic_tests?.test_name || "Diagnostic Test",
          test_code: item.diagnostic_tests?.test_code || "TEST",
          price: Number(item.price) || 500,
          specimen_type: item.diagnostic_tests?.specimen_type || "Blood",
          status: item.status,
          parameters: paramsList,
          descriptive_findings: res?.descriptive_findings,
        };
      });

      return {
        id: ord.id,
        organization_id: ord.organization_id,
        order_number: ord.order_number,
        patient_id: ord.patient_id,
        visit_id: ord.visit_id,
        referred_by_doctor_id: ord.referred_by_doctor_id,
        status: ord.status,
        created_at: ord.created_at,
        updated_at: ord.updated_at,
        barcode: barcode || `BC-${ord.order_number}`,
        patient: ord.patients || undefined,
        doctor: ord.doctors || undefined,
        tests,
      };
    });

    return { success: true, data: { orders } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load diagnostic orders";
    return { success: false, error: msg };
  }
}

/**
 * 2. Verify Diagnostic Test Result Action
 * Sets status to VERIFIED and records pathologist audit verification.
 */
export async function verifyDiagnosticReportAction(params: {
  orderId: string;
  orderItemId?: string;
  pathologistRemarks?: string;
}): Promise<ActionResult<{ verified: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("lab.manage");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();

    // Update order status to VERIFIED
    const { error } = await supabase
      .from("diagnostic_orders")
      .update({
        status: "VERIFIED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.orderId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    // If specific item provided, verify it
    if (params.orderItemId) {
      await supabase
        .from("diagnostic_order_items")
        .update({ status: "VERIFIED" })
        .eq("id", params.orderItemId);

      await supabase.from("diagnostic_report_verifications").insert({
        order_item_id: params.orderItemId,
        verified_by: session.userId,
        signature_hash: `SIG-${Date.now()}-${session.userId.slice(0, 8)}`,
        remarks: params.pathologistRemarks || "Verified and authorized by consultant pathologist",
      });
    }

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "VERIFY",
      module: "LAB",
      entityType: "diagnostic_order",
      entityId: params.orderId,
      newValues: {
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        status: "VERIFIED",
      },
    });

    return { success: true, data: { verified: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Report verification failed";
    return { success: false, error: msg };
  }
}


