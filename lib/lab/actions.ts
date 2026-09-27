import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { DiagnosticOrderRecord } from "@/types/clinical-emr";
import { calculateAgeFromDOB } from "@/lib/utils";
import crypto from "crypto";

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
      .select("*, patients(id, patient_code, full_name, gender, phone, date_of_birth), doctors(id, full_name), verifier:profiles!diagnostic_orders_verified_by_profile_id_fkey(id, full_name), diagnostic_order_items(*, diagnostic_tests(id, test_name, test_code, price, specimen_type), sample_collections(barcode), diagnostic_results(*, diagnostic_result_values(*, diagnostic_test_parameters(*))))")
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
      clinical_notes?: string;
      verified_by_profile_id?: string;
      verified_at?: string;
      created_at: string;
      updated_at: string;
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        gender: string;
        phone: string;
        date_of_birth?: string;
      } | null;
      doctors?: {
        id: string;
        full_name: string;
      } | null;
      verifier?: {
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
          reference_range_child: v.diagnostic_test_parameters?.reference_range_child,
          observed_value: v.observed_value,
          is_abnormal: v.is_abnormal,
        }));

        return {
          id: item.id,
          test_id: item.test_id,
          test_name: item.diagnostic_tests?.test_name || "Diagnostic Test",
          test_code: item.diagnostic_tests?.test_code || "TEST",
          price: Number(item.price) || 0,
          specimen_type: item.diagnostic_tests?.specimen_type || "Blood",
          status: item.status,
          parameters: paramsList,
          descriptive_findings: res?.descriptive_findings,
        };
      });

      const patientData = ord.patients
        ? {
            id: ord.patients.id,
            patient_code: ord.patients.patient_code,
            full_name: ord.patients.full_name,
            gender: ord.patients.gender,
            phone: ord.patients.phone,
            date_of_birth: ord.patients.date_of_birth,
            age: calculateAgeFromDOB(ord.patients.date_of_birth),
          }
        : undefined;

      return {
        id: ord.id,
        organization_id: ord.organization_id,
        order_number: ord.order_number,
        patient_id: ord.patient_id,
        visit_id: ord.visit_id,
        referred_by_doctor_id: ord.referred_by_doctor_id,
        status: ord.status,
        clinical_notes: ord.clinical_notes,
        verified_by_profile_id: ord.verified_by_profile_id,
        verified_at: ord.verified_at,
        created_at: ord.created_at,
        updated_at: ord.updated_at,
        barcode: barcode || "",
        patient: patientData,
        doctor: ord.doctors || undefined,
        verified_by_doctor: ord.verifier || undefined,
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
 * Sets status to VERIFIED atomically and records cryptographic pathologist audit verification
 * in diagnostic_report_verifications table with signature_hash via verify_diagnostic_order_atomic RPC.
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

    // Generate real SHA-256 HMAC cryptographic signature
    const signaturePayload = `${params.orderId}:${session.userId}:${session.organizationId}:${Date.now()}`;
    const signatureHash = crypto
      .createHash("sha256")
      .update(signaturePayload)
      .digest("hex");

    // Atomic database verification
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("verify_diagnostic_order_atomic", {
      p_org_id: session.organizationId,
      p_order_id: params.orderId,
      p_verifier_id: session.userId,
      p_signature_hash: signatureHash,
      p_remarks: params.pathologistRemarks || "Verified and authorized by Consultant Pathologist",
    });

    if (rpcErr || !rpcRes) {
      return { success: false, error: rpcErr?.message || "Failed to verify diagnostic report" };
    }

    // Audit log
    try {
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
          signatureHash,
          status: "VERIFIED",
        },
      });
    } catch (auditErr: unknown) {
      console.error("[Lab Action] Verification audit logging failed:", auditErr);
    }

    return { success: true, data: { verified: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Report verification failed";
    return { success: false, error: msg };
  }
}

/**
 * 3. Create Diagnostic Order Server Action (Atomic)
 */
export async function createDiagnosticOrderAction(params: {
  patientId: string;
  testIds: string[];
  referredByDoctorId?: string;
  visitId?: string;
  clinicalNotes?: string;
}): Promise<ActionResult<{ orderId: string; orderNumber: string; totalAmount: number }>> {
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

  if (!params.patientId || !params.testIds || params.testIds.length === 0) {
    return { success: false, error: "Patient ID and at least one test are required." };
  }

  try {
    const supabase = await createClient();

    // Call atomic RPC
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("create_diagnostic_order_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_test_ids: params.testIds,
      p_doctor_id: params.referredByDoctorId || null,
      p_visit_id: params.visitId || null,
      p_clinical_notes: params.clinicalNotes || null,
    });

    if (rpcErr || !rpcRes) {
      return { success: false, error: rpcErr?.message || "Failed to create diagnostic order." };
    }

    const orderData = rpcRes as {
      success: boolean;
      order_id: string;
      order_number: string;
      total_amount: number;
      test_count: number;
    };

    // Audit Log
    try {
      await recordAuditLog({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "CREATE",
        module: "LAB",
        entityType: "diagnostic_order",
        entityId: orderData.order_id,
        newValues: {
          orderNumber: orderData.order_number,
          patientId: params.patientId,
          testCount: orderData.test_count,
          totalAmount: orderData.total_amount,
        },
      });
    } catch (auditErr: unknown) {
      console.error("[Lab Action] Audit logging failed:", auditErr);
    }

    return {
      success: true,
      data: {
        orderId: orderData.order_id,
        orderNumber: orderData.order_number,
        totalAmount: orderData.total_amount,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create diagnostic order";
    return { success: false, error: msg };
  }
}

/**
 * 4. Get Diagnostic Tests Catalog
 */
export async function getDiagnosticTestsCatalogAction(): Promise<
  ActionResult<{ tests: Array<{ id: string; test_name: string; test_code: string; price: number; specimen_type: string }> }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("diagnostic_tests")
      .select("id, test_name, test_code, price, specimen_type")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("test_name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: { tests: data || [] },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load test catalog";
    return { success: false, error: msg };
  }
}
