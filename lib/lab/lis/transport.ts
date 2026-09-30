/**
 * Onnesha Hospital Management System (OHMS)
 * Laboratory Information System (LIS) — Physical Analyzer Transport Bridge Architecture
 * 
 * Transport Boundary Specification (Section 16-17 of Constitution):
 * - Cloudflare Pages CDN & Edge Workers do not accept inbound raw TCP/RS-232 socket connections.
 * - Physical hospital analyzers (Mindray, Cobas, Sysmex, Bio-Rad) communicate via:
 *     a) RS-232 Serial Port (DB9 / USB-Serial)
 *     b) Local Area Network (TCP/IP socket on hospital subnet e.g. 192.168.x.x)
 * - The Local LIS Bridge runs natively on the hospital laboratory workstation (via Tauri 2 desktop
 *   client background daemon or local node service).
 * - It buffers raw frames, validates checksums, issues ASTM/HL7 hardware ACKs, and forwards
 *   structured payloads over authenticated HTTPS with tenant isolation to OHMS.
 */

import crypto from "node:crypto";

const ASTM_CTRL = {
  STX: "\x02",
  ETX: "\x03",
  EOT: "\x04",
  ENQ: "\x05",
  ACK: "\x06",
  NAK: "\x15",
  CR: "\r",
  LF: "\n",
  ETB: "\x17",
};

function calculateASTMChecksum(frameContent: string): string {
  let sum = 0;
  for (let i = 0; i < frameContent.length; i++) {
    sum = (sum + frameContent.charCodeAt(i)) & 0xff;
  }
  return sum.toString(16).toUpperCase().padStart(2, "0");
}

export type BridgeTransportType = "TCP_IP" | "SERIAL_RS232";
export type BridgeConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "LISTENING"
  | "TRANSMITTING"
  | "ERROR";

export interface LisBridgeConfig {
  analyzerCode: string;
  organizationId: string;
  transportType: BridgeTransportType;
  // TCP Configuration
  host?: string;
  port?: number;
  // Serial Configuration
  serialPort?: string; // e.g. "COM1" or "/dev/ttyUSB0"
  baudRate?: number;   // e.g. 9600, 19200
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  // Cloud Ingestion Target
  cloudIngestUrl: string; // e.g. "https://onnesha-hospital.pages.dev/api/lis/ingest"
  apiSecretToken?: string;
  // Timeouts and Limits
  maxFrameSizeBytes: number; // default: 262144 (256 KB)
  connectionTimeoutMs: number;
  reconnectIntervalMs: number;
}

export interface FrameExtractionResult {
  complete: boolean;
  rawPayload: string;
  frameProtocol: "ASTM_1394" | "HL7_V2" | "UNKNOWN";
  checksumValid: boolean;
  remainingBuffer: string;
}

/**
 * Extracts a complete protocol frame from incoming stream buffer
 */
export function extractProtocolFrame(
  buffer: string,
  maxSizeBytes = 262144
): FrameExtractionResult {
  if (buffer.length > maxSizeBytes) {
    // Buffer overflow safeguard
    return {
      complete: false,
      rawPayload: "",
      frameProtocol: "UNKNOWN",
      checksumValid: false,
      remainingBuffer: "",
    };
  }

  // 1. Check for ASTM E1381 framing: [STX] ... [ETX/ETB] [C1] [C2] [CR] [LF]
  const stxIndex = buffer.indexOf(ASTM_CTRL.STX);
  if (stxIndex !== -1) {
    const etxIndex = buffer.indexOf(ASTM_CTRL.ETX, stxIndex);
    const etbIndex = buffer.indexOf(ASTM_CTRL.ETB, stxIndex);
    const endCharIdx = etxIndex !== -1 ? etxIndex : etbIndex;

    if (endCharIdx !== -1 && buffer.length >= endCharIdx + 5) {
      // Need 2 hex checksum chars + CR + LF (or end)
      const frameWithMarkers = buffer.slice(stxIndex, endCharIdx + 5);
      const frameData = buffer.slice(stxIndex + 1, endCharIdx + 1); // chars after STX up to & incl ETX/ETB
      const checksumPart = buffer.slice(endCharIdx + 1, endCharIdx + 3);
      const computedChecksum = calculateASTMChecksum(frameData);

      const isValid = checksumPart.toUpperCase() === computedChecksum.toUpperCase();
      const remaining = buffer.slice(endCharIdx + 5);

      return {
        complete: true,
        rawPayload: frameWithMarkers,
        frameProtocol: "ASTM_1394",
        checksumValid: isValid,
        remainingBuffer: remaining,
      };
    }
  }

  // 2. Check for HL7 v2.x framing (MLLP or pure MSH...CR)
  // MLLP: [VT=0x0B] ... [FS=0x1C] [CR=0x0D]
  const vtIndex = buffer.indexOf("\x0B");
  if (vtIndex !== -1) {
    const fsIndex = buffer.indexOf("\x1C\x0D", vtIndex);
    if (fsIndex !== -1) {
      const rawPayload = buffer.slice(vtIndex + 1, fsIndex);
      const remaining = buffer.slice(fsIndex + 2);
      return {
        complete: true,
        rawPayload,
        frameProtocol: "HL7_V2",
        checksumValid: true,
        remainingBuffer: remaining,
      };
    }
  }

  // Pure HL7 message without MLLP envelope: MSH ... up to terminator
  if (buffer.startsWith("MSH|") && (buffer.includes("\r\n\r\n") || buffer.endsWith("\r\n"))) {
    return {
      complete: true,
      rawPayload: buffer.trim(),
      frameProtocol: "HL7_V2",
      checksumValid: true,
      remainingBuffer: "",
    };
  }

  // Incomplete frame, keep buffering
  return {
    complete: false,
    rawPayload: "",
    frameProtocol: "UNKNOWN",
    checksumValid: false,
    remainingBuffer: buffer,
  };
}

/**
 * Computes deterministic payload fingerprint for duplicate transmission detection
 */
export function computePayloadFingerprint(
  analyzerCode: string,
  sampleBarcode: string,
  rawPayload: string
): string {
  // Normalize line endings for deterministic hashing
  const normalized = rawPayload.replace(/\r\n/g, "\n").trim();
  const content = `${analyzerCode}:${sampleBarcode}:${normalized}`;
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Generates immediate hardware reply according to protocol
 */
export function generateHardwareResponse(
  protocol: "ASTM_1394" | "HL7_V2",
  isValid: boolean,
  messageControlId = "MSG01"
): string {
  if (protocol === "ASTM_1394") {
    // ASTM E1381 responds with ACK (0x06) if frame checksum is valid, or NAK (0x15) if corrupted
    return isValid ? ASTM_CTRL.ACK : ASTM_CTRL.NAK;
  }

  // HL7 v2 responds with MSA Application Accept (AA) or Application Error (AE)
  const status = isValid ? "AA" : "AE";
  const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return [
    `MSH|^~\\&|OHMS_LIS|ONNESHA_HOSPITAL|ANALYZER|LAB|${now}||ACK^R01|ACK_${messageControlId}|P|2.5.1`,
    `MSA|${status}|${messageControlId}`,
    "",
  ].join("\r");
}
