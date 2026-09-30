import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  LabAnalyzer,
  LabAnalyzerTransmission,
  ParsedAnalyzerMessage,
  AnalyzerWorklistResponse,
} from "@/types/lis-analyzer";
import {
  parseAnalyzerPacket,
  generateASTMWorklistRecord,
  generateHL7WorklistResponse,
} from "./parser";
import { mapAnalyteToParameter, DiagnosticParameterTarget } from "./mapping";
import { computePayloadFingerprint } from "./transport";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Standard unconfigured analyzer device templates (used when provisioning new tenants)
 */
export const STANDARD_ANALYZER_TEMPLATES: Omit<
  LabAnalyzer,
  "id" | "organization_id" | "created_at" | "updated_at"
>[] = [
  {
    name: "Mindray BC-5000 5-Part Auto Hematology Analyzer",
    code: "MINDRAY-BC5000",
    department: "Hematology",
    protocol: "ASTM_1394",
    connection_type: "TCP_IP",
    status: "UNCONFIGURED",
    is_active: true,
  },
  {
    name: "Roche Cobas c311 Clinical Chemistry Analyzer",
    code: "ROCHE-COBAS-C311",
    department: "Biochemistry",
    protocol: "HL7_V2",
    connection_type: "TCP_IP",
    status: "UNCONFIGURED",
    is_active: true,
  },
  {
    name: "Sysmex XN-350 Automated Hematology System",
    code: "SYSMEX-XN350",
    department: "Hematology",
    protocol: "ASTM_1394",
    connection_type: "SERIAL_RS232",
    baud_rate: 9600,
    status: "UNCONFIGURED",
    is_active: true,
  },
  {
    name: "Bio-Rad D-10 Dual Program HbA1c System",
    code: "BIORAD-D10",
    department: "Biochemistry",
    protocol: "ASTM_1394",
    connection_type: "TCP_IP",
    status: "UNCONFIGURED",
    is_active: true,
  },
];

/**
 * 1. Get All Registered Lab Analyzers for Active Tenant
 * Strict production rule: If registry is empty, returns empty array requiring configuration.
 * Never fabricates fake ONLINE status or synthetic network IPs.
 */
export async function getLabAnalyzersAction(): Promise<ActionResult<{ analyzers: LabAnalyzer[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lab_analyzers")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { analyzers: (data || []) as LabAnalyzer[] } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch lab analyzers",
    };
  }
}

/**
 * 2. Get Recent Analyzer Transmissions Feed
 */
