import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DurableLisSpool } from '../../lib/lab/lis/durable-spool.ts';
import { LisSerialPortHandler, MockSerialStream } from '../../lib/lab/lis/serial-handler.ts';

test('LIS Spool 1. Synchronous Write-Before-ACK guarantee and disk persistence', () => {
  const testDir = path.resolve(process.cwd(), '.test-spool-' + Date.now());
  const spool = new DurableLisSpool({
    storageDir: testDir,
    maxRetries: 3,
  });

  const payload = 'H|\\^&|||Mindray_BC5000|||||||P|1\r';
  const record = spool.spoolSync('BC5000_HEMATOLOGY', 'ASTM_1394', payload);

  assert.ok(record.id.length > 0);
  assert.equal(record.status, 'PENDING');
  assert.equal(spool.getPendingCount(), 1);

  // Check file exists on disk
  const filePath = path.join(testDir, `spool_${record.id}.json`);
  assert.ok(fs.existsSync(filePath), 'Spooled record must be written to disk before ACK');

  const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(fileContent.analyzerCode, 'BC5000_HEMATOLOGY');

  // Mark delivered
  spool.markDelivered(record.id);
  assert.equal(spool.getPendingCount(), 0);
  assert.ok(!fs.existsSync(filePath), 'File must be pruned after successful cloud delivery');

  // Clean up
  spool.destroy();
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('LIS Spool 2. Crash recovery restores pending unforwarded records upon startup', () => {
  const testDir = path.resolve(process.cwd(), '.test-spool-recovery-' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  // Simulate an unforwarded record left on disk from a power cut
  const crashedRecord = {
    id: 'crashed_12345',
    analyzerCode: 'ROCHE_COBAS_C311',
    protocol: 'HL7_V2',
    rawPayload: 'MSH|^~\\&|COBAS|LAB|||20261006||ORU^R01|1|P|2.5.1\r',
    spooledAt: new Date().toISOString(),
    attempts: 1,
    status: 'PENDING',
  };
  fs.writeFileSync(
    path.join(testDir, 'spool_crashed_12345.json'),
    JSON.stringify(crashedRecord, null, 2),
    'utf-8'
  );

  // Boot new bridge spool
  const spool = new DurableLisSpool({ storageDir: testDir });
  assert.equal(spool.getPendingCount(), 1, 'Must recover 1 pending record from disk on startup');

  const pending = spool.getPendingRecords();
  assert.equal(pending[0].id, 'crashed_12345');
  assert.equal(pending[0].analyzerCode, 'ROCHE_COBAS_C311');

  spool.markDelivered('crashed_12345');
  spool.destroy();

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('LIS Spool 3. Retry with maxAttempts transitions to Dead-Letter Queue (DLQ) with replay', async () => {
  const spool = new DurableLisSpool({ inMemoryOnly: true, maxRetries: 2 });
  const rec = spool.spoolSync('SYSMEX_XN350', 'ASTM_1394', 'PAYLOAD_FAILS');

  // Attempt 1: fail
  await spool.processQueue(async () => false);
  assert.equal(spool.getPendingRecords()[0].attempts, 1);
  assert.equal(spool.getDeadLetterRecords().length, 0);

  // Attempt 2: fail -> transitions to DEAD_LETTER
  await spool.processQueue(async () => false);
  assert.equal(spool.getPendingCount(), 0, 'No longer in active pending queue');
  assert.equal(spool.getDeadLetterRecords().length, 1, 'Moved to DLQ');
  assert.equal(spool.getDeadLetterRecords()[0].status, 'DEAD_LETTER');

  // Replay DLQ
  const replayedCount = spool.replayDeadLetterQueue();
  assert.equal(replayedCount, 1);
  assert.equal(spool.getPendingCount(), 1, 'Returned to active pending queue');

  // Delivery succeeds on retry
  await spool.processQueue(async () => true);
  assert.equal(spool.getPendingCount(), 0);

  spool.destroy();
});

test('LIS Spool 4. RS-232 serial COM port handler with stream framing and watchdog', async () => {
  const mockStream = new MockSerialStream();
  const serialHandler = new LisSerialPortHandler(
    { portName: 'COM3', baudRate: 9600, reconnectIntervalMs: 50 },
    mockStream
  );

  let receivedChunk = '';
  serialHandler.on('data', (chunk) => {
    receivedChunk += chunk;
  });

  await serialHandler.start();
  assert.equal(serialHandler.isConnected(), true);

  // Analyzer sends chunk
  mockStream.emitIncomingChunk('1H|\\^&|||SYSMEX\r\x030A\r\n');
  assert.equal(receivedChunk, '1H|\\^&|||SYSMEX\r\x030A\r\n');

  // Host writes ACK back
  await serialHandler.write('\x06');
  assert.equal(mockStream.writtenChunks[0], '\x06');

  // Simulate USB-Serial unplug
  mockStream.simulateDisconnect();
  assert.equal(serialHandler.isConnected(), false);

  await serialHandler.stop();
});

test('LIS Spool 5. LocalLisBridge Write-Before-ACK and TCP IP allowlist security invariants', () => {
  const bridgeFilePath = path.resolve(process.cwd(), 'lib/lab/lis/local-bridge.ts');
  assert.ok(fs.existsSync(bridgeFilePath), 'local-bridge.ts must exist');

  const code = fs.readFileSync(bridgeFilePath, 'utf-8');

  // Verify Write-Before-ACK guarantee
  assert.ok(code.includes('this.spool.spoolSync'), 'Must synchronously spool frame before ACK');
  const spoolIdx = code.indexOf('this.spool.spoolSync');
  const ackIdx = code.indexOf('const ack = generateHardwareResponse');
  assert.ok(spoolIdx !== -1 && ackIdx !== -1 && spoolIdx < ackIdx, 'Spool write MUST precede hardware ACK generation');

  // Verify TCP IP allowlist check
  assert.ok(code.includes('allowedIps'), 'Must support allowedIps in config');
  assert.ok(code.includes('unauthorized_client_rejected'), 'Must emit unauthorized_client_rejected event');

  // Verify Serial RS-232 handler integration
  assert.ok(code.includes('LisSerialPortHandler'), 'Must integrate LisSerialPortHandler');
  assert.ok(code.includes('startSerialListener'), 'Must implement startSerialListener');
});

test('LIS Spool 6. Production fail-closed invariant: unconfigured serial transport fails without silent mock fallback', async () => {
  const handlerWithoutTransport = new LisSerialPortHandler({ portName: 'COM1', baudRate: 9600 });

  let errorEmitted = null;
  handlerWithoutTransport.on('error', (err) => {
    errorEmitted = err;
  });

  const connected = await handlerWithoutTransport.connect();
  assert.equal(connected, false, 'Connection without transport must return false');
  assert.equal(handlerWithoutTransport.isConnected(), false);
  assert.ok(errorEmitted !== null, 'Must emit error when no transport is configured');
  assert.match(errorEmitted.message, /Automatic MockSerialStream fallback is prohibited/i);

  await handlerWithoutTransport.stop();
});

