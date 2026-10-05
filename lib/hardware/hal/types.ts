/**
 * Onnesha Hospital Management System (OHMS)
 * Hardware Abstraction Layer (HAL) — Universal Interfaces & Types (Gate 5-9, 12)
 *
 * Provides vendor-agnostic contracts for all hospital hardware devices:
 * 1. Thermal Receipt & Label Printers (ESC/POS, WebUSB, WebSerial, Network)
 * 2. Barcode & QR Scanners (Keyboard-Wedge, WebHID, Native Desktop)
 * 3. Biometric Attendance Terminals (ZKTeco, Fingerprint, Face Recognition)
 * 4. Laboratory Information System (LIS) Bridges (ASTM E1381/E1394, HL7 v2.5.1, RS-232/TCP)
 * 5. Picture Archiving and Communication System (PACS) / DICOM Nodes (DIMSE, C-STORE, C-FIND, MWL)
 * 6. Kiosk & Waiting Queue Displays (Watchdog, Audio Chime, Screen Wake Lock)
 */

export type HardwareDeviceClass =
  | "PRINTER"
  | "SCANNER"
  | "BIOMETRIC"
  | "LIS_ANALYZER"
  | "PACS_MODALITY"
  | "QUEUE_DISPLAY";

export type DeviceConnectionState =
  | "UNCONFIGURED"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "BUSY"
  | "ERROR"
  | "SIMULATED";

export interface DeviceStatus {
  deviceClass: HardwareDeviceClass;
  deviceId: string;
  name: string;
  state: DeviceConnectionState;
  isSimulated: boolean;
  lastSeenAt: string | null;
  errorMessage?: string;
  telemetry?: Record<string, unknown>;
}

export interface HardwareEvent<T = unknown> {
  eventType: string;
  deviceClass: HardwareDeviceClass;
  deviceId: string;
  timestamp: string;
  payload: T;
}

// ----------------------------------------------------------------------------
// 1. Printer Abstraction
// ----------------------------------------------------------------------------

export type PrinterPaperWidth = 80 | 58;

export interface PrinterCapabilities {
  paperWidthMm: PrinterPaperWidth;
  dotsPerLine: number; // 576 for 80mm @ 203 DPI, 384 for 58mm
  supportsBanglaRaster: boolean;
  supportsBarcodes: boolean;
  supportsQrCode: boolean;
  supportsCashDrawer: boolean;
  supportsAutoCut: boolean;
}

export interface PrintTicketItem {
  description: string;
  qty?: number;
  unitPrice?: number;
  total?: number;
}

export interface PrintTicket {
  ticketType: "OPD_TOKEN" | "BILLING_RECEIPT" | "LAB_LABEL" | "PHARMACY_SLIP" | "CUSTOM";
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  items?: PrintTicketItem[];
  barcode?: string;
  qrCode?: string;
  banglaTitle?: string;
  banglaNotes?: string[];
  footer?: string;
  cutPaper?: boolean;
  kickDrawer?: boolean;
}

export interface PrinterResult {
  success: boolean;
  jobId: string;
  bytesSent: number;
  transport: string;
  deviceName?: string;
  error?: string;
}

export interface IPrinterService {
  getCapabilities(): PrinterCapabilities;
  getStatus(): Promise<DeviceStatus>;
  printRaw(bytes: Uint8Array): Promise<PrinterResult>;
  printTicket(ticket: PrintTicket): Promise<PrinterResult>;
}

// ----------------------------------------------------------------------------
// 2. Barcode & QR Scanner Abstraction
// ----------------------------------------------------------------------------

export type ScannerCategory = "PATIENT" | "SAMPLE" | "INVOICE" | "MEDICINE" | "GENERIC";

export interface ScannerScanEvent {
  barcode: string;
  category: ScannerCategory;
  timestamp: number;
  interKeyAverageMs: number;
  scannerId?: string;
}

export interface ScannerProfile {
  scannerId: string;
  name: string;
  prefix?: string;
  suffix?: string; // e.g. '\r', '\n', '\t'
  minBarcodeLength: number;
  maxInterKeyDelayMs: number;
  duplicateDebounceMs: number;
  enabledCategories: ScannerCategory[];
}

export interface IScannerService {
  getStatus(): DeviceStatus;
  configureProfile(profile: Partial<ScannerProfile>): void;
  onScan(listener: (event: ScannerScanEvent) => void): () => void;
  simulateScan(barcode: string): void;
}