export async function getAnalyzerTransmissionsAction(params?: {
  analyzerId?: string;
  barcode?: string;
  limit?: number;
}): Promise<ActionResult<{ transmissions: LabAnalyzerTransmission[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("lab_analyzer_transmissions")
      .select("*, lab_analyzers(name, code)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 30);

    if (params?.analyzerId) query = query.eq("analyzer_id", params.analyzerId);
    if (params?.barcode) query = query.eq("sample_barcode", params.barcode);

    const { data, error } = await query;
    if (error || !data) {
      return { success: true, data: { transmissions: [] } };
    }

    const transmissions: LabAnalyzerTransmission[] = data.map((d: Record<string, unknown>) => {
      const analyzerInfo = d.lab_analyzers as { name?: string; code?: string } | null;
      return {
        id: String(d.id),
        organization_id: String(d.organization_id),
        analyzer_id: String(d.analyzer_id),
        analyzer_name: analyzerInfo?.name || "Analyzer",
        analyzer_code: analyzerInfo?.code || "ANALYZER",
        sample_barcode: String(d.sample_barcode),
        order_id: d.order_id ? String(d.order_id) : undefined,
        raw_message: String(d.raw_message || ""),
        protocol: (d.protocol as LabAnalyzer["protocol"]) || "ASTM_1394",
        message_type: String(d.message_type || "RESULTS"),
        parsed_results: (d.parsed_results as LabAnalyzerTransmission["parsed_results"]) || {
          results: [],
          sample_barcode: String(d.sample_barcode),
          instrument_code: analyzerInfo?.code || "ANALYZER",
        },
        status: (d.status as LabAnalyzerTransmission["status"]) || "PARSED",
        error_message: d.error_message ? String(d.error_message) : undefined,
        is_simulation: Boolean(d.is_simulation),
        created_at: String(d.created_at),
      };
    });

    return { success: true, data: { transmissions } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch transmissions",
    };
  }
}

/**
 * 3. Ingest Analyzer Transmission & Automatically Populate Diagnostic Test Results
 * Production guarantees:
 * - Real row persistence into lab_analyzer_transmissions table with generated UUID.
 * - Strict tenant and analyzer authorization check.
 * - Duplicate transmission deduplication.
 * - Simulation isolation (never touches live clinical tables if isSimulation is true).
 * - Exact analyte-to-parameter mapping (rejects unmapped or ambiguous tests).
 */
export async function ingestAnalyzerTransmissionAction(params: {
  analyzerCode: string;
  rawPacket: string;
  isSimulation?: boolean;
}): Promise<
  ActionResult<{
    transmissionId: string;
    sampleBarcode: string;
    matchedOrderNumber?: string;
    resultsAppliedCount: number;
    panicValuesDetected: number;
    parsedMessage: ParsedAnalyzerMessage;
    isSimulation: boolean;
    unmappedAnalytes: string[];
    isDuplicate?: boolean;
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  await requirePermission("lab:result_entry");

  const isSimulation = Boolean(params.isSimulation);

  try {
    const supabase = await createClient();

    // 1. Authenticate and validate registered analyzer for this organization
    const { data: analyzerRows, error: analyzerErr } = await supabase
      .from("lab_analyzers")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("code", params.analyzerCode)
      .limit(1);

    if (analyzerErr || !analyzerRows || analyzerRows.length === 0) {
      return {
        success: false,
        error: `Analyzer '${params.analyzerCode}' is not registered or authorized for this hospital organization.`,
      };
    }

    const analyzer = analyzerRows[0] as LabAnalyzer;
    if (!analyzer.is_active) {
      return {
        success: false,
        error: `Analyzer '${params.analyzerCode}' is currently deactivated. Contact laboratory administrator.`,
      };
    }

    // 2. Parse analyzer packet & validate checksum
    const parsed = parseAnalyzerPacket(params.rawPacket);
    parsed.is_simulation = isSimulation;

    if (!parsed.results || parsed.results.length === 0) {
      // Record rejected transmission in database
      const { data: rejRow } = await supabase
        .from("lab_analyzer_transmissions")
        .insert({
          organization_id: session.organizationId,
          analyzer_id: analyzer.id,
          sample_barcode: parsed.sample_barcode || "UNKNOWN",
          raw_message: params.rawPacket,
          protocol: parsed.protocol,
          message_type: parsed.message_type,
          parsed_results: parsed,
          status: "REJECTED",
          error_message: "No valid test observation results found in raw analyzer packet.",
          is_simulation: isSimulation,
        })
        .select("id")
        .single();

      return {
        success: false,
        error: "No valid test observation results found in raw analyzer packet.",
        data: rejRow ? { transmissionId: rejRow.id, sampleBarcode: parsed.sample_barcode, resultsAppliedCount: 0, panicValuesDetected: 0, parsedMessage: parsed, isSimulation, unmappedAnalytes: [] } : undefined,
      };
    }

    // Protocol validation check: incoming protocol must match analyzer configuration
    if (parsed.protocol !== analyzer.protocol && analyzer.protocol !== "REST_JSON") {
      return {
        success: false,
        error: `Protocol mismatch: analyzer '${params.analyzerCode}' is configured for ${analyzer.protocol}, but received ${parsed.protocol}.`,
      };
    }

    const barcode = parsed.sample_barcode;

    // 3. Duplicate transmission detection (Idempotency check)
    // Check if an identical transmission was already received in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentTransmissions } = await supabase
      .from("lab_analyzer_transmissions")
      .select("id, status, sample_barcode, raw_message")
      .eq("organization_id", session.organizationId)
      .eq("analyzer_id", analyzer.id)
      .eq("sample_barcode", barcode)
      .gte("created_at", tenMinutesAgo)
      .limit(5);

    const isDuplicate = Boolean(
      recentTransmissions?.some(
        (t) =>
          t.raw_message === params.rawPacket ||
          computePayloadFingerprint(params.analyzerCode, barcode, t.raw_message) ===
            computePayloadFingerprint(params.analyzerCode, barcode, params.rawPacket)
      )
    );

    if (isDuplicate && !isSimulation) {
      const existingTx = recentTransmissions![0];
      return {
        success: true,
        data: {
          transmissionId: existingTx.id,
          sampleBarcode: barcode,
          resultsAppliedCount: 0,
          panicValuesDetected: 0,
          parsedMessage: parsed,
          isSimulation: false,
          unmappedAnalytes: [],
          isDuplicate: true,
        },
      };
    }

    // 4. Initial database transmission record creation (Real UUID persistence)
    const { data: txRow, error: txErr } = await supabase
      .from("lab_analyzer_transmissions")
      .insert({
        organization_id: session.organizationId,
        analyzer_id: analyzer.id,
        sample_barcode: barcode,
        raw_message: params.rawPacket,
        protocol: parsed.protocol,
        message_type: parsed.message_type,
        parsed_results: parsed,
        status: "PARSED",
        is_simulation: isSimulation,
      })
      .select("id")
      .single();

    if (txErr || !txRow) {
      return {
        success: false,
        error: `Failed to persist analyzer transmission record: ${txErr?.message || "Database insert error"}`,
      };
    }

    const transmissionId = txRow.id;

    // 5. Order & barcode resolution
    let matchedOrderId: string | null = null;
    let matchedOrderNumber: string | null = null;
    let targetOrderItemId: string | null = null;

    // Search by sample_collections.barcode
    const { data: sampleData } = await supabase
      .from("sample_collections")
      .select("order_item_id, diagnostic_order_items(id, order_id, diagnostic_orders(id, order_number))")
      .eq("barcode", barcode)
      .limit(1);

    if (sampleData && sampleData.length > 0) {
      targetOrderItemId = sampleData[0].order_item_id;
      const orderItem = sampleData[0].diagnostic_order_items as unknown as {
        id: string;
        order_id: string;
        diagnostic_orders?: { id: string; order_number: string };
      } | null;
      matchedOrderId = orderItem?.order_id || null;
      matchedOrderNumber = orderItem?.diagnostic_orders?.order_number || null;
    }

    // Fallback: search by diagnostic_orders.order_number
    if (!matchedOrderId) {
      const { data: orderData } = await supabase
        .from("diagnostic_orders")
        .select("id, order_number, diagnostic_order_items(id)")
        .eq("organization_id", session.organizationId)
        .eq("order_number", barcode)
        .limit(1);

      if (orderData && orderData.length > 0) {
        matchedOrderId = orderData[0].id;
        matchedOrderNumber = orderData[0].order_number;
        const items = orderData[0].diagnostic_order_items as Array<{ id: string }> | null;
        if (items && items.length > 0) {
          targetOrderItemId = items[0].id;
        }
      }
    }

    // Count panic values
    let panicCount = 0;
    parsed.results.forEach((r) => {
      if (r.abnormal_flag === "CRITICAL_HIGH" || r.abnormal_flag === "CRITICAL_LOW") {
        panicCount++;
      }
    });

    let resultsAppliedCount = 0;
    const unmappedAnalytes: string[] = [];

    // 6. Clinical result application (Only when NOT in simulation mode and order matched)
    if (!isSimulation && targetOrderItemId) {
      // Find or create diagnostic_results record
      const { data: existingResult } = await supabase
        .from("diagnostic_results")
        .select("id")
        .eq("order_item_id", targetOrderItemId)
        .limit(1);

      let resultId = existingResult && existingResult.length > 0 ? existingResult[0].id : null;

      if (!resultId) {
        const { data: newResult, error: createResultErr } = await supabase
          .from("diagnostic_results")
          .insert({
            order_item_id: targetOrderItemId,
            descriptive_findings: `[AUTO-LIS] Ingested from ${params.analyzerCode} (${parsed.protocol}) on ${new Date().toISOString()}`,
            technician_id: session.userId,
          })
          .select("id")
          .single();

        if (!createResultErr && newResult) {
          resultId = newResult.id;
        }
      }

      if (resultId) {
        // Fetch test parameters for this test
        const { data: orderItemWithTest } = await supabase
          .from("diagnostic_order_items")
          .select("test_id, diagnostic_tests(id, diagnostic_test_parameters(*))")
          .eq("id", targetOrderItemId)
          .single();

        const diagTest = orderItemWithTest?.diagnostic_tests as unknown as {
          id: string;
          diagnostic_test_parameters?: DiagnosticParameterTarget[];
        } | null;

        const parameters = diagTest?.diagnostic_test_parameters || [];

        for (const res of parsed.results) {
          // Exact parameter mapping layer
          const match = mapAnalyteToParameter(res.analyte_code, parameters);

          if (match.status === "MATCHED") {
            const isAbnormal = res.abnormal_flag !== "NORMAL";
            await supabase.from("diagnostic_result_values").upsert(
              {
                result_id: resultId,
                parameter_id: match.parameter.id,
                observed_value: res.observed_value,
                is_abnormal: isAbnormal,
              },
              { onConflict: "result_id,parameter_id" }
            );
            resultsAppliedCount++;
          } else {
            unmappedAnalytes.push(res.analyte_code);
          }
        }

        // Update order status to PROCESSING
        if (matchedOrderId) {
          await supabase
            .from("diagnostic_orders")
            .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
            .eq("id", matchedOrderId);
        }
      }
    }

    // 7. Update transmission status in database
    const finalStatus: LabAnalyzerTransmission["status"] = isSimulation
      ? "PARSED"
      : targetOrderItemId && resultsAppliedCount > 0
      ? "APPLIED"
      : targetOrderItemId
      ? "MATCHED"
      : "RECEIVED";

    await supabase
      .from("lab_analyzer_transmissions")
      .update({
        order_id: matchedOrderId || null,
        status: finalStatus,
        error_message:
          unmappedAnalytes.length > 0
            ? `Unmapped analytes: ${unmappedAnalytes.join(", ")}`
            : undefined,
      })
      .eq("id", transmissionId);

    // 8. Record audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      module: "LAB",
      entityType: "LAB_ANALYZER_INGEST",
      entityId: matchedOrderId || barcode,
      action: isSimulation ? "VERIFY" : "CREATE",
      newValues: {
        transmission_id: transmissionId,
        analyzer_code: params.analyzerCode,
        barcode,
        protocol: parsed.protocol,
        results_count: parsed.results.length,
        results_applied: resultsAppliedCount,
        panic_count: panicCount,
        is_simulation: isSimulation,
        unmapped_count: unmappedAnalytes.length,
      },
    });

    return {
      success: true,
      data: {
        transmissionId,
        sampleBarcode: barcode,
        matchedOrderNumber: matchedOrderNumber || undefined,
        resultsAppliedCount,
        panicValuesDetected: panicCount,
        parsedMessage: parsed,
        isSimulation,
        unmappedAnalytes,
        isDuplicate: false,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to ingest analyzer transmission",
    };
  }
}

