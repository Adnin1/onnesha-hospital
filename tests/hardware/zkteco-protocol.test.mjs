import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateZkChecksum,
  createZkPacket,
  decodeZkPacket,
  encodeZkTimestamp,
  decodeZkTimestamp,
  formatZk40ByteAttendanceRecord,
  parseZkAttendancePayload,
  formatZkUserRecord,
  parseZkUserRecord,
  ZkTecoBiometricService,
  ZkTecoSimulatorSocket,
  ZkTecoTcpSocket,
  ZK_COMMANDS,
} from '../../lib/hardware/biometrics/zkteco.ts';

test('ZKTeco 1. Packet framing and checksum verification', () => {
  const payload = Buffer.from('TEST_PAYLOAD', 'ascii');
  const packet = createZkPacket(ZK_COMMANDS.CMD_CONNECT, 0x1234, 0x5678, payload);

  assert.equal(packet.length, 8 + payload.length);
  assert.equal(packet.readUInt16LE(0), ZK_COMMANDS.CMD_CONNECT);
  assert.equal(packet.readUInt16LE(4), 0x1234);
  assert.equal(packet.readUInt16LE(6), 0x5678);

  const decoded = decodeZkPacket(packet);
  assert.equal(decoded.header.commandId, ZK_COMMANDS.CMD_CONNECT);
  assert.equal(decoded.header.sessionId, 0x1234);
  assert.equal(decoded.header.replyId, 0x5678);
  assert.equal(decoded.payload.toString('ascii'), 'TEST_PAYLOAD');
});

test('ZKTeco 2. Timestamp 32-bit packing and unpacking mathematical roundtrip', () => {
  const original = new Date(Date.UTC(2026, 9, 6, 8, 30, 45)); // 2026-10-06 08:30:45 UTC
  const encoded = encodeZkTimestamp(original);
  assert.ok(encoded > 0, 'Encoded timestamp must be positive 32-bit integer');

  const decoded = decodeZkTimestamp(encoded);
  assert.equal(decoded.getUTCFullYear(), 2026);
  assert.equal(decoded.getUTCMonth(), 9);
  assert.equal(decoded.getUTCDate(), 6);
  assert.equal(decoded.getUTCHours(), 8);
  assert.equal(decoded.getUTCMinutes(), 30);
  assert.equal(decoded.getUTCSeconds(), 45);
});

test('ZKTeco 3. 40-byte attendance record payload parsing', () => {
  const testDate = new Date(Date.UTC(2026, 9, 6, 9, 15, 0));
  const rec1 = formatZk40ByteAttendanceRecord(1, 'DOC-001', 15, testDate, 0); // Face, check-in
  const rec2 = formatZk40ByteAttendanceRecord(2, 'NURSE-042', 1, testDate, 1); // Finger, check-out

  const combined = Buffer.concat([rec1, rec2]);
  assert.equal(combined.length, 80);

  const parsed = parseZkAttendancePayload(combined);
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].badgeNumber, 'DOC-001');
  assert.equal(parsed[0].verifyMode, 15);
  assert.equal(parsed[0].status, 0);

  assert.equal(parsed[1].badgeNumber, 'NURSE-042');
  assert.equal(parsed[1].verifyMode, 1);
  assert.equal(parsed[1].status, 1);
});

test('ZKTeco 4. Simulator loopback session connection and time synchronization', async () => {
  const simulator = new ZkTecoSimulatorSocket();
  const service = new ZkTecoBiometricService({ host: '127.0.0.1', port: 4370 }, simulator);

  const connected = await service.connect();
  assert.ok(connected, 'Must successfully establish session with simulator');

  const status = await service.getStatus();
  assert.equal(status.state, 'CONNECTED');
  assert.ok(status.lastSeenAt !== null);

  const timeSynced = await service.syncDeviceTime(new Date());
  assert.ok(timeSynced, 'Must successfully sync time with terminal');

  await service.disconnect();
  const statusAfter = await service.getStatus();
  assert.equal(statusAfter.state, 'DISCONNECTED');
});

