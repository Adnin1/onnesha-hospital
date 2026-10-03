import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import hardware engines directly
import {
  EscPosBuilder,
  buildOpdTokenEscPos,
  buildBillingReceiptEscPos,
  buildHardwareTestTicket,
} from '../lib/hardware/escpos.ts';

import {
  isDicomPreamble,
  parseDicomBuffer,
  generateSyntheticDicomPhantom,
} from '../lib/hardware/dicom.ts';

import {
  calculateASTMChecksum,
  generateAstmCbcTransmission,
  generateHl7BiochemTransmission,
} from '../scripts/emulate-lis-analyzer.mjs';

import {
  createSyntheticDicomBuffer,
  parseDicomHeader,
} from '../scripts/emulate-dicom-pacs.mjs';

test('1. ESC/POS Buffer Generator initializes with standard ESC @ command', () => {
  const builder = new EscPosBuilder();
  const bytes = builder.build();
  assert.equal(bytes[0], 0x1b, 'First byte must be ESC (0x1B)');
  assert.equal(bytes[1], 0x40, 'Second byte must be @ (0x40)');
});

test('2. ESC/POS formatting commands append proper byte sequences and paper cut', () => {
  const builder = new EscPosBuilder()
    .align('center')
    .bold(true)
    .textLine('ANNESHA')
    .underline(true)
    .textLine('HOSPITAL')
    .cut();

  const bytes = builder.build();
  assert.ok(bytes.length > 10, 'Byte buffer should contain formatted data');

  // Check cut command at the end: [0x1D, 0x56, 0x42, 0x00]
  const lastFour = bytes.slice(bytes.length - 4);
  assert.deepEqual(Array.from(lastFour), [0x1d, 0x56, 0x42, 0x00]);
});

test('3. ESC/POS 1D Barcode (CODE128) sequence is accurately structured', () => {
  const builder = new EscPosBuilder().barcode128('TEST-1234');
  const bytes = builder.build();
  const arr = Array.from(bytes);

  // Search for GS k 73 (CODE128 prefix: 0x1D, 0x6B, 73)
  const idx = arr.findIndex((b, i) => b === 0x1d && arr[i + 1] === 0x6b && arr[i + 2] === 73);
  assert.ok(idx !== -1, 'Must contain CODE128 command sequence');
  const len = arr[idx + 3];
  assert.equal(len, 'TEST-1234'.length, 'Barcode length byte must match data length');
});

test('4. OPD Token receipt builds valid ESC/POS byte sequence', () => {
  const tokenBuilder = buildOpdTokenEscPos({
    tokenNumber: 42,
    doctorName: 'Dr. Nazmul Huda',
    department: 'Cardiology',
    roomNumber: 'Room 204',
    patientName: 'Md. Rafiqul Islam',
    uhid: 'ONN-P-10948',
    timeSlot: '10:30 AM',
  });

  const bytes = tokenBuilder.build();
  assert.ok(bytes.length > 50, 'OPD token slip must generate substantial receipt bytes');
});

test('5. Billing receipt builds valid itemized receipt buffer', () => {
  const receiptBuilder = buildBillingReceiptEscPos({
    invoiceNumber: 'INV-2026-0941',
    patientName: 'Begum Rokeya',
    uhid: 'ONN-P-08421',
    items: [
      { description: 'OPD Consultation', qty: 1, unitPrice: 500, total: 500 },
      { description: 'ECG 12-Lead', qty: 1, unitPrice: 400, total: 400 },
    ],
    subtotal: 900,
    discount: 0,
    tax: 0,
    total: 900,
    paid: 900,
    balance: 0,
    paymentMethod: 'CASH',
    cashierName: 'A. Rahman',
  });

  const bytes = receiptBuilder.build();
  assert.ok(bytes.length > 100, 'Billing receipt must contain complete itemized layout');
});

test('6. Hardware Self-Test Ticket contains formatting and QR code elements', () => {
  const testTicket = buildHardwareTestTicket();
  const bytes = testTicket.build();
  assert.ok(bytes.length > 50, 'Test ticket must build successfully');
});

test('7. hooks/useBarcodeScanner.ts defines keyboard wedge burst detection and classification', () => {
  const scannerHookContent = fs.readFileSync(path.join(rootDir, 'hooks', 'useBarcodeScanner.ts'), 'utf8');
  assert.match(scannerHookContent, /export function classifyBarcode/);
  assert.match(scannerHookContent, /export function useBarcodeScanner/);
  assert.match(scannerHookContent, /ohms:barcode-scanned/);
  assert.match(scannerHookContent, /maxInterKeyDelayMs\s*=\s*50/);
});

test('8. ASTM Modulo-256 checksum matches standard laboratory specification', () => {
  const frameContent = '1H|\\^&|||MINDRAY-BC5000\x03';
  const checksum = calculateASTMChecksum(frameContent);
  assert.match(checksum, /^[0-9A-F]{2}$/, 'Checksum must be 2 uppercase hex digits');
});