/**
 * 4. Bi-directional Analyzer Host Query Worklist Handler
 * Production rule: When an order is not found for the requested sample barcode,
 * returns a truthful NOT_FOUND error. Never fabricates fake patient charts in production.
 */
export async function queryAnalyzerWorklistAction(params: {
  sampleBarcode: string;
  analyzerCode: string;
}): Promise<ActionResult<{ rawResponse: string; worklist: AnalyzerWorklistResponse }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    // Look up order by barcode or order_number
    let order: {
      id: string;
      order_number: string;
      patients: { patient_code: string; full_name: string; gender: string; date_of_birth?: string };
      diagnostic_order_items: Array<{
        diagnostic_tests: { test_code: string; test_name: string };
      }>;
    } | null = null;

    const { data: sampleData } = await supabase
      .from("sample_collections")
      .select(
        "diagnostic_order_items(diagnostic_orders(id, order_number, patients(patient_code, full_name, gender, date_of_birth), diagnostic_order_items(diagnostic_tests(test_code, test_name))))"
      )
      .eq("barcode", params.sampleBarcode)
      .limit(1);

    if (sampleData && sampleData.length > 0) {
      const item = sampleData[0].diagnostic_order_items as unknown as {
        diagnostic_orders: {
          id: string;
          order_number: string;
          patients: { patient_code: string; full_name: string; gender: string; date_of_birth?: string };
          diagnostic_order_items: Array<{
            diagnostic_tests: { test_code: string; test_name: string };
          }>;
        };
      };
      order = item.diagnostic_orders;
    }

    if (!order) {
      // Truthful rejection: unknown barcode cannot be fulfilled
      return {
        success: false,
        error: `Worklist order not found for sample barcode '${params.sampleBarcode}'. Ensure patient has a confirmed laboratory order and specimen collection.`,
      };
    }

    const worklist: AnalyzerWorklistResponse = {
      sample_barcode: params.sampleBarcode,
      order_number: order.order_number,
      patient_code: order.patients.patient_code,
      patient_name: order.patients.full_name,
      gender: order.patients.gender,
      ordered_tests: order.diagnostic_order_items.map((oi) => ({
        test_code: oi.diagnostic_tests.test_code,
        test_name: oi.diagnostic_tests.test_name,
        analyte_codes: [],
      })),
    };

    const rawResponse = params.analyzerCode.includes("COBAS")
      ? generateHL7WorklistResponse(worklist)
      : generateASTMWorklistRecord(worklist);

    return { success: true, data: { rawResponse, worklist } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to query analyzer worklist",
    };
  }
}