test('ZKTeco 5. Attendance log pull, duplicate punch debounce, and clear logs', async () => {
  const simulator = new ZkTecoSimulatorSocket();
  simulator.clearPunches();

  const now = new Date();
  // Add 1 valid punch
  simulator.addSimulatedPunch({
    badgeNumber: 'STAFF-100',
    verifyMode: 1,
    timestamp: now,
    status: 0,
  });

  // Add immediate duplicate punch 10 seconds later (accidental double tap)
  simulator.addSimulatedPunch({
    badgeNumber: 'STAFF-100',
    verifyMode: 1,
    timestamp: new Date(now.getTime() + 10000),
    status: 0,
  });

  // Add punch for another employee
  simulator.addSimulatedPunch({
    badgeNumber: 'STAFF-200',
    verifyMode: 15,
    timestamp: new Date(now.getTime() + 15000),
    status: 0,
  });

  const service = new ZkTecoBiometricService({ host: '127.0.0.1', port: 4370 }, simulator);
  await service.connect();

  const punches = await service.pullAttendanceLogs();
  // Expect STAFF-100 duplicate to be suppressed, so 2 unique punches remain
  assert.equal(punches.length, 2, 'Duplicate punch within debounce window must be suppressed');
  assert.equal(punches[0].deviceBadgeNumber, 'STAFF-100');
  assert.equal(punches[1].deviceBadgeNumber, 'STAFF-200');

  // Verify clear attendance logs
  const cleared = await service.clearAttendanceLogs();
  assert.ok(cleared, 'Must successfully send clear attendance logs command');

  const emptyPunches = await service.pullAttendanceLogs();
  assert.equal(emptyPunches.length, 0, 'Punches after clear must be empty');

  await service.disconnect();
});

test('ZKTeco 6. User record 72-byte payload binary formatting and parsing roundtrip', () => {
  const profile = {
    badgeNumber: 'DOC-1052',
    fullName: 'Dr. Nazmul Huda',
    cardPin: '8842',
    role: 'ADMIN',
    isEnabled: true,
  };

  const buffer = formatZkUserRecord(profile);
  assert.equal(buffer.length, 72, 'User record must be exactly 72 bytes');

  const parsed = parseZkUserRecord(buffer);
  assert.equal(parsed.badgeNumber, 'DOC-1052');
  assert.equal(parsed.fullName, 'Dr. Nazmul Huda');
  assert.equal(parsed.role, 'ADMIN');
  assert.equal(parsed.isEnabled, true);
});

test('ZKTeco 7. syncEmployees actually provisions profiles to device and tracks synced vs failed', async () => {
  const simulator = new ZkTecoSimulatorSocket();
  simulator.clearSimulatedUsers();
  const service = new ZkTecoBiometricService({ host: '127.0.0.1', port: 4370 }, simulator);

  await service.connect();

  const employees = [
    { badgeNumber: 'DOC-101', fullName: 'Dr. Afia Siddika', role: 'STAFF', isEnabled: true },
    { badgeNumber: 'NURSE-202', fullName: 'Sister Rehana', role: 'STAFF', isEnabled: true },
    { badgeNumber: '', fullName: 'Invalid No Badge', role: 'STAFF', isEnabled: true }, // Invalid badge
  ];

  const result = await service.syncEmployees(employees);
  assert.equal(result.synced, 2, 'Must successfully sync 2 valid employees');
  assert.equal(result.failed, 1, 'Must record 1 failed employee due to empty badge');

  const storedInSimulator = simulator.getSimulatedUsers();
  assert.equal(storedInSimulator.length, 2);
  assert.equal(storedInSimulator[0].badgeNumber, 'DOC-101');
  assert.equal(storedInSimulator[1].badgeNumber, 'NURSE-202');

  await service.disconnect();
});

test('ZKTeco 8. syncEmployees fails closed without fake success when terminal is disconnected', async () => {
  // Service created without active socket connection
  const disconnectedService = new ZkTecoBiometricService({ host: '10.255.255.1', port: 4370 });

  const employees = [
    { badgeNumber: 'DOC-999', fullName: 'Ghost Doctor', role: 'STAFF', isEnabled: true },
  ];

  const result = await disconnectedService.syncEmployees(employees);
  // Zero False-Green: MUST NOT return synced: 1
  assert.equal(result.synced, 0, 'Disconnected terminal must never report false-green synced=1');
  assert.equal(result.failed, 1, 'Disconnected terminal must report failure');
});

