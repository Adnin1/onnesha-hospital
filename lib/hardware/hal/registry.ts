/**
 * Onnesha Hospital Management System (OHMS)
 * Hardware Registry & Device Profile Manager (HAL)
 *
 * Centralized registry storing configuration, device profiles, status,
 * and fallback chains across all hospital departments.
 */

import type {
  HardwareDeviceClass,
  DeviceStatus,
  DeviceConnectionState,
  ScannerProfile,
  DicomNode,
} from "./types";

export interface DeviceProfile {
  id: string;
  deviceClass: HardwareDeviceClass;
  name: string;
  department: string;
  isSimulated: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface HardwareRegistryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Default in-memory storage fallback for SSR / headless Node / tests
class MemoryStorage implements HardwareRegistryStorage {
  private data: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const REGISTRY_STORAGE_KEY = "ohms_hardware_device_profiles_v1";

export class HardwareDeviceRegistry {
  private static instance: HardwareDeviceRegistry;
  private storage: HardwareRegistryStorage;
  private profiles: Map<string, DeviceProfile> = new Map();
  private statuses: Map<string, DeviceStatus> = new Map();

  private constructor(storage?: HardwareRegistryStorage) {
    if (storage) {
      this.storage = storage;
    } else if (typeof window !== "undefined" && window.localStorage) {
      this.storage = window.localStorage;
    } else {
      this.storage = new MemoryStorage();
    }
    this.loadProfiles();
    this.initDefaultHospitalProfiles();
  }

  public static getInstance(storage?: HardwareRegistryStorage): HardwareDeviceRegistry {
    if (!HardwareDeviceRegistry.instance) {
      HardwareDeviceRegistry.instance = new HardwareDeviceRegistry(storage);
    }
    return HardwareDeviceRegistry.instance;
  }

  /**
   * Reset instance (mainly used for tests)
   */
  public static resetInstance(): void {
    HardwareDeviceRegistry.instance = undefined as unknown as HardwareDeviceRegistry;
  }

  private loadProfiles(): void {
    try {
      const serialized = this.storage.getItem(REGISTRY_STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized) as DeviceProfile[];
        for (const p of parsed) {
          this.profiles.set(p.id, p);
        }
      }
    } catch {
      // Ignore serialization issues on startup
    }
  }

