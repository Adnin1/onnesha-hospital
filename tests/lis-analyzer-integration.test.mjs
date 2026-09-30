import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateASTMChecksum,
  normalizeAbnormalFlag,
  parseASTM1394Message,
  parseHL7V2Message,
  parseAnalyzerPacket,
  generateASTMWorklistRecord,
  generateHL7WorklistResponse,
} from "../lib/lab/lis/parser.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Laboratory Information System (LIS) & Analyzer Integration Suite (10 Scenarios)", () => {
  test("1. ASTM E1381 2-digit Hex Checksum matches specification (Modulo 256 sum)", () => {
    // Frame sample data
    const frameContent = "1H|\\^&|||Mindray_BC5000|||||||P|1\r\x03";
    const checksum = calculateASTMChecksum(frameContent);
    assert.equal(checksum.length, 2);
    assert.match(checksum, /^[0-9A-F]{2}$/);

    // Verify mathematical modulo 256 correctness
    let manualSum = 0;
    for (let i = 0; i < frameContent.length; i++) {
      manualSum = (manualSum + frameContent.charCodeAt(i)) & 0xff;
    }
    const expected = manualSum.toString(16).toUpperCase().padStart(2, "0");
    assert.equal(checksum, expected);
  });

  test("2. ASTM E1394 parser extracts instrument code, sample barcode, and all analyte measurements", () => {
    const rawASTM = [
      "H|\\^&|||MINDRAY_BC5000^v2.1|||||||P|1|20260930120000",
      "P|1||P-202609-00042||Rahman^Mohammad||19850612|M",
      "O|1|LAB-BARCODE-9901||^^^CBC|R|20260930120000|||||A",
      "R|1|^^^WBC|7.4|10^3/uL|4.0-11.0|N||F||TECH01|2026-09-30T06:00:00Z",
      "R|2|^^^RBC|4.65|10^6/uL|3.80-5.20|N||F||TECH01|2026-09-30T06:00:00Z",
      "R|3|^^^HGB|13.8|g/dL|11.5-15.5|N||F||TECH01|2026-09-30T06:00:00Z",
      "R|4|^^^PLT|245|10^3/uL|150-450|N||F||TECH01|2026-09-30T06:00:00Z",
      "L|1|N",
    ].join("\r\n");

    const parsed = parseASTM1394Message(rawASTM);
    assert.equal(parsed.protocol, "ASTM_1394");
    assert.equal(parsed.instrument_code, "MINDRAY_BC5000");
    assert.equal(parsed.sample_barcode, "LAB-BARCODE-9901");
    assert.equal(parsed.patient_identifier, "P-202609-00042");
    assert.equal(parsed.results.length, 4);

    const wbc = parsed.results.find((r) => r.analyte_code === "WBC");
    assert.ok(wbc, "WBC must be parsed");
    assert.equal(wbc.observed_value, "7.4");
    assert.equal(wbc.numeric_value, 7.4);
    assert.equal(wbc.unit, "10^3/uL");
    assert.equal(wbc.reference_range, "4.0-11.0");
    assert.equal(wbc.abnormal_flag, "NORMAL");
  });

  test("3. Abnormality severity normalizer classifies High, Low, and Critical Panic Values", () => {
    assert.equal(normalizeAbnormalFlag("N"), "NORMAL");
    assert.equal(normalizeAbnormalFlag("H"), "HIGH");
    assert.equal(normalizeAbnormalFlag("L"), "LOW");
    assert.equal(normalizeAbnormalFlag("HH"), "CRITICAL_HIGH");
    assert.equal(normalizeAbnormalFlag("CH"), "CRITICAL_HIGH");
    assert.equal(normalizeAbnormalFlag("CRITICAL_HIGH"), "CRITICAL_HIGH");
    assert.equal(normalizeAbnormalFlag("LL"), "CRITICAL_LOW");
    assert.equal(normalizeAbnormalFlag("CL"), "CRITICAL_LOW");
    assert.equal(normalizeAbnormalFlag("CRITICAL_LOW"), "CRITICAL_LOW");
    assert.equal(normalizeAbnormalFlag(undefined), "NORMAL");
  });

  test("4. HL7 v2.5.1 ORU^R01 parser extracts MSH, PID, OBR, and OBX observation results", () => {
    const rawHL7 = [
      "MSH|^~\\&|COBAS_C311|ROCHE_LAB|OHMS_LIS|ONNESHA_HOSPITAL|20260930120000||ORU^R01|MSG9901|P|2.5.1",
      "PID|1||P-2026-9911||Khan^Adnin||19900101|M",
      "OBR|1|ORD-5501|SAMPLE-8822|LFT^Liver Function Profile|||20260930120000",
      "OBX|1|NM|CREA^Serum Creatinine^LN||0.95|mg/dL|0.60-1.20|N|||F",
      "OBX|2|NM|GLU_FAST^Fasting Blood Glucose^LN||185|mg/dL|70-100|HH|||F",
      "OBX|3|NM|SGPT_ALT^Alanine Aminotransferase (ALT)^LN||42|U/L|0-45|N|||F",
    ].join("\r\n");

    const parsed = parseHL7V2Message(rawHL7);
    assert.equal(parsed.protocol, "HL7_V2");
    assert.equal(parsed.message_type, "RESULTS_ORU");
    assert.equal(parsed.instrument_code, "COBAS_C311");
    assert.equal(parsed.sample_barcode, "SAMPLE-8822");
    assert.equal(parsed.patient_identifier, "P-2026-9911");
    assert.equal(parsed.results.length, 3);

    const glucose = parsed.results.find((r) => r.analyte_code === "CREA" || r.analyte_name?.includes("Glucose") || r.analyte_code === "GLU_FAST");
    assert.ok(glucose);
    const gluFast = parsed.results.find((r) => r.analyte_code === "GLU_FAST");
    assert.equal(gluFast.observed_value, "185");
    assert.equal(gluFast.numeric_value, 185);
    assert.equal(gluFast.abnormal_flag, "CRITICAL_HIGH");
  });

  test("5. Universal parseAnalyzerPacket auto-detects protocol based on payload structure", () => {
    const astmMsg = "H|\\^&|||SYSMEX_XN350|||||||P|1\r\nO|1|BC-01||^^^CBC|R||||||A\r\nR|1|^^^HGB|14.0|g/dL|12-16|N\r\nL|1|N";
    const hl7Msg = "MSH|^~\\&|COBAS|LAB|||||ORU^R01|1|P|2.5\r\nOBR|1||BC-02|TEST\r\nOBX|1|NM|GLU||100|mg/dL|70-100|N";

    const parsedAstm = parseAnalyzerPacket(astmMsg);
    assert.equal(parsedAstm.protocol, "ASTM_1394");
    assert.equal(parsedAstm.sample_barcode, "BC-01");

    const parsedHl7 = parseAnalyzerPacket(hl7Msg);
    assert.equal(parsedHl7.protocol, "HL7_V2");
    assert.equal(parsedHl7.sample_barcode, "BC-02");
  });

  test("6. ASTM bidirectional worklist generator formats valid E1394 Host Query response", () => {
    const worklist = {
      sample_barcode: "TUBE-99042",
      order_number: "ORD-202609-001",
      patient_code: "P-202609-00042",
      patient_name: "Tanvir Rahman",
      gender: "M",
      age: 38,
      ordered_tests: [
        {
          test_code: "CBC",
          test_name: "Complete Blood Count",
          analyte_codes: ["WBC", "RBC", "HGB", "PLT"],
        },
      ],
    };

    const response = generateASTMWorklistRecord(worklist);
    assert.ok(response.startsWith("H|\\^&"));
    assert.ok(response.includes("P|1||P-202609-00042||Tanvir Rahman|||M"));
    assert.ok(response.includes("O|1|TUBE-99042||^^^WBC\\^^^RBC\\^^^HGB\\^^^PLT|R|"));
    assert.ok(response.endsWith("L|1|N"));
  });

  test("7. HL7 bidirectional worklist generator formats valid DSR^Q03 Query response", () => {
    const worklist = {
      sample_barcode: "TUBE-77011",
      order_number: "ORD-202609-002",
      patient_code: "P-202609-00055",
      patient_name: "Nasrin Sultana",
      gender: "F",
      ordered_tests: [
        {
          test_code: "LFT",
          test_name: "Liver Function Test",
          analyte_codes: ["SGPT", "SGOT", "BILI"],
        },
      ],
    };

    const response = generateHL7WorklistResponse(worklist, "QUERY_CTRL_101");
    assert.ok(response.includes("MSH|^~\\&|OHMS_LIS|ONNESHA_HOSPITAL"));
    assert.ok(response.includes("MSA|AA|QUERY_CTRL_101"));
    assert.ok(response.includes("QAK|SR|OK"));
    assert.ok(response.includes("PID|1||P-202609-00055||Nasrin Sultana|||F"));
    assert.ok(response.includes("OBR|1|ORD-202609-002|TUBE-77011|LFT^Liver Function Test"));
  });

  test("8. LIS Database migration file defines lab_analyzers, transmissions, and RLS policies", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20260930070000_lis_analyzer_integration.sql");
    assert.ok(fs.existsSync(migrationPath), "LIS migration file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS lab_analyzers"), "lab_analyzers table required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS lab_analyzer_transmissions"), "transmissions table required");
    assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS must be enabled");
    assert.ok(sql.includes("MINDRAY-BC5000"), "Mindray BC-5000 analyzer pre-seed required");
    assert.ok(sql.includes("ROCHE-COBAS-C311"), "Roche Cobas c311 analyzer pre-seed required");
    assert.ok(sql.includes("SYSMEX-XN350"), "Sysmex XN-350 analyzer pre-seed required");
  });

  test("9. LIS UI integration components exist and are connected to lab management console", () => {
    const modalPath = path.join(ROOT, "components/lab/LisAnalyzerModal.tsx");
    assert.ok(fs.existsSync(modalPath), "LisAnalyzerModal component must exist");
    const modalContent = fs.readFileSync(modalPath, "utf8");
    assert.ok(modalContent.includes("ASTM E1394"), "ASTM standard referenced");
    assert.ok(modalContent.includes("HL7 v2"), "HL7 standard referenced");
    assert.ok(modalContent.includes("Simulate Analyzer Run"), "Simulation control present");

    const labPagePath = path.join(ROOT, "app/(hospital)/app/lab/page.tsx");
    const labContent = fs.readFileSync(labPagePath, "utf8");
    assert.ok(labContent.includes("LisAnalyzerModal"), "Modal must be imported in Lab page");
    assert.ok(labContent.includes("LIS Analyzer Integration"), "LIS navigation trigger present");
  });

  test("10. TypeScript definitions for LIS Analyzer cover all protocol models and transmission states", () => {
    const typePath = path.join(ROOT, "types/lis-analyzer.ts");
    assert.ok(fs.existsSync(typePath), "types/lis-analyzer.ts must exist");
    const typeContent = fs.readFileSync(typePath, "utf8");
    assert.ok(typeContent.includes("ASTM_1394"), "ASTM_1394 protocol type required");
    assert.ok(typeContent.includes("HL7_V2"), "HL7_V2 protocol type required");
    assert.ok(typeContent.includes("LabAnalyzer"), "LabAnalyzer interface required");
    assert.ok(typeContent.includes("ParsedAnalyzerMessage"), "ParsedAnalyzerMessage interface required");
    assert.ok(typeContent.includes("CRITICAL_HIGH"), "Critical Panic Value severity required");
  });
});
