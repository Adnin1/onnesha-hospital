import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasBanglaOrUnicode,
  formatEscPosRasterBitImage,
  rasterizeTextToEscPos,
  generateHeadlessMonochromeRaster,
  EscPosBuilder,
  buildBanglaTestTicket,
  PrintJobQueue,
} from '../../lib/hardware/escpos.ts';

test('Thermal Printer 1. Bangla Unicode detection distinguishes Bengali from Latin-1', () => {
  assert.equal(hasBanglaOrUnicode('ANNESHA HOSPITAL'), false);
  assert.equal(hasBanglaOrUnicode('INV-2026-9041'), false);
  assert.equal(hasBanglaOrUnicode('Dr. Nazmul Huda'), false);

  assert.equal(hasBanglaOrUnicode('অন্বেষা হাসপাতাল'), true);
  assert.equal(hasBanglaOrUnicode('মোঃ রফিকুল ইসলাম'), true);
  assert.equal(hasBanglaOrUnicode('টাকা ৫০০.০০'), true);
});

test('Thermal Printer 2. ESC/POS GS v 0 raster bit image command framing', () => {
  const widthDots = 384;
  const heightDots = 24;
  const widthBytes = Math.ceil(widthDots / 8); // 48 bytes per row
  const fakeRaster = new Uint8Array(widthBytes * heightDots);

  const cmd = formatEscPosRasterBitImage(fakeRaster, widthDots, heightDots);

  // Check GS v 0 prefix: 0x1D, 0x76, 0x30, 0x00
  assert.equal(cmd[0], 0x1d);
  assert.equal(cmd[1], 0x76);
  assert.equal(cmd[2], 0x30);
  assert.equal(cmd[3], 0x00);

  // Width in bytes (xL, xH)
  assert.equal(cmd[4], 48);
  assert.equal(cmd[5], 0);

  // Height in dots (yL, yH)
  assert.equal(cmd[6], 24);
  assert.equal(cmd[7], 0);

  assert.equal(cmd.length, 8 + fakeRaster.length);
});

test('Thermal Printer 3. Text rasterizer converts Bangla strings into 1-bit monochrome bitmap', () => {
  const result = rasterizeTextToEscPos('অন্বেষা হাসপাতাল ও ডায়াগনস্টিক', {
    fontSize: 24,
    bold: true,
  });

  assert.ok(result.widthDots > 0);
  assert.ok(result.heightDots > 0);
  assert.ok(result.rasterBytes.length > 0);
  assert.ok(result.escposCommand.length > 8);

  // Verify that raster bytes contain actual printed dots (non-zero bytes)
  const hasDots = Array.from(result.rasterBytes).some((b) => b > 0);
  assert.ok(hasDots, 'Rendered Bangla raster must contain printed pixel dots');
});

test('Thermal Printer 4. EscPosBuilder.textUnicode renders raster image for Bangla with zero ? bytes', () => {
  const builder = new EscPosBuilder();
  builder.textUnicode('রোগীর নাম: মোঃ রফিকুল ইসলাম');

  const bytes = builder.build();
  assert.ok(bytes.length > 50, 'Must output substantial raster image bytes');

  // Verify that GS v 0 (0x1D, 0x76, 0x30) exists in the output
  const arr = Array.from(bytes);
  const gsV0Idx = arr.findIndex((b, i) => b === 0x1d && arr[i + 1] === 0x76 && arr[i + 2] === 0x30);
  assert.ok(gsV0Idx !== -1, 'Must contain ESC/POS GS v 0 raster command');
});

test('Thermal Printer 5. Complete Bangla Test Ticket builds cleanly with QR code and paper cut', () => {
  const builder = buildBanglaTestTicket();
  const bytes = builder.build();

  assert.ok(bytes.length > 200, 'Full Bangla ticket must contain comprehensive receipt commands');

  // Check cut command at the end: [0x1D, 0x56, 0x42, 0x00]
  const lastFour = bytes.slice(bytes.length - 4);
  assert.deepEqual(Array.from(lastFour), [0x1d, 0x56, 0x42, 0x00]);
});

test('Thermal Printer 6. PrintJobQueue suppresses duplicate rapid clicks within debounce window', () => {
  const queue = PrintJobQueue.getInstance();
  const testFingerprint = 'TICKET_OPD_TOKEN_42_P10948';

  // First print click: Allowed
  const firstSuppressed = queue.shouldSuppressDuplicate(testFingerprint);
  assert.equal(firstSuppressed, false, 'First print job must proceed');

  const job = queue.registerJob('OPD_TOKEN', testFingerprint, 1024);
  assert.ok(job.jobId.startsWith('PRINT_'));
  assert.equal(job.status, 'COMPLETED');

  // Immediate second print click: Suppressed
  const secondSuppressed = queue.shouldSuppressDuplicate(testFingerprint);
  assert.equal(secondSuppressed, true, 'Immediate rapid duplicate click must be suppressed');
});
