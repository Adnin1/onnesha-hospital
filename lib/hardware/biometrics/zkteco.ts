/**
 * Onnesha Hospital Management System (OHMS)
 * ZKTeco Biometrics Protocol, Service & Loopback Simulator (Gate 7)
 *
 * Unified autonomous engine:
 * 1. ZKTeco binary packet framing & checksum verification
 * 2. 32-bit timestamp mathematical encoding & decoding
 * 3. 40-byte / 16-byte attendance log payload parsing
 * 4. ZkTecoBiometricService implementing IBiometricService with sliding window debounce
 * 5. ZkTecoSimulatorSocket loopback simulator for contract testing without physical hardware
 */

import net from "node:net";
import type {
  IBiometricService,
  DeviceStatus,
  BiometricPunchRecord,
  BiometricPunchType,
  BiometricVerifyMode,
  EmployeeBiometricProfile,
} from "../hal/types";

export const ZK_START_TAG = 0x5050; // 'PP' (20560)

export const ZK_COMMANDS = {
  CMD_CONNECT: 1000,
  CMD_EXIT: 1001,
  CMD_ENABLEDEVICE: 1008,
  CMD_DISABLEDEVICE: 1007,
  CMD_RESTART: 1003,
  CMD_POWEROFF: 1004,
  CMD_GET_TIME: 201,
  CMD_SET_TIME: 202,
  CMD_GET_VERSION: 1100,
  CMD_DEVICE: 11,
  CMD_SET_USER: 8,          // Write user info / employee sync
  CMD_DELETE_USER: 18,      // Delete user info
  CMD_USERTEMP_RRQ: 9,      // Request user templates / list
  CMD_ATTLOG_RRQ: 13,        // Request attendance logs
  CMD_CLEAR_ATTLOG: 14,      // Clear attendance log
  CMD_CLEAR_DATA: 15,
  CMD_PREPARE_DATA: 1500,
  CMD_DATA: 1501,
  CMD_ACK_OK: 2000,          // Success ACK
  CMD_ACK_ERROR: 2001,       // Error NAK
  CMD_ACK_DATA: 2003,        // Data follows
  CMD_ACK_RETRY: 2004,
  CMD_ACK_REPEAT: 2005,
  CMD_ACK_UNAUTH: 2006,
} as const;

export interface ZkPacketHeader {
  commandId: number;
  checksum: number;
  sessionId: number;
  replyId: number;
}

export interface ZkDecodedPacket {
  header: ZkPacketHeader;
  payload: Buffer;
  isOk: boolean;
}

export interface ZkAttendanceRawRecord {
  userSn: number;
  badgeNumber: string;
  verifyMode: number;
  timestamp: Date;
  status: number;
  workCode?: number;
}

export interface ZkDeviceConfig {
  host: string;
  port: number;
  timeoutMs?: number;
  commKey?: number;
  organizationId?: string;
}

// ----------------------------------------------------------------------------
// Protocol Encoding & Decoding
// ----------------------------------------------------------------------------

export function calculateZkChecksum(buf: Buffer): number {
  let sum = 0;
  const len = buf.length;

  for (let i = 0; i < len; i += 2) {
    if (i === 2) continue; // Skip checksum bytes
    if (i + 1 < len) {
      sum += buf.readUInt16LE(i);
    } else {
      sum += buf[i];
    }
  }

  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  return (~sum) & 0xffff;
}

export function createZkPacket(
  commandId: number,
  sessionId: number,
  replyId: number,
  payload: Buffer = Buffer.alloc(0)
): Buffer {
  const packet = Buffer.alloc(8 + payload.length);
  packet.writeUInt16LE(commandId, 0);
  packet.writeUInt16LE(0, 2);
  packet.writeUInt16LE(sessionId, 4);
  packet.writeUInt16LE(replyId, 6);

  if (payload.length > 0) {
    payload.copy(packet, 8);
  }

  const checksum = calculateZkChecksum(packet);
  packet.writeUInt16LE(checksum, 2);
  return packet;
}

