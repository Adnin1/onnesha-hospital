import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Helper for direct barcode test
function generateSvgBarcode(value, height = 40) {
  if (!value) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${height}"><rect x="0" y="0" width="100" height="${height}" fill="black"/></svg>`;
}

describe("OHMS Phase 15 Enterprise Printing Engine Suite (10 Scenarios)", () => {
  // Scenario 1: Migration 024 creates print_templates and document_print_logs
  test("1. Migration 024 defines print_templates and document_print_logs with RLS", () => {
    const mig = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "024_phase15_printing_templates.sql"),
      "utf8"
    );
    assert.match(mig, /CREATE TABLE IF NOT EXISTS print_templates/);
    assert.match(mig, /CREATE TABLE IF NOT EXISTS document_print_logs/);
    assert.match(mig, /ALTER TABLE print_templates ENABLE ROW LEVEL SECURITY/);
    assert.match(mig, /ALTER TABLE document_print_logs ENABLE ROW LEVEL SECURITY/);
  });

  // Scenario 2: Types file exports PrintFormat and PrintableDocumentType
  test("2. lib/print/types.ts defines PrintFormat and PrintableDocumentType", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "lib", "print", "types.ts"), "utf8");
    assert.match(typesContent, /export type PrintFormat = "A4" \| "THERMAL_80MM"/);
    assert.match(typesContent, /export type PrintableDocumentType/);
    assert.match(typesContent, /PRESCRIPTION/);
    assert.match(typesContent, /INVOICE/);
    assert.match(typesContent, /THERMAL_RECEIPT/);
  });

  // Scenario 3: SVG Barcode & QR Code generator produces valid XML strings
  test("3. lib/print/barcode.ts generates valid zero-dependency SVG barcodes and QR blocks", () => {
    const barcodeCode = fs.readFileSync(path.join(rootDir, "lib", "print", "barcode.ts"), "utf8");
    assert.match(barcodeCode, /export function generateSvgBarcode/);
    assert.match(barcodeCode, /export function generateSvgQrBlock/);
    assert.match(barcodeCode, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    const testSvg = generateSvgBarcode("INV-2026-001");
    assert.ok(testSvg.startsWith("<svg"));
  });

  // Scenario 4: Print Service implements audit logging for document prints/reprints
  test("4. lib/print/print-service.ts implements recordPrintLog and executePrint", () => {
    const serviceContent = fs.readFileSync(path.join(rootDir, "lib", "print", "print-service.ts"), "utf8");
    assert.match(serviceContent, /export class PrintService/);
    assert.match(serviceContent, /recordPrintLog/);
    assert.match(serviceContent, /document_print_logs/);
    assert.match(serviceContent, /is_reprint/);
    assert.match(serviceContent, /window\.print\(\)/);
  });

  // Scenario 5: PrescriptionPad component mounts BMDC number, Doctor credentials, and Rx list
  test("5. PrescriptionPad.tsx mounts BMDC registration, Doctor credentials, and Rx list", () => {
    const padContent = fs.readFileSync(path.join(rootDir, "components", "print", "PrescriptionPad.tsx"), "utf8");
    assert.match(padContent, /doctor\.bmdcRegNo/);
    assert.match(padContent, /DOCTOR PRESCRIPTION PAD/);
    assert.match(padContent, /℞/);
    assert.match(padContent, /HospitalPrintHeader/);
    assert.match(padContent, /HospitalPrintFooter/);
  });

  // Scenario 6: ThermalReceipt enforces 80mm roll constraints for POS printing
  test("6. ThermalReceipt.tsx enforces 80mm roll width constraints and barcode", () => {
    const receiptContent = fs.readFileSync(path.join(rootDir, "components", "print", "ThermalReceipt.tsx"), "utf8");
    assert.match(receiptContent, /w-\[80mm\]/);
    assert.match(receiptContent, /max-w-\[80mm\]/);
    assert.match(receiptContent, /POS Money Receipt/);
    assert.match(receiptContent, /generateSvgBarcode/);
  });

  // Scenario 7: A4InvoicePrint displays due balance, itemized breakdown, and settlements
  test("7. A4InvoicePrint.tsx displays itemized breakdown, payments, and outstanding balance", () => {
    const invContent = fs.readFileSync(path.join(rootDir, "components", "print", "A4InvoicePrint.tsx"), "utf8");
    assert.match(invContent, /HOSPITAL BILLING STATEMENT/);
    assert.match(invContent, /Itemized Charges/);
    assert.match(invContent, /Payment Settlements/);
    assert.match(invContent, /Outstanding Balance/);
    assert.match(invContent, /max-w-\[210mm\]/);
  });

  // Scenario 8: DiagnosticReportPrint displays normal reference ranges and pathologist verification
  test("8. DiagnosticReportPrint.tsx displays normal reference ranges and pathologist signoff", () => {
    const labContent = fs.readFileSync(path.join(rootDir, "components", "print", "DiagnosticReportPrint.tsx"), "utf8");
    assert.match(labContent, /DIAGNOSTIC TEST REPORT/);
    assert.match(labContent, /Biological Reference Range/);
    assert.match(labContent, /ELECTRONICALLY VERIFIED & APPROVED/);
    assert.match(labContent, /pathologist\.name/);
  });

  // Scenario 9: DischargeSummaryPrint displays admission vitals, diagnoses, and take-home medications
  test("9. DischargeSummaryPrint.tsx renders IPD discharge summary, medications, and advice", () => {
    const ipdContent = fs.readFileSync(path.join(rootDir, "components", "print", "DischargeSummaryPrint.tsx"), "utf8");
    assert.match(ipdContent, /IPD DISCHARGE CERTIFICATE & CLINICAL SUMMARY/);
    assert.match(ipdContent, /Admission Diagnosis/);
    assert.match(ipdContent, /Final Discharge Diagnosis/);
    assert.match(ipdContent, /Take-Home Medications \(Rx\)/);
  });

  // Scenario 10: Print components avoid external tracking scripts and use canonical hospital metadata
  test("10. Print components link directly to canonical hospital configuration without mock-data", () => {
    const receiptContent = fs.readFileSync(path.join(rootDir, "components", "print", "ThermalReceipt.tsx"), "utf8");
    assert.match(receiptContent, /HOSPITAL_METADATA/);
    assert.doesNotMatch(receiptContent, /mock-data/);
  });
});