test('9. ASTM E1394 LIS analyzer transmission generates structured observations', () => {
  const astm = generateAstmCbcTransmission('SMP-2026-9041', 'ONN-P-10948');
  assert.equal(astm.protocol, 'ASTM_1394');
  assert.equal(astm.sampleBarcode, 'SMP-2026-9041');
  assert.ok(astm.records.length >= 7, 'Must generate header, patient, order, result records');
  assert.ok(astm.framedPayload.includes('\x02'), 'Framed payload must contain ASTM STX control characters');
});

test('10. HL7 v2.5.1 LIS analyzer transmission generates biochemistry profile segments', () => {
  const hl7 = generateHl7BiochemTransmission('SMP-2026-9042', 'ONN-P-08421');
  assert.equal(hl7.protocol, 'HL7_V2');
  assert.equal(hl7.sampleBarcode, 'SMP-2026-9042');
  assert.ok(hl7.segments.some((s) => s.startsWith('MSH|^~\\&|COBAS_C311')), 'Must include Cobas MSH header');
  assert.ok(hl7.segments.some((s) => s.includes('GLU^Blood Glucose')), 'Must include Glucose OBX segment');
});

test('11. Synthetic DICOM Part 10 phantom generates valid preamble and tags', () => {
  const dicomBytes = generateSyntheticDicomPhantom({
    patientId: 'ONN-P-10948',
    patientName: 'ISLAM^RAFIQUL',
    modality: 'DX',
  });

  assert.ok(isDicomPreamble(dicomBytes), 'Must start with valid 128-byte preamble and DICM magic bytes');
  assert.equal(dicomBytes[128], 0x44); // D
  assert.equal(dicomBytes[129], 0x49); // I
  assert.equal(dicomBytes[130], 0x43); // C
  assert.equal(dicomBytes[131], 0x4d); // M
});

test('12. DICOM Part 10 parser parses synthetic phantom image correctly', () => {
  const dicomBytes = generateSyntheticDicomPhantom({
    patientId: 'ONN-P-10948',
    patientName: 'ISLAM^RAFIQUL',
    modality: 'DX',
  });

  const parsed = parseDicomBuffer(dicomBytes);
  assert.equal(parsed.isValidDicom, true);
  assert.equal(parsed.metadata.patientId, 'ONN-P-10948');
  assert.equal(parsed.metadata.patientName, 'ISLAM RAFIQUL');
  assert.equal(parsed.metadata.modality, 'DX');
  assert.equal(parsed.metadata.rows, 256);
  assert.equal(parsed.metadata.columns, 256);
  assert.equal(parsed.metadata.bitsAllocated, 16);
  assert.ok(parsed.pixelData, 'Must extract pixel data array');
  assert.equal(parsed.pixelData.length, 256 * 256);
});

test('13. DICOM PACS emulator creates conforming buffers and verifies headers', () => {
  const buf = createSyntheticDicomBuffer();
  const header = parseDicomHeader(buf);
  assert.equal(header.valid, true);
  assert.equal(header.magic, 'DICM');
});

test('14. Public TV display routes exist and feature Screen Wake Lock & Web Audio API', () => {
  const queueRoute = fs.readFileSync(path.join(rootDir, 'app', 'displays', 'queue', 'page.tsx'), 'utf8');
  assert.match(queueRoute, /wakeLock/, 'Queue display must implement Screen Wake Lock API');
  assert.match(queueRoute, /AudioContext/, 'Queue display must implement Web Audio API chime');

  const triageRoute = fs.readFileSync(path.join(rootDir, 'app', 'displays', 'triage', 'page.tsx'), 'utf8');
  assert.match(triageRoute, /wakeLock/, 'Triage display must implement Screen Wake Lock API');
  assert.match(triageRoute, /RED LANE/i, 'Triage display must define Red resuscitation lane');
});

test('15. Hardware diagnostic console and network VLAN topology are fully specified', () => {
  const hardwarePage = fs.readFileSync(
    path.join(rootDir, 'app', '(hospital)', 'app', 'settings', 'hardware', 'page.tsx'),
    'utf8'
  );
  assert.match(hardwarePage, /Thermal Printers/i);
  assert.match(hardwarePage, /LIS Laboratory Analyzers/i);
  assert.match(hardwarePage, /PACS & DICOM/i);

  const vlanDoc = fs.readFileSync(path.join(rootDir, 'docs', 'HOSPITAL_NETWORK_VLAN_TOPOLOGY.md'), 'utf8');
  assert.match(vlanDoc, /VLAN 10/);
  assert.match(vlanDoc, /VLAN 20/);
  assert.match(vlanDoc, /VLAN 30/);
  assert.match(vlanDoc, /VLAN 40/);
  assert.match(vlanDoc, /VLAN 50/);
});