  private saveProfiles(): void {
    try {
      const arr = Array.from(this.profiles.values());
      this.storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  /**
   * Initializes standard pre-configured device profiles for Bogura hospital layout
   */
  private initDefaultHospitalProfiles(): void {
    if (this.profiles.size > 0) return;

    const defaults: DeviceProfile[] = [
      {
        id: "PRINTER_OPD_MAIN",
        deviceClass: "PRINTER",
        name: "OPD Billing & Token Thermal 80mm",
        department: "OPD Reception",
        isSimulated: false,
        enabled: true,
        config: {
          paperWidthMm: 80,
          dotsPerLine: 576,
          supportsBanglaRaster: true,
          transport: "WEB_USB",
          usbVendorId: 0x04b8, // Epson
          baudRate: 9600,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "SCANNER_LAB_SPECIMEN",
        deviceClass: "SCANNER",
        name: "Lab Phlebotomy Barcode Scanner",
        department: "Pathology Lab",
        isSimulated: false,
        enabled: true,
        config: {
          scannerId: "SCANNER_LAB_SPECIMEN",
          name: "Lab Phlebotomy Barcode Scanner",
          prefix: "",
          suffix: "\r",
          minBarcodeLength: 4,
          maxInterKeyDelayMs: 45,
          duplicateDebounceMs: 600,
          enabledCategories: ["SAMPLE", "PATIENT"],
        } satisfies ScannerProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "ZKTECO_MAIN_GATE",
        deviceClass: "BIOMETRIC",
        name: "Main Staff Entrance ZKTeco uFace800",
        department: "HR / Administration",
        isSimulated: false,
        enabled: true,
        config: {
          host: "192.168.1.201",
          port: 4370,
          timeoutMs: 5000,
          autoSyncIntervalMin: 15,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "LIS_BRIDGE_PATHOLOGY",
        deviceClass: "LIS_ANALYZER",
        name: "Mindray / Sysmex Lab Interface Bridge",
        department: "Clinical Pathology",
        isSimulated: false,
        enabled: true,
        config: {
          transportType: "TCP_IP",
          port: 5100,
          host: "127.0.0.1",
          serialPort: "COM1",
          baudRate: 9600,
          allowedIps: ["127.0.0.1", "192.168.1.100", "192.168.1.101"],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "PACS_XRAY_STATION",
        deviceClass: "PACS_MODALITY",
        name: "Digital Radiology Shimadzu C-STORE/MWL",
        department: "Radiology & Imaging",
        isSimulated: false,
        enabled: true,
        config: {
          localAeTitle: "OHMS_PACS",
          port: 11112,
          remoteModality: {
            aeTitle: "SHIMADZU_RAD1",
            host: "192.168.1.210",
            port: 104,
          } satisfies DicomNode,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "QUEUE_TV_LOBBY",
        deviceClass: "QUEUE_DISPLAY",
        name: "Ground Floor OPD Waiting TV Kiosk",
        department: "OPD Waiting Lobby",
        isSimulated: false,
        enabled: true,
        config: {
          url: "/displays/queue",
          audioChimeEnabled: true,
          kioskAutoplayWatchdog: true,
          reconnectWatchdogSeconds: 30,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const d of defaults) {
      this.profiles.set(d.id, d);
    }
    this.saveProfiles();
  }

  public registerProfile(profile: DeviceProfile): void {
    this.profiles.set(profile.id, {
      ...profile,
      updatedAt: new Date().toISOString(),
    });
    this.saveProfiles();
  }

  public getProfile(id: string): DeviceProfile | undefined {
    return this.profiles.get(id);
  }

  public getProfilesByClass(deviceClass: HardwareDeviceClass): DeviceProfile[] {
    return Array.from(this.profiles.values()).filter((p) => p.deviceClass === deviceClass);
  }

  public getAllProfiles(): DeviceProfile[] {
    return Array.from(this.profiles.values());
  }

  public deleteProfile(id: string): boolean {
    const deleted = this.profiles.delete(id);
    if (deleted) {
      this.statuses.delete(id);
      this.saveProfiles();
    }
    return deleted;
  }

  public updateStatus(
    deviceId: string,
    state: DeviceConnectionState,
    errorMessage?: string,
    telemetry?: Record<string, unknown>
  ): void {
    const profile = this.profiles.get(deviceId);
    const existing = this.statuses.get(deviceId);

    this.statuses.set(deviceId, {
      deviceClass: profile?.deviceClass ?? "PRINTER",
      deviceId,
      name: profile?.name ?? deviceId,
      state,
      isSimulated: profile?.isSimulated ?? false,
      lastSeenAt: state === "CONNECTED" || state === "SIMULATED" ? new Date().toISOString() : existing?.lastSeenAt ?? null,
      errorMessage,
      telemetry: {
        ...(existing?.telemetry ?? {}),
        ...(telemetry ?? {}),
      },
    });
  }

  public getStatus(deviceId: string): DeviceStatus {
    const status = this.statuses.get(deviceId);
    if (status) return status;

    const profile = this.profiles.get(deviceId);
    return {
      deviceClass: profile?.deviceClass ?? "PRINTER",
      deviceId,
      name: profile?.name ?? deviceId,
      state: "DISCONNECTED",
      isSimulated: profile?.isSimulated ?? false,
      lastSeenAt: null,
    };
  }

  public getAllStatuses(): DeviceStatus[] {
    return Array.from(this.profiles.keys()).map((id) => this.getStatus(id));
  }
}
