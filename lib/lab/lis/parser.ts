import type {
  ParsedAnalyzerMessage,
  ParsedAnalyteResult,
  AbnormalitySeverity,
  AnalyzerWorklistResponse,
} from "@/types/lis-analyzer";

/**
 * ASTM E1381 / E1394 Standard Control Characters
 */
export const ASTM_CTRL = {
  STX: "\x02",
  ETX: "\x03",
  EOT: "\x04",
  ENQ: "\x05",
  ACK: "\x06",
  NAK: "\x15",
  CR: "\r",
  LF: "\n",
  ETB: "\x17",
};

/**
 * Calculates ASTM 2-digit Hex Checksum (Modulo 256 sum of all characters in frame after STX up to and including ETX/ETB)
 */
export function calculateASTMChecksum(frameContent: string): string {
  let sum = 0;
  for (let i = 0; i < frameContent.length; i++) {
    sum = (sum + frameContent.charCodeAt(i)) & 0xff;
  }
  return sum.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Normalizes abnormality flags to standard AbnormalitySeverity
 */
export function normalizeAbnormalFlag(flag: string | undefined): AbnormalitySeverity {
  if (!flag) return "NORMAL";
  const upper = flag.trim().toUpperCase();
  if (upper === "HH" || upper === "CH" || upper === "CRITICAL_HIGH" || upper === "PANIC_HIGH") {
    return "CRITICAL_HIGH";
  }
  if (upper === "LL" || upper === "CL" || upper === "CRITICAL_LOW" || upper === "PANIC_LOW") {
    return "CRITICAL_LOW";
  }
  if (upper === "H" || upper === "HIGH") {
    return "HIGH";
  }
  if (upper === "L" || upper === "LOW") {
    return "LOW";
  }
  return "NORMAL";
}

/**
 * Parses raw ASTM E1381/E1394 transmission packet into structured observations
 */
export function parseASTM1394Message(raw: string): ParsedAnalyzerMessage {
  const lines = raw.split(/\r\n|\r|\n/);
  const results: ParsedAnalyteResult[] = [];
  let sampleBarcode = "";
  let patientIdentifier = "";
  let instrumentCode = "ASTM_ANALYZER";
  let checksumValid = true;
  let rawFrameCount = 0;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    rawFrameCount++;

    // Check if line contains ASTM frame markers [STX]<frame_num><data>[ETX]<checksum>[CR][LF]
    if (line.includes(ASTM_CTRL.STX)) {
      const stxIdx = line.indexOf(ASTM_CTRL.STX);
      const etxIdx = line.lastIndexOf(ASTM_CTRL.ETX);
      if (etxIdx > stxIdx) {
        const frameData = line.substring(stxIdx + 1, etxIdx + 1);
        const expectedChecksum = line.substring(etxIdx + 1, etxIdx + 3);
        const computedChecksum = calculateASTMChecksum(frameData);
        if (expectedChecksum && expectedChecksum.toUpperCase() !== computedChecksum) {
          checksumValid = false;
        }
        line = frameData.substring(1, frameData.length - 1); // remove frame number and ETX
      } else {
        line = line.replace(/[\x00-\x1F]/g, "");
      }
    } else {
      line = line.replace(/[\x00-\x1F]/g, "");
    }

    const fields = line.split("|");
    const recordType = fields[0]?.trim();

    if (recordType === "H") {
      // Header Record: H|\^&|||AnalyzerName^Version^Model|||||||P|1
      const senderField = fields[4] || fields[3] || "";
      if (senderField) {
        instrumentCode = senderField.split("^")[0] || instrumentCode;
      }
    } else if (recordType === "P") {
      // Patient Record: P|1||PatientID||LastName^FirstName||DOB|Gender
      patientIdentifier = fields[3] || fields[2] || "";
    } else if (recordType === "O") {
      // Order Record: O|1|SampleBarcode||^^^TestID|R|DateTime|||||A
      sampleBarcode = fields[2] || fields[3] || sampleBarcode;
    } else if (recordType === "R") {
      // Result Record: R|1|^^^AnalyteCode|ObservedValue|Units|RefRange|AbnormalFlag||Status||Technician|DateTime
      const testIdComp = fields[2]?.split("^") || [];
      const analyteCode = testIdComp[testIdComp.length - 1] || testIdComp[0] || "UNKNOWN";
      const observedValue = fields[3] || "";
      const unit = fields[4] || "";
      const refRange = fields[5] || "";
      const abnormalFlag = normalizeAbnormalFlag(fields[6]);
      const testTimestamp = fields[12] || new Date().toISOString();

      const numVal = parseFloat(observedValue);
      results.push({
        analyte_code: analyteCode.trim().toUpperCase(),
        observed_value: observedValue.trim(),
        numeric_value: !isNaN(numVal) ? numVal : undefined,
        unit: unit.trim(),
        reference_range: refRange.trim(),
        abnormal_flag: abnormalFlag,
        test_timestamp: testTimestamp.trim(),
      });
    }
  }

  return {
    protocol: "ASTM_1394",
    message_type: "ASTM_RESULT",
    sample_barcode: sampleBarcode || "SAMP-UNSPECIFIED",
    patient_identifier: patientIdentifier || undefined,
    instrument_code: instrumentCode,
    results,
    checksum_valid: checksumValid,
    raw_frame_count: rawFrameCount,
  };
}

