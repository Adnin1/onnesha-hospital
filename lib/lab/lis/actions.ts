import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  LabAnalyzer,
  LabAnalyzerTransmission,
  ParsedAnalyzerMessage,
  AnalyzerWorklistResponse,
  LabCriticalAlert,
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
      return { success: false, error: `Failed to fetch lab analyzers: ${error.message}` };
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
 * Strict production rule: Database errors surface explicitly and are NEVER masked as empty success.
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
    if (error) {
      return { success: false, error: `Failed to fetch transmissions: ${error.message}` };
    }

    if (!data) {
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
        payload_fingerprint: d.payload_fingerprint ? String(d.payload_fingerprint) : undefined,
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
 * - Database-level idempotency via cryptographic SHA-256 fingerprint and UNIQUE constraint.
 * - Atomic transactional execution (RPC or rollbacked unit of work) to prevent partial writes.
 * - Server-side simulation permission gating (non-admins cannot execute simulation in production).
 * - Exact analyte-to-parameter mapping (rejects unmapped or ambiguous tests).
 * - Durable persistence of panic/critical values in lab_critical_alerts.
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

  // Server-side simulation permission & environment gating
  const isSimulation = Boolean(params.isSimulation);
  if (isSimulation) {
    const isProd = process.env.NODE_ENV === "production";
    const hasAdminOrSimPerm =
      session.roles?.includes("admin") ||
      session.roles?.includes("hospital_administrator") ||
      session.roles?.includes("super_admin");
    if (isProd && !hasAdminOrSimPerm) {
      return {
        success: false,
        error: "Unauthorized: Simulation execution in production requires administrative role.",
      };
    }
  }

  try {
    const supabase = await createClient();

    // 1. Authenticate and validate registered analyzer for this organization
    const { data: analyzerRows, error: analyzerErr } = await supabase
      .from("lab_analyzers")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("code", params.analyzerCode)
      .limit(1);

    if (analyzerErr) {
      return {
        success: false,
        error: `Database error validating analyzer: ${analyzerErr.message}`,
      };
    }

    if (!analyzerRows || analyzerRows.length === 0) {
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

    const barcode = parsed.sample_barcode || "UNKNOWN";
    const fingerprint = computePayloadFingerprint(params.analyzerCode, barcode, params.rawPacket);

    if (!parsed.results || parsed.results.length === 0) {
      // Record rejected transmission in database
      const { data: rejRow, error: rejErr } = await supabase
        .from("lab_analyzer_transmissions")
        .insert({
          organization_id: session.organizationId,
          analyzer_id: analyzer.id,
          sample_barcode: barcode,
          raw_message: params.rawPacket,
          protocol: parsed.protocol,
          message_type: parsed.message_type,
          parsed_results: parsed,
          payload_fingerprint: fingerprint,
          status: "REJECTED",
          error_message: "No valid test observation results found in raw analyzer packet.",
          is_simulation: isSimulation,
        })
        .select("id")
        .single();

      if (rejErr) {
        // If rejected row is duplicate, handle safely
        if (rejErr.code === "23505") {
          return {
            success: false,
            error: "Duplicate transmission rejected.",
          };
        }
      }

      return {
        success: false,
        error: "No valid test observation results found in raw analyzer packet.",
        data: rejRow
          ? {
              transmissionId: rejRow.id,
              sampleBarcode: barcode,
              resultsAppliedCount: 0,
              panicValuesDetected: 0,
              parsedMessage: parsed,
              isSimulation,
              unmappedAnalytes: [],
            }
          : undefined,
      };
    }

    // Protocol validation check: incoming protocol must match analyzer configuration
    if (parsed.protocol !== analyzer.protocol && analyzer.protocol !== "REST_JSON") {
      return {
        success: false,
        error: `Protocol mismatch: analyzer '${params.analyzerCode}' is configured for ${analyzer.protocol}, but received ${parsed.protocol}.`,
      };
    }

    // 3. Order & barcode resolution
    let matchedOrderId: string | null = null;
    let matchedOrderNumber: string | null = null;
    let targetOrderItemId: string | null = null;

    // Search by sample_collections.barcode
    const { data: sampleData, error: sampleErr } = await supabase
      .from("sample_collections")
      .select("order_item_id, diagnostic_order_items(id, order_id, diagnostic_orders(id, order_number))")
      .eq("barcode", barcode)
      .limit(1);

    if (sampleErr) {
      return {
        success: false,
        error: `Database error during sample lookup: ${sampleErr.message}`,
      };
    }

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
      const { data: orderData, error: orderErr } = await supabase
        .from("diagnostic_orders")
        .select("id, order_number, diagnostic_order_items(id)")
        .eq("organization_id", session.organizationId)
        .eq("order_number", barcode)
        .limit(1);

      if (orderErr) {
        return {
          success: false,
          error: `Database error during order lookup: ${orderErr.message}`,
        };
      }

      if (orderData && orderData.length > 0) {
        matchedOrderId = orderData[0].id;
        matchedOrderNumber = orderData[0].order_number;
        const items = orderData[0].diagnostic_order_items as Array<{ id: string }> | null;
        if (items && items.length > 0) {
          targetOrderItemId = items[0].id;
        }
      }
    }

    // 4. Map test parameters and collect panic values
    const resultValues: Array<{
      parameter_id: string;
      observed_value: string;
      is_abnormal: boolean;
    }> = [];
    const panicAlerts: Array<{
      analyte_code: string;
      observed_value: string;
      abnormal_flag: string;
    }> = [];
    const unmappedAnalytes: string[] = [];

    // Fetch test parameters if clinical order item is matched
    if (!isSimulation && targetOrderItemId) {
      const { data: orderItemWithTest, error: paramErr } = await supabase
        .from("diagnostic_order_items")
        .select("test_id, diagnostic_tests(id, diagnostic_test_parameters(*))")
        .eq("id", targetOrderItemId)
        .single();

      if (paramErr) {
        return {
          success: false,
          error: `Database error fetching test parameters: ${paramErr.message}`,
        };
      }

      const diagTest = orderItemWithTest?.diagnostic_tests as unknown as {
        id: string;
        diagnostic_test_parameters?: DiagnosticParameterTarget[];
      } | null;

      const parameters = diagTest?.diagnostic_test_parameters || [];

      for (const res of parsed.results) {
        if (res.abnormal_flag === "CRITICAL_HIGH" || res.abnormal_flag === "CRITICAL_LOW") {
          panicAlerts.push({
            analyte_code: res.analyte_code,
            observed_value: res.observed_value,
            abnormal_flag: res.abnormal_flag,
          });
        }

        const match = mapAnalyteToParameter(res.analyte_code, parameters);
        if (match.status === "MATCHED") {
          const isAbnormal = res.abnormal_flag !== "NORMAL";
          resultValues.push({
            parameter_id: match.parameter.id,
            observed_value: res.observed_value,
            is_abnormal: isAbnormal,
          });
        } else {
          unmappedAnalytes.push(res.analyte_code);
        }
      }
    } else {
      // In simulation mode or unmatched order, collect panic flags directly
      parsed.results.forEach((res) => {
        if (res.abnormal_flag === "CRITICAL_HIGH" || res.abnormal_flag === "CRITICAL_LOW") {
          panicAlerts.push({
            analyte_code: res.analyte_code,
            observed_value: res.observed_value,
            abnormal_flag: res.abnormal_flag,
          });
        }
      });
    }

    // 5. Atomic Transactional Ingestion RPC
    // Tries to execute the single-transaction RPC function
    let transmissionId: string;
    let resultsAppliedCount = 0;
    let panicCount = panicAlerts.length;
    let isDuplicate = false;

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "ingest_analyzer_transmission_atomic",
      {
        p_organization_id: session.organizationId,
        p_analyzer_id: analyzer.id,
        p_sample_barcode: barcode,
        p_raw_message: params.rawPacket,
        p_protocol: parsed.protocol,
        p_message_type: parsed.message_type,
        p_parsed_results: parsed,
        p_payload_fingerprint: fingerprint,
        p_is_simulation: isSimulation,
        p_order_id: matchedOrderId,
        p_order_item_id: targetOrderItemId,
        p_technician_id: session.userId,
        p_result_values: isSimulation ? [] : resultValues,
        p_panic_alerts: isSimulation ? [] : panicAlerts,
      }
    );

    if (!rpcErr && rpcData && typeof rpcData === "object") {
      const resp = rpcData as {
        success: boolean;
        is_duplicate: boolean;
        transmission_id: string;
        results_applied: number;
        panic_count: number;
      };

      transmissionId = resp.transmission_id;
      isDuplicate = Boolean(resp.is_duplicate);
      resultsAppliedCount = resp.results_applied || 0;
      panicCount = resp.panic_count || panicAlerts.length;

      if (isDuplicate) {
        return {
          success: true,
          data: {
            transmissionId,
            sampleBarcode: barcode,
            resultsAppliedCount: 0,
            panicValuesDetected: 0,
            parsedMessage: parsed,
            isSimulation,
            unmappedAnalytes: [],
            isDuplicate: true,
          },
        };
      }
    } else {
      // Fail closed if RPC function is missing or returns error
      const errDetail = rpcErr ? rpcErr.message : "Empty response from atomic ingestion procedure";
      console.error("[ingestAnalyzerTransmissionAction] Atomic RPC failed — failing closed:", errDetail);
      return {
        success: false,
        error: `Atomic transmission ingestion failed: ${errDetail}`,
      };
    }

    if (matchedOrderId && !isSimulation) {
      await supabase
        .from("diagnostic_orders")
        .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
        .eq("id", matchedOrderId)
        .eq("organization_id", session.organizationId);
    }

    // 6. Record Forensic Audit Log
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
        payload_fingerprint: fingerprint,
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

    let order: {
      id: string;
      order_number: string;
      patients: { patient_code: string; full_name: string; gender: string; date_of_birth?: string };
      diagnostic_order_items: Array<{
        diagnostic_tests: { test_code: string; test_name: string };
      }>;
    } | null = null;

    const { data: sampleData, error: sampleErr } = await supabase
      .from("sample_collections")
      .select(
        "diagnostic_order_items(diagnostic_orders(id, order_number, patients(patient_code, full_name, gender, date_of_birth), diagnostic_order_items(diagnostic_tests(test_code, test_name))))"
      )
      .eq("barcode", params.sampleBarcode)
      .limit(1);

    if (sampleErr) {
      return {
        success: false,
        error: `Database query failed during sample lookup: ${sampleErr.message}`,
      };
    }

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

/**
 * 6. Get Persistent Lab Critical / Panic Alerts
 */
export async function getPendingCriticalAlertsAction(params?: {
  limit?: number;
}): Promise<ActionResult<{ alerts: LabCriticalAlert[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lab_critical_alerts")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("status", "PENDING_ACK")
      .order("detected_at", { ascending: false })
      .limit(params?.limit || 20);

    if (error) {
      return { success: false, error: `Failed to fetch critical alerts: ${error.message}` };
    }

    return { success: true, data: { alerts: (data || []) as LabCriticalAlert[] } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch critical alerts",
    };
  }
}

/**
 * 7. Acknowledge Lab Critical Alert (Physician / Pathologist Sign-Off)
 */
export async function acknowledgeCriticalAlertAction(params: {
  alertId: string;
  clinicalNotes?: string;
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  await requirePermission("lab:result_entry");

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("lab_critical_alerts")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_by: session.userId,
        acknowledged_at: new Date().toISOString(),
        clinical_notes: params.clinicalNotes || "Acknowledged by clinical staff.",
      })
      .eq("id", params.alertId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: `Failed to acknowledge alert: ${error.message}` };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      module: "LAB",
      entityType: "CRITICAL_ALERT",
      entityId: params.alertId,
      action: "VERIFY",
      newValues: {
        alert_id: params.alertId,
        clinical_notes: params.clinicalNotes,
        acknowledged_at: new Date().toISOString(),
      },
    });

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to acknowledge alert",
    };
  }
}