export function decodeZkPacket(buf: Buffer): ZkDecodedPacket {
  if (buf.length < 8) {
    throw new Error(`Invalid ZKTeco packet: buffer length ${buf.length} < 8 header bytes`);
  }

  const commandId = buf.readUInt16LE(0);
  const checksum = buf.readUInt16LE(2);
  const sessionId = buf.readUInt16LE(4);
  const replyId = buf.readUInt16LE(6);
  const payload = buf.subarray(8);

  const calculated = calculateZkChecksum(buf);
  const header: ZkPacketHeader = {
    commandId,
    checksum,
    sessionId,
    replyId,
  };

  return {
    header,
    payload,
    isOk: (commandId === ZK_COMMANDS.CMD_ACK_OK || commandId === ZK_COMMANDS.CMD_ACK_DATA) && calculated === checksum,
  };
}

export function decodeZkTimestamp(val: number): Date {
  let rem = val;
  const second = rem % 60;
  rem = Math.floor(rem / 60);
  const minute = rem % 60;
  rem = Math.floor(rem / 60);
  const hour = rem % 24;
  rem = Math.floor(rem / 24);
  const day = (rem % 31) + 1;
  rem = Math.floor(rem / 31);
  const month = (rem % 12) + 1;
  rem = Math.floor(rem / 12);
  const year = (rem % 100) + 2000;

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

export function encodeZkTimestamp(date: Date): number {
  const year = date.getUTCFullYear() % 100;
  const month = date.getUTCMonth();
  const day = date.getUTCDate() - 1;
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  const days = (year * 12 + month) * 31 + day;
  return days * 86400 + (hour * 3600 + minute * 60 + second);
}

export function mapZkVerifyMode(rawMode: number): BiometricVerifyMode {
  switch (rawMode) {
    case 1:
      return "FINGERPRINT";
    case 15:
      return "FACE";
    case 0:
      return "PASSWORD";
    case 2:
      return "CARD";
    default:
      return "OTHER";
  }
}

export function mapZkPunchType(rawStatus: number): BiometricPunchType {
  switch (rawStatus) {
    case 0:
      return "CHECK_IN";
    case 1:
      return "CHECK_OUT";
    case 2:
      return "BREAK_OUT";
    case 3:
      return "BREAK_IN";
    case 4:
      return "OVERTIME_IN";
    case 5:
      return "OVERTIME_OUT";
    default:
      return "CHECK_IN";
  }
}

export function parseZkAttendancePayload(payload: Buffer): ZkAttendanceRawRecord[] {
  const records: ZkAttendanceRawRecord[] = [];
  const len = payload.length;

  if (len === 0) return records;

  if (len % 40 === 0) {
    const count = len / 40;
    for (let i = 0; i < count; i++) {
      const offset = i * 40;
      const userSn = payload.readUInt16LE(offset);
      const badgeRaw = payload.subarray(offset + 2, offset + 26);
      const nullIdx = badgeRaw.indexOf(0);
      const badgeNumber = badgeRaw
        .subarray(0, nullIdx >= 0 ? nullIdx : badgeRaw.length)
        .toString("ascii")
        .trim();

      const verifyMode = payload.readUInt8(offset + 26);
      const rawTime = payload.readUInt32LE(offset + 27);
      const status = payload.readUInt8(offset + 31);
      const workCode = payload.readUInt32LE(offset + 32);

      records.push({
        userSn,
        badgeNumber: badgeNumber || String(userSn),
        verifyMode,
        timestamp: decodeZkTimestamp(rawTime),
        status,
        workCode,
      });
    }
    return records;
  }

  if (len % 16 === 0) {
    const count = len / 16;
    for (let i = 0; i < count; i++) {
      const offset = i * 16;
      const userSn = payload.readUInt16LE(offset);
      const verifyMode = payload.readUInt8(offset + 2);
      const rawTime = payload.readUInt32LE(offset + 4);
      const status = payload.readUInt8(offset + 8);

      records.push({
        userSn,
        badgeNumber: String(userSn),
        verifyMode,
        timestamp: decodeZkTimestamp(rawTime),
        status,
      });
    }
    return records;
  }

  return records;
}

export function formatZk40ByteAttendanceRecord(
  userSn: number,
  badgeNumber: string,
  verifyMode: number,
  timestamp: Date,
  status: number
): Buffer {
  const buf = Buffer.alloc(40, 0);
  buf.writeUInt16LE(userSn, 0);
  const badgeBytes = Buffer.from(badgeNumber, "ascii");
  badgeBytes.copy(buf, 2, 0, Math.min(24, badgeBytes.length));
  buf.writeUInt8(verifyMode, 26);
  buf.writeUInt32LE(encodeZkTimestamp(timestamp), 27);
  buf.writeUInt8(status, 31);
  return buf;
}

export function formatZkUserRecord(employee: EmployeeBiometricProfile): Buffer {
  const buf = Buffer.alloc(72, 0);
  const numericPin = parseInt(employee.badgeNumber.replace(/\D/g, ""), 10) || 1;
  buf.writeUInt16LE(numericPin & 0xffff, 0);
  buf.writeUInt8(employee.role === "ADMIN" || employee.role === "DIRECTOR" ? 14 : 0, 2);
  if (employee.cardPin) {
    const pinStr = employee.cardPin.slice(0, 8);
    buf.write(pinStr, 3, pinStr.length, "ascii");
  }
  const nameBytes = Buffer.from(employee.fullName.slice(0, 24), "utf-8");
  nameBytes.copy(buf, 11, 0, Math.min(24, nameBytes.length));
  buf.writeUInt32LE(0, 35); // Card number
  buf.writeUInt8(1, 39);    // Group number
  buf.writeUInt16LE(0, 40); // Timezone
  const badgeBytes = Buffer.from(employee.badgeNumber.slice(0, 24), "ascii");
  badgeBytes.copy(buf, 48, 0, Math.min(24, badgeBytes.length));
  return buf;
}

export function parseZkUserRecord(buf: Buffer): EmployeeBiometricProfile {
  if (buf.length < 24) {
    throw new Error(`Buffer too short for ZK user record: ${buf.length} < 24 bytes`);
  }
  const privilege = buf.readUInt8(2);
  const nameEnd = buf.indexOf(0, 11) !== -1 ? buf.indexOf(0, 11) : 35;
  const fullName = buf.subarray(11, Math.min(nameEnd, 35)).toString("utf-8").trim();
  let badgeNumber = "";
  if (buf.length >= 72) {
    const badgeEnd = buf.indexOf(0, 48) !== -1 ? buf.indexOf(0, 48) : 72;
    badgeNumber = buf.subarray(48, Math.min(badgeEnd, 72)).toString("ascii").trim();
  }
  if (!badgeNumber) {
    const pin = buf.readUInt16LE(0);
    badgeNumber = `EMP-${pin}`;
  }
  return {
    badgeNumber,
    fullName: fullName || badgeNumber,
    role: privilege === 14 ? "ADMIN" : "STAFF",
    isEnabled: true,
  };
}

// ----------------------------------------------------------------------------
// Network Socket Interface & Biometric Service
// ----------------------------------------------------------------------------

export interface ZkNetworkSocket {
  send(packet: Buffer): Promise<Buffer>;
  close(): Promise<void>;
  isConnected(): boolean;
}

export class ZkTecoTcpSocket implements ZkNetworkSocket {
  private socket: net.Socket | null = null;
  private host: string;
  private port: number;
  private timeoutMs: number;
  private isConnectedState = false;

  constructor(host: string, port = 4370, timeoutMs = 5000) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  public isConnected(): boolean {
    return this.isConnectedState && this.socket !== null && !this.socket.destroyed;
  }

  public async close(): Promise<void> {
    this.isConnectedState = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  public async send(packet: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      this.socket = sock;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
      };

      timer = setTimeout(() => {
        cleanup();
        sock.destroy();
        this.isConnectedState = false;
        reject(new Error(`ZKTeco TCP connection timeout to ${this.host}:${this.port} (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      sock.connect(this.port, this.host, () => {
        this.isConnectedState = true;
        sock.write(packet);
      });

      sock.once("data", (data) => {
        cleanup();
        this.isConnectedState = true;
        resolve(data);
      });

      sock.once("error", (err) => {
        cleanup();
        this.isConnectedState = false;
        reject(err);
      });
    });
  }
}

export class ZkTecoBiometricService implements IBiometricService {
  private config: ZkDeviceConfig;
  private socket: ZkNetworkSocket | null = null;
  private sessionId = 0;
  private replyId = 0;
  private isConnectedState = false;
  private lastSeenAt: string | null = null;
  private lastError: string | undefined = undefined;

  private recentPunchCache: Map<string, number> = new Map();
  private duplicateDebounceSeconds = 60;

  constructor(config: ZkDeviceConfig, socket?: ZkNetworkSocket) {
    this.config = {
      timeoutMs: 5000,
      commKey: 0,
      ...config,
    };
    if (socket) {
      this.socket = socket;
    }
  }

  public setSocket(socket: ZkNetworkSocket): void {
    this.socket = socket;
  }

  public async getStatus(): Promise<DeviceStatus> {
    const isSim = this.socket instanceof ZkTecoSimulatorSocket;
    return {
      deviceClass: "BIOMETRIC",
      deviceId: `ZK_${this.config.host}_${this.config.port}`,
      name: `ZKTeco Biometric Terminal (${this.config.host})`,
      state: !this.socket
        ? "UNCONFIGURED"
        : this.isConnectedState
        ? "CONNECTED"
        : "DISCONNECTED",
      isSimulated: isSim,
      lastSeenAt: this.lastSeenAt,
      errorMessage: this.lastError,
      telemetry: {
        host: this.config.host,
        port: this.config.port,
        sessionId: this.sessionId,
        transport: isSim ? "LOOPBACK_SIMULATOR" : this.socket ? "TCP_SOCKET" : "NONE",
      },
    };
  }

  public async connect(): Promise<boolean> {
    if (!this.socket) {
      this.lastError = "No network socket or transport adapter configured";
      return false;
    }

    try {
      this.replyId = 0;
      this.sessionId = 0;

      const connectPacket = createZkPacket(
        ZK_COMMANDS.CMD_CONNECT,
        this.sessionId,
        this.replyId
      );

      const responseBuf = await this.socket.send(connectPacket);
      const decoded = decodeZkPacket(responseBuf);

      if (decoded.header.commandId === ZK_COMMANDS.CMD_ACK_OK) {
        this.sessionId = decoded.header.sessionId;
        this.replyId = decoded.header.replyId;
        this.isConnectedState = true;
        this.lastSeenAt = new Date().toISOString();
        this.lastError = undefined;
        return true;
      }

      this.lastError = `Connection rejected by terminal (Command code: ${decoded.header.commandId})`;
      this.isConnectedState = false;
      return false;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.isConnectedState = false;
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnectedState && this.socket) {
      try {
        const exitPacket = createZkPacket(
          ZK_COMMANDS.CMD_EXIT,
          this.sessionId,
          ++this.replyId
        );
        await this.socket.send(exitPacket);
      } catch {
        // Ignore exit error
      }
    }
    if (this.socket) {
      await this.socket.close();
    }
    this.isConnectedState = false;
  }

  public async ping(): Promise<boolean> {
    if (!this.isConnectedState || !this.socket) {
      return this.connect();
    }

    try {
      const pingPacket = createZkPacket(
        ZK_COMMANDS.CMD_GET_TIME,
        this.sessionId,
        ++this.replyId
      );
      const res = await this.socket.send(pingPacket);
      const decoded = decodeZkPacket(res);
      const ok = decoded.isOk;
      if (ok) {
        this.lastSeenAt = new Date().toISOString();
      }
      return ok;
    } catch {
      this.isConnectedState = false;
      return false;
    }
  }

  public async pullAttendanceLogs(sinceTimestamp?: string): Promise<BiometricPunchRecord[]> {
    if (!this.isConnectedState) {
      const ok = await this.connect();
      if (!ok) {
        throw new Error(`Cannot pull attendance: ${this.lastError || "Device disconnected"}`);
      }
    }

    if (!this.socket) {
      throw new Error("No active socket transport");
    }

    const reqPacket = createZkPacket(
      ZK_COMMANDS.CMD_ATTLOG_RRQ,
      this.sessionId,
      ++this.replyId
    );

    const responseBuf = await this.socket.send(reqPacket);
    const decoded = decodeZkPacket(responseBuf);

    if (decoded.header.commandId === ZK_COMMANDS.CMD_ACK_OK && decoded.payload.length === 0) {
      return [];
    }

    const rawRecords = parseZkAttendancePayload(decoded.payload);
    const sinceDate = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;
    const deduplicated: BiometricPunchRecord[] = [];
    const nowMs = Date.now();

    for (const [key, ts] of this.recentPunchCache.entries()) {
      if (nowMs - ts > 3600 * 1000) {
        this.recentPunchCache.delete(key);
      }
    }

    for (const raw of rawRecords) {
      const punchMs = raw.timestamp.getTime();

      if (sinceDate > 0 && punchMs <= sinceDate) {
        continue;
      }

      const lastPunchMs = this.recentPunchCache.get(raw.badgeNumber);
      if (
        lastPunchMs !== undefined &&
        Math.abs(punchMs - lastPunchMs) < this.duplicateDebounceSeconds * 1000
      ) {
        continue; // Suppress duplicate punch
      }
      this.recentPunchCache.set(raw.badgeNumber, punchMs);

      deduplicated.push({
        deviceBadgeNumber: raw.badgeNumber,
        punchTime: raw.timestamp.toISOString(),
        punchType: mapZkPunchType(raw.status),
        verifyMode: mapZkVerifyMode(raw.verifyMode),
        terminalIp: this.config.host,
        rawCode: raw.userSn,
      });
    }

    this.lastSeenAt = new Date().toISOString();
    return deduplicated;
  }

  public async clearAttendanceLogs(): Promise<boolean> {
    if (!this.isConnectedState) {
      const ok = await this.connect();
      if (!ok) return false;
    }
    if (!this.socket) return false;

    const reqPacket = createZkPacket(
      ZK_COMMANDS.CMD_CLEAR_ATTLOG,
      this.sessionId,
      ++this.replyId
    );

    const responseBuf = await this.socket.send(reqPacket);
    const decoded = decodeZkPacket(responseBuf);
    return decoded.header.commandId === ZK_COMMANDS.CMD_ACK_OK;
  }

  public async syncEmployees(
    employees: EmployeeBiometricProfile[]
  ): Promise<{ synced: number; failed: number }> {
    if (!this.isConnectedState) {
      const ok = await this.connect();
      if (!ok || !this.socket) {
        // Fail-closed: Zero false-green when disconnected
        return { synced: 0, failed: employees.length };
      }
    }

    if (!this.socket) {
      return { synced: 0, failed: employees.length };
    }

    if (employees.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const emp of employees) {
      if (!emp || !emp.badgeNumber || !emp.fullName) {
        failed++;
        continue;
      }

      try {
        const userBuf = formatZkUserRecord(emp);
        const reqPacket = createZkPacket(
          ZK_COMMANDS.CMD_SET_USER,
          this.sessionId,
          ++this.replyId,
          userBuf
        );

        const resBuf = await this.socket.send(reqPacket);
        const decoded = decodeZkPacket(resBuf);
        if (decoded.isOk && decoded.header.commandId === ZK_COMMANDS.CMD_ACK_OK) {
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    this.lastSeenAt = new Date().toISOString();
    return { synced, failed };
  }

  public async syncDeviceTime(referenceTime: Date = new Date()): Promise<boolean> {
    if (!this.isConnectedState) {
      const ok = await this.connect();
      if (!ok) return false;
    }
    if (!this.socket) return false;

    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(Math.floor(referenceTime.getTime() / 1000), 0);

    const reqPacket = createZkPacket(
      ZK_COMMANDS.CMD_SET_TIME,
      this.sessionId,
      ++this.replyId,
      payload
    );

    const res = await this.socket.send(reqPacket);
    const decoded = decodeZkPacket(res);
    return decoded.isOk;
  }
}

// ----------------------------------------------------------------------------
// Loopback Hardware Simulator
// ----------------------------------------------------------------------------

export interface SimulatedPunch {
  badgeNumber: string;
  verifyMode: number;
  timestamp: Date;
  status: number;
}

export class ZkTecoSimulatorSocket implements ZkNetworkSocket {
  private activeSessionId = 0x42fa;
  private connected = false;
  private punches: SimulatedPunch[] = [];
  private simulatedUsers: Map<string, EmployeeBiometricProfile> = new Map();

  constructor() {
    this.seedDefaultHospitalPunches();
  }

  private seedDefaultHospitalPunches(): void {
    const now = new Date();
    const morningShift = new Date(now.getTime() - 4 * 3600 * 1000);
    const lunchBreak = new Date(now.getTime() - 1 * 3600 * 1000);

    this.punches = [
      {
        badgeNumber: "EMP-101",
        verifyMode: 15,
        timestamp: morningShift,
        status: 0,
      },
      {
        badgeNumber: "EMP-204",
        verifyMode: 1,
        timestamp: new Date(morningShift.getTime() + 5 * 60000),
        status: 0,
      },
      {
        badgeNumber: "EMP-309",
        verifyMode: 2,
        timestamp: new Date(morningShift.getTime() + 12 * 60000),
        status: 0,
      },
      {
        badgeNumber: "EMP-204",
        verifyMode: 1,
        timestamp: lunchBreak,
        status: 2,
      },
    ];
  }

  public addSimulatedPunch(punch: SimulatedPunch): void {
    this.punches.push(punch);
  }

  public clearPunches(): void {
    this.punches = [];
  }

  public getSimulatedUsers(): EmployeeBiometricProfile[] {
    return Array.from(this.simulatedUsers.values());
  }

  public clearSimulatedUsers(): void {
    this.simulatedUsers.clear();
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async close(): Promise<void> {
    this.connected = false;
  }

  public async send(packet: Buffer): Promise<Buffer> {
    const decoded = decodeZkPacket(packet);
    const { commandId, sessionId, replyId } = decoded.header;

    switch (commandId) {
      case ZK_COMMANDS.CMD_CONNECT: {
        this.connected = true;
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          this.activeSessionId,
          replyId
        );
      }

      case ZK_COMMANDS.CMD_EXIT: {
        this.connected = false;
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId
        );
      }

      case ZK_COMMANDS.CMD_GET_TIME: {
        const timePayload = Buffer.alloc(4);
        timePayload.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId,
          timePayload
        );
      }

      case ZK_COMMANDS.CMD_SET_TIME: {
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId
        );
      }

      case ZK_COMMANDS.CMD_SET_USER: {
        try {
          const user = parseZkUserRecord(decoded.payload);
          this.simulatedUsers.set(user.badgeNumber, user);
          return createZkPacket(
            ZK_COMMANDS.CMD_ACK_OK,
            sessionId,
            replyId
          );
        } catch {
          return createZkPacket(
            ZK_COMMANDS.CMD_ACK_ERROR,
            sessionId,
            replyId
          );
        }
      }

      case ZK_COMMANDS.CMD_DELETE_USER: {
        const pin = decoded.payload.length >= 2 ? decoded.payload.readUInt16LE(0) : 0;
        this.simulatedUsers.delete(`EMP-${pin}`);
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId
        );
      }

      case ZK_COMMANDS.CMD_ATTLOG_RRQ: {
        if (this.punches.length === 0) {
          return createZkPacket(
            ZK_COMMANDS.CMD_ACK_OK,
            sessionId,
            replyId
          );
        }

        const recordBuffers: Buffer[] = [];
        let sn = 1;
        for (const p of this.punches) {
          const recBuf = formatZk40ByteAttendanceRecord(
            sn++,
            p.badgeNumber,
            p.verifyMode,
            p.timestamp,
            p.status
          );
          recordBuffers.push(recBuf);
        }

        const fullPayload = Buffer.concat(recordBuffers);
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_DATA,
          sessionId,
          replyId,
          fullPayload
        );
      }

      case ZK_COMMANDS.CMD_CLEAR_ATTLOG: {
        this.punches = [];
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId
        );
      }

      default: {
        return createZkPacket(
          ZK_COMMANDS.CMD_ACK_OK,
          sessionId,
          replyId
        );
      }
    }
  }
}