/**
 * Parses HL7 v2.x (ORU^R01) message into structured observations
 */
export function parseHL7V2Message(raw: string): ParsedAnalyzerMessage {
  const segments = raw.split(/\r\n|\r|\n/);
  const results: ParsedAnalyteResult[] = [];
  let sampleBarcode = "";
  let patientIdentifier = "";
  let instrumentCode = "HL7_ANALYZER";

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const fields = trimmed.split("|");
    const segmentName = fields[0]?.toUpperCase();

    if (segmentName === "MSH") {
      // MSH|^~\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|DateTime||ORU^R01|MsgCtrlId|P|2.5.1
      instrumentCode = fields[2] || fields[3] || instrumentCode;
    } else if (segmentName === "PID") {
      // PID|1||PatientId^^^Facility||LastName^FirstName
      patientIdentifier = fields[3]?.split("^")[0] || "";
    } else if (segmentName === "OBR") {
      // OBR|1|PlacerOrderNumber|FillerOrderNumber(SampleBarcode)|TestCode^TestName
      sampleBarcode = fields[3] || fields[2] || sampleBarcode;
      if (sampleBarcode.includes("^")) {
        sampleBarcode = sampleBarcode.split("^")[0];
      }
    } else if (segmentName === "OBX") {
      // OBX|1|NM|AnalyteCode^AnalyteName^LN||ObservedValue|Units|RefRange|AbnormalFlag|||F
      const idParts = fields[3]?.split("^") || [];
      const analyteCode = idParts[0] || idParts[1] || "ANALYTE";
      const analyteName = idParts[1] || undefined;
      const observedValue = fields[5] || "";
      const unit = fields[6] || "";
      const refRange = fields[7] || "";
      const abnormalFlag = normalizeAbnormalFlag(fields[8]);
      const testTimestamp = fields[14] || new Date().toISOString();

      const numVal = parseFloat(observedValue);
      results.push({
        analyte_code: analyteCode.trim().toUpperCase(),
        analyte_name: analyteName,
        observed_value: observedValue.trim(),
        numeric_value: !isNaN(numVal) ? numVal : undefined,
        unit: unit.trim(),
        reference_range: refRange.trim(),
        abnormal_flag: abnormalFlag,
        test_timestamp: testTimestamp.trim(),
      });
    }
  }

  return {
    protocol: "HL7_V2",
    message_type: "RESULTS_ORU",
    sample_barcode: sampleBarcode || "SAMP-UNSPECIFIED",
    patient_identifier: patientIdentifier || undefined,
    instrument_code: instrumentCode,
    results,
    checksum_valid: true,
    raw_frame_count: segments.length,
  };
}

/**
 * General parser that auto-detects protocol (ASTM vs HL7)
 */
export function parseAnalyzerPacket(raw: string): ParsedAnalyzerMessage {
  if (raw.includes("MSH|") || raw.includes("OBR|") || raw.includes("OBX|")) {
    return parseHL7V2Message(raw);
  }
  return parseASTM1394Message(raw);
}

/**
 * Builds an ASTM E1394 bidirectional worklist query response
 */
export function generateASTMWorklistRecord(response: AnalyzerWorklistResponse): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const testsString = response.ordered_tests
    .flatMap((t) => (t.analyte_codes.length > 0 ? t.analyte_codes : [t.test_code]))
    .map((code) => `^^^${code}`)
    .join("\\");

  const lines = [
    `H|\\^&|||OHMS_LIS^1.0|||||||P|1|${timestamp}`,
    `P|1||${response.patient_code}||${response.patient_name}|||${response.gender || "U"}`,
    `O|1|${response.sample_barcode}||${testsString}|R|${timestamp}|||||A`,
    `L|1|N`,
  ];

  return lines.join("\r\n");
}

/**
 * Builds an HL7 v2.5.1 ORU/DSR worklist query response
 */
export function generateHL7WorklistResponse(
  response: AnalyzerWorklistResponse,
  queryMsgControlId = "MSG001"
): string {
  const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const segments = [
    `MSH|^~\\&|OHMS_LIS|ONNESHA_HOSPITAL|ANALYZER|LAB|${now}||DSR^Q03|${now}_ACK|P|2.5.1`,
    `MSA|AA|${queryMsgControlId}`,
    `QAK|SR|OK`,
    `PID|1||${response.patient_code}||${response.patient_name}|||${response.gender || "U"}`,
  ];

  response.ordered_tests.forEach((t, idx) => {
    segments.push(
      `OBR|${idx + 1}|${response.order_number}|${response.sample_barcode}|${t.test_code}^${t.test_name}|||${now}`
    );
  });

  return segments.join("\r\n");
}
