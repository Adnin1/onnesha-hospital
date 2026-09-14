/**
 * Phase 15 Enterprise Printing Engine Types
 */

export type PrintFormat = "A4" | "THERMAL_80MM";

export type PrintableDocumentType =
  | "PRESCRIPTION"
  | "INVOICE"
  | "THERMAL_RECEIPT"
  | "LAB_REPORT"
  | "DISCHARGE_SUMMARY"
  | "OPD_TOKEN";

export interface PrintTemplateRecord {
  id: string;
  organizationId: string;
  documentType: PrintableDocumentType;
  format: PrintFormat;
  headerHtml?: string | null;
  footerHtml?: string | null;
  showHospitalLogo: boolean;
  showQrCode: boolean;
  showBarcode: boolean;
  disclaimerText?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPrintLogRecord {
  id: string;
  organizationId: string;
  documentType: PrintableDocumentType;
  documentReferenceId: string;
  patientId?: string | null;
  printedBy?: string | null;
  printFormat: PrintFormat;
  isReprint: boolean;
  reprintReason?: string | null;
  clientIp?: string | null;
  createdAt: string;
}

export interface RecordPrintActionParams {
  documentType: PrintableDocumentType;
  documentReferenceId: string;
  patientId?: string | null;
  printFormat: PrintFormat;
  isReprint?: boolean;
  reprintReason?: string;
}
