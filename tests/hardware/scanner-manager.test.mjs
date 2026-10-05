import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ScannerManager,
  ScannerSimulator,
  classifyBarcodeCategory,
} from '../../lib/hardware/scanner/scanner-manager.ts';

test('Scanner 1. Barcode category classification across clinical identifiers', () => {
  assert.equal(classifyBarcodeCategory('ONN-P-10948'), 'PATIENT');
  assert.equal(classifyBarcodeCategory('P-08421'), 'PATIENT');
  assert.equal(classifyBarcodeCategory('P100234'), 'PATIENT');
  assert.equal(classifyBarcodeCategory('SMP-2026-9041'), 'SAMPLE');
  assert.equal(classifyBarcodeCategory('LAB-8821'), 'SAMPLE');
  assert.equal(classifyBarcodeCategory('INV-2026-0941'), 'INVOICE');
  assert.equal(classifyBarcodeCategory('REC-5542'), 'INVOICE');
  assert.equal(classifyBarcodeCategory('MED-PARACETAMOL'), 'MEDICINE');
  assert.equal(classifyBarcodeCategory('8901234567890'), 'MEDICINE'); // EAN-13
  assert.equal(classifyBarcodeCategory('XYZ-999999'), 'GENERIC');
});

test('Scanner 2. High-speed laser burst keystrokes are accepted and trigger scan event', () => {
  const manager = new ScannerManager({
    minBarcodeLength: 4,
    maxInterKeyDelayMs: 50,
  });
  const simulator = new ScannerSimulator(manager);

  let capturedEvent = null;
  manager.onScan((ev) => {
    capturedEvent = ev;
  });

  const result = simulator.emitBurstKeystrokes('SMP-2026-9041', '\r');

  assert.ok(result, 'Burst should be recognized as scanner event');
  assert.equal(result.barcode, 'SMP-2026-9041');
  assert.equal(result.category, 'SAMPLE');
  assert.ok(result.interKeyAverageMs <= 20, 'Average inter-key delay should be ~10ms');
  assert.ok(capturedEvent, 'Listener should have captured event');
  assert.equal(capturedEvent.barcode, 'SMP-2026-9041');
});

test('Scanner 3. Slow human keyboard typing is rejected to prevent hijacking user inputs', () => {
  const manager = new ScannerManager({
    minBarcodeLength: 4,
    maxInterKeyDelayMs: 50,
  });
  const simulator = new ScannerSimulator(manager);

  let capturedEvent = null;
  manager.onScan((ev) => {
    capturedEvent = ev;
  });

  // Emulate human typing with 120ms between keystrokes
  const result = simulator.emitHumanTyping('PATIENT-NAME', 'Enter');

  assert.equal(result, null, 'Slow typing must NOT trigger scanner event');
  assert.equal(capturedEvent, null, 'Listener must NOT be triggered by human typing');
});

test('Scanner 4. Sliding-window duplicate suppression blocks rapid trigger double-reads', () => {
  const manager = new ScannerManager({
    duplicateDebounceMs: 500,
  });
  const simulator = new ScannerSimulator(manager);

  const events = [];
  manager.onScan((ev) => {
    events.push(ev);
  });

  // First scan
  const scan1 = simulator.emitBurstKeystrokes('ONN-P-10948', '\r');
  assert.ok(scan1, 'First scan should succeed');

  // Immediate identical second scan (within debounce window)
  const scan2 = simulator.emitBurstKeystrokes('ONN-P-10948', '\r');
  assert.equal(scan2, null, 'Immediate duplicate scan should be suppressed');
  assert.equal(events.length, 1, 'Only one event should be emitted');

  // A different barcode should NOT be blocked
  const scan3 = simulator.emitBurstKeystrokes('ONN-P-08421', '\r');
  assert.ok(scan3, 'Different barcode scan should succeed immediately');
  assert.equal(events.length, 2);
});

test('Scanner 5. Suffix configuration supports Tab-delimited scanners', () => {
  const manager = new ScannerManager({
    suffix: '\t',
  });
  const simulator = new ScannerSimulator(manager);

  let captured = null;
  manager.onScan((ev) => {
    captured = ev;
  });

  // Send burst with Tab suffix
  const result = simulator.emitBurstKeystrokes('INV-2026-0941', 'Tab');
  assert.ok(result, 'Tab-suffixed scanner burst should be accepted');
  assert.equal(result.barcode, 'INV-2026-0941');
  assert.equal(result.category, 'INVOICE');
});

test('Scanner 6. Short / malformed inputs below minBarcodeLength are rejected', () => {
  const manager = new ScannerManager({
    minBarcodeLength: 5,
  });
  const simulator = new ScannerSimulator(manager);

  const result = simulator.emitBurstKeystrokes('AB', '\r');
  assert.equal(result, null, 'Sub-minimum length scan should be rejected');
});
