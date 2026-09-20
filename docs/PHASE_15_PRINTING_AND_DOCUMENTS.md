# Phase 15 — Enterprise PDF, Hospital Pad & Dual-Format (A4 / 80mm Thermal) Printing Engine

## Overview
Phase 15 provides an enterprise-grade document rendering and printing architecture for Onnesha Hospital Management System (OHMS). Designed specifically for Bangladeshi hospital workflows, it supports dual-format printing:
1. **Standard A4 Corporate / Clinical Documents**: Letterhead pads, diagnostic reports, formal billing invoices, discharge summaries.
2. **80mm Roll Thermal POS Receipts**: Instant cash register slips, OPD token receipts, pharmacy dispensary chits.

All printing logic strictly enforces:
- **Zero Mock Data**: Dynamic clinical and financial data sourced from canonical models and database records.
- **Audit Logging & Reprint Tracking**: Every print and duplicate reprint is tracked with user ID, timestamp, and client IP in document_print_logs.
- **Zero External Runtime Dependencies**: Code128 barcodes and QR code indicators rendered via pure, fast inline SVG primitives with no external JS CDN scripts.

---

## 1. Database Architecture & Schema

### Migration: supabase/migrations/024_phase15_printing_templates.sql

#### Table: print_templates
Stores tenant-configurable templates with custom header/footer text, hospital logos, disclaimer clauses, and layout dimensions.
- id (UUID, Primary Key)
- organization_id (UUID, Foreign Key)
- document_type (VARCHAR: PRESCRIPTION, THERMAL_RECEIPT, INVOICE_A4, DIAGNOSTIC_REPORT, DISCHARGE_SUMMARY)
- ormat (VARCHAR: A4, THERMAL_80MM)
- header_html, ooter_html, css_overrides (TEXT)
- show_watermark (BOOLEAN, default false)
- watermark_text (VARCHAR)
- is_default (BOOLEAN, default true)
- RLS enabled with multi-tenant isolation.

#### Table: document_print_logs
Tracks every print event for compliance and duplicate prevention.
- id (UUID, Primary Key)
- organization_id (UUID, Foreign Key)
- document_type (VARCHAR)
- document_id (VARCHAR)
- printed_by (UUID, Foreign Key to auth.users)
- print_format (VARCHAR: A4, THERMAL_80MM)
- is_reprint (BOOLEAN, default false)
- eprint_reason (TEXT)
- client_metadata (JSONB)
- created_at (TIMESTAMPTZ)
- RLS enabled with multi-tenant isolation.

---

## 2. Core Printing Services & Utilities

### Vector Barcode & QR Generator (lib/print/barcode.ts)
- generateCode128Svg(data: string, options): Pure zero-dependency SVG barcode renderer supporting Code 128B character sets.
- generateSimpleQrSvg(data: string, options): Pure SVG verification matrix for receipt token validation.

### Print Execution & Audit Service (lib/print/print-service.ts)
- PrintService.recordPrintLog(params): Records print/reprint history in document_print_logs using authenticated Supabase client.
- PrintService.executePrint(elementId, logParams): Orchestrates browser window printing (window.print()), applies print-only CSS isolation (@media print), and automatically logs the action.

---

## 3. Implemented Document Templates

### 1. Doctor Chamber Prescription Pad (components/print/PrescriptionPad.tsx)
- **Format**: A4 Standard
- **Header**: Official Hospital Pad with BMDC Registration, Doctor Credentials, Visiting Hours, Chamber Room.
- **Left Margin Panel**: Patient Vitals (BP, Pulse, Weight, SpO2, Temp), Complaints, Clinical Findings, Provisional Diagnosis.
- **Right Clinical Panel**: Rx section with Medicine Name, Generic, Dosage, Frequency (১+০+১ / 1-0-1), Relation to Meals (খাবার আগে / পরে), Duration, Advice & Investigations.
- **Footer**: Next Follow-up Date, Doctor Digital Signature space, Security Barcode.

### 2. 80mm Roll Thermal Money Receipt (components/print/ThermalReceipt.tsx)
- **Format**: 80mm Continuous Roll POS
- **Content**: Compact hospital header, Bill No, Cashier Name, Patient ID, Itemized Charges, Subtotal, Discount, Net Payable, Received Cash, Change/Due.
- **Barcode**: High-density 1D barcode for fast scanner-based reconciliation at the exit gate or medicine counter.

### 3. Comprehensive A4 Inpatient / Outpatient Billing Invoice (components/print/A4InvoicePrint.tsx)
- **Format**: A4 Standard
- **Content**: Detailed tabular breakdown of all bed charges, doctor rounds, OT fees, investigations, and medicines dispensed.
- **Financial Audit**: Multi-mode payment transaction history, automated amount in words (BDT Taka), authorized signature blocks.

### 4. Diagnostic Lab / Radiology Report (components/print/DiagnosticReportPrint.tsx)
- **Format**: A4 Standard
- **Content**: Specimen details, collection/reporting timestamps, reference ranges (Normal Low / High), unit measurements, automated abnormal flags (HIGH / LOW highlight).
- **Dual-Gate Verification**: Medical Technologist prepared by & Consultant Pathologist sign-off block.

### 5. Inpatient (IPD) Discharge Summary (components/print/DischargeSummaryPrint.tsx)
- **Format**: A4 Standard
- **Content**: Admission & Discharge timestamps, Primary Diagnosis, Surgical / Clinical Procedures performed, Hospital Course & Complications, Take-home Discharge Medications with instructions, and Emergency Red-flag Warnings.

---

## 4. Test & Verification Coverage

Automated test suite: 	ests/phase15-printing-engine.test.mjs (10 / 10 Passing)
- Migration schema verification for print_templates and document_print_logs.
- Type checking across A4 and 80mm thermal formats.
- SVG barcode generation testing with start/stop checksum verification.
- Print service audit logging simulation.
- Component layout integrity, BMDC registration verification, pathologist sign-off, and zero mock data validation.
- Overall project test suite: **144 / 144 passing**.