// ----------------------------------------------------------------------------
// 3. Biometric Terminal Abstraction
// ----------------------------------------------------------------------------

export type BiometricVerifyMode = "FINGERPRINT" | "FACE" | "PASSWORD" | "CARD" | "OTHER";
export type BiometricPunchType = "CHECK_IN" | "CHECK_OUT" | "BREAK_OUT" | "BREAK_IN" | "OVERTIME_IN" | "OVERTIME_OUT";

export interface BiometricPunchRecord {
  deviceBadgeNumber: string;
  staffUhid?: string;
  punchTime: string; // ISO 8601
  punchType: BiometricPunchType;
  verifyMode: BiometricVerifyMode;
  terminalIp: string;
  rawCode?: number;
}

export interface EmployeeBiometricProfile {
  badgeNumber: string;
  fullName: string;
  cardPin?: string;
  department?: string;
  role?: string;
  isEnabled: boolean;
}

export interface BiometricSyncResult {
  success: boolean;
  pulledCount: number;
  newPunchesCount: number;
  duplicatesSkipped: number;
  timestamp: string;
  error?: string;
}

export interface IBiometricService {
  getStatus(): Promise<DeviceStatus>;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  pullAttendanceLogs(sinceTimestamp?: string): Promise<BiometricPunchRecord[]>;
  clearAttendanceLogs(): Promise<boolean>;
  syncEmployees(employees: EmployeeBiometricProfile[]): Promise<{ synced: number; failed: number }>;
  syncDeviceTime(referenceTime?: Date): Promise<boolean>;
}

// ----------------------------------------------------------------------------
// 4. LIS Analyzer Bridge Abstraction
// ----------------------------------------------------------------------------

export type LisProtocol = "ASTM_1394" | "HL7_V2";

export interface LisFrame {
  protocol: LisProtocol;
  rawPayload: string;
  receivedAt: string;
  analyzerCode: string;
  checksumValid: boolean;
}

export interface LisSpoolRecord {
  id: string;
  analyzerCode: string;
  rawPayload: string;
  protocol: LisProtocol;
  spooledAt: string;
  attempts: number;
  lastAttemptAt?: string;
  status: "PENDING" | "DELIVERED" | "DEAD_LETTER";
  error?: string;
}

export interface ILisBridgeService {
  getStatus(): DeviceStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  getPendingSpoolCount(): Promise<number>;
  replayDeadLetterRecords(): Promise<number>;
}

// ----------------------------------------------------------------------------
// 5. DICOM & PACS Modality Abstraction
// ----------------------------------------------------------------------------

export interface DicomNode {
  aeTitle: string;
  host: string;
  port: number;
}

export interface DicomModalityWorklistItem {
  accessionNumber: string;
  patientId: string;
  patientName: string;
  patientBirthDate?: string;
  patientSex?: "M" | "F" | "O";
  modality: "CR" | "DX" | "CT" | "MR" | "US" | "ECG";
  scheduledStationAeTitle: string;
  scheduledProcedureStepStartDate: string;
  scheduledProcedureStepStartTime: string;
  scheduledProcedureStepDescription: string;
  studyInstanceUid: string;
  requestedProcedureId: string;
}

export interface DicomStoreResult {
  success: boolean;
  sopInstanceUid: string;
  sopClassUid: string;
  bytesReceived: number;
  error?: string;
}

export interface IPacsBridgeService {
  getStatus(): DeviceStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  echo(targetNode: DicomNode): Promise<boolean>;
  queryWorklist(filters: Partial<DicomModalityWorklistItem>, targetNode?: DicomNode): Promise<DicomModalityWorklistItem[]>;
  storeInstance(dicomBytes: Uint8Array, sourceNode: DicomNode): Promise<DicomStoreResult>;
}

// ----------------------------------------------------------------------------
// 6. Queue & TV Display Watchdog Abstraction
// ----------------------------------------------------------------------------

export interface DisplayWatchdogState {
  isHealthy: boolean;
  lastHeartbeatAt: number;
  screenWakeLockActive: boolean;
  audioCtxState: "unsupported" | "suspended" | "running" | "closed";
  consecutiveFetchFailures: number;
  isStale: boolean;
}

export interface IDisplayWatchdog {
  recordHeartbeat(): void;
  recordFailure(err: unknown): void;
  getState(): DisplayWatchdogState;
  reset(): void;
}