/**
 * 5. Simulate Analyzer Run & Transmit Packet (QA & Technician Verification Mode)
 * Strictly isolated: Sets isSimulation: true so live patient clinical tables are never mutated.
 */
export async function simulateAnalyzerTransmissionAction(params: {
  analyzerCode: string;
  sampleBarcode: string;
  testType?: "CBC" | "BIOCHEMISTRY" | "ELECTROLYTES";
}): Promise<
  ActionResult<{
    rawPacket: string;
    ingestResult: {
      transmissionId: string;
      sampleBarcode: string;
      matchedOrderNumber?: string;
      resultsAppliedCount: number;
      panicValuesDetected: number;
      parsedMessage: ParsedAnalyzerMessage;
      isSimulation: boolean;
      unmappedAnalytes: string[];
    };
  }>
> {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const nowIso = new Date().toISOString();
  let rawPacket = "";

  if (params.analyzerCode.includes("COBAS") || params.testType === "BIOCHEMISTRY") {
    // Generate HL7 v2.5.1 ORU^R01 packet for Biochemistry (Cobas c311 style)
    rawPacket = [
      `MSH|^~\\&|COBAS_C311|ROCHE_LAB|OHMS_LIS|ONNESHA_HOSPITAL|${timestamp}||ORU^R01|MSG${Date.now()}|P|2.5.1`,
      `PID|1||P-2026-PAT||Rahman^Mohammad||19850612|M`,
      `OBR|1|ORD-${params.sampleBarcode}|${params.sampleBarcode}|LFT^Liver Function & Biochemistry|||${timestamp}`,
      `OBX|1|NM|CREA^Serum Creatinine^LN||0.95|mg/dL|0.60-1.20|N|||F|||${nowIso}`,
      `OBX|2|NM|GLU_FAST^Fasting Blood Glucose^LN||104|mg/dL|70-100|H|||F|||${nowIso}`,
      `OBX|3|NM|SGPT_ALT^Alanine Aminotransferase (ALT/SGPT)^LN||28|U/L|0-45|N|||F|||${nowIso}`,
      `OBX|4|NM|SGOT_AST^Aspartate Aminotransferase (AST/SGOT)^LN||24|U/L|0-35|N|||F|||${nowIso}`,
      `OBX|5|NM|UREA^Blood Urea^LN||32|mg/dL|15-45|N|||F|||${nowIso}`,
    ].join("\r\n");
  } else {
    // Generate ASTM E1394 packet for Hematology (Mindray BC-5000 / Sysmex style)
    rawPacket = [
      `H|\\^&|||${params.analyzerCode}^v2.1|||||||P|1|${timestamp}`,
      `P|1||P-2026-PAT||Akter^Nasrin||19920815|F`,
      `O|1|${params.sampleBarcode}||^^^CBC|R|${timestamp}|||||A`,
      `R|1|^^^WBC|7.4|10^3/uL|4.0-11.0|N||F||TECH01|${nowIso}`,
      `R|2|^^^RBC|4.65|10^6/uL|3.80-5.20|N||F||TECH01|${nowIso}`,
      `R|3|^^^HGB|12.8|g/dL|11.5-15.5|N||F||TECH01|${nowIso}`,
      `R|4|^^^HCT|38.2|%|36.0-46.0|N||F||TECH01|${nowIso}`,
      `R|5|^^^PLT|235|10^3/uL|150-450|N||F||TECH01|${nowIso}`,
      `R|6|^^^MCV|82.1|fL|80.0-100.0|N||F||TECH01|${nowIso}`,
      `R|7|^^^MCH|27.5|pg|27.0-33.0|N||F||TECH01|${nowIso}`,
      `R|8|^^^MCHC|33.5|g/dL|32.0-36.0|N||F||TECH01|${nowIso}`,
      `L|1|N`,
    ].join("\r\n");
  }

  // Execute ingestion with isSimulation: true to prevent clinical database contamination
  const ingestRes = await ingestAnalyzerTransmissionAction({
    analyzerCode: params.analyzerCode,
    rawPacket,
    isSimulation: true,
  });

  if (!ingestRes.success || !ingestRes.data) {
    return { success: false, error: ingestRes.error || "Simulation ingestion failed" };
  }

  return {
    success: true,
    data: {
      rawPacket,
      ingestResult: ingestRes.data,
    },
  };
}
