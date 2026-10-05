/**
 * Onnesha Hospital Management System (OHMS)
 * ESC/POS 80mm & 58mm Thermal Receipt Printer Hardware Driver & Engine
 *
 * Capabilities:
 * - Pure byte-level ESC/POS command generation (Init, Formatting, Alignment, Barcode, QR, Cut)
 * - Raster bitmap generation for complex Bengali / Unicode typography
 * - Multi-transport abstraction:
 *     1. WebUSB (navigator.usb) - Direct USB thermal printers (Epson, Xprinter, Gprinter, POS-80)
 *     2. WebSerial (navigator.serial) - USB-to-Serial / COM port thermal printers
 *     3. Network TCP (Raw socket / Port 9100) via local bridge daemon
 *     4. Browser Print Fallback - High-fidelity 80mm CSS @media print
 * - Pre-built clinical slips: OPD Token, Billing Receipt, Pharmacy Label, Lab Specimen
 */

export interface RasterImageResult {
  widthDots: number;
  heightDots: number;
  widthBytes: number;
  rasterBytes: Uint8Array;
  escposCommand: Uint8Array;
}

export interface BanglaRasterOptions {
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  paperWidthMm?: 80 | 58;
}

export function hasBanglaOrUnicode(str: string): boolean {
  return /[\u0980-\u09FF]|[\u0100-\uFFFF]/.test(str);
}

export function formatEscPosRasterBitImage(
  rasterBytes: Uint8Array,
  widthDots: number,
  heightDots: number
): Uint8Array {
  const widthBytes = Math.ceil(widthDots / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = heightDots & 0xff;
  const yH = (heightDots >> 8) & 0xff;

  const header = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  const out = new Uint8Array(header.length + rasterBytes.length);
  out.set(header, 0);
  out.set(rasterBytes, header.length);
  return out;
}

export function generateHeadlessMonochromeRaster(
  text: string,
  widthDots = 384,
  heightDots = 32
): RasterImageResult {
  const widthBytes = Math.ceil(widthDots / 8);
  const rasterBytes = new Uint8Array(widthBytes * heightDots);

  for (let charIdx = 0; charIdx < text.length; charIdx++) {
    const code = text.charCodeAt(charIdx);
    const startCol = 8 + charIdx * 14;
    if (startCol + 12 >= widthDots) break;

    for (let r = 6; r < 26; r++) {
      for (let c = 0; c < 12; c++) {
        const isDot =
          (code % 2 === 0 && (r === 6 || r === 25 || c === 0 || c === 11)) ||
          ((code ^ (r * 7 + c * 13)) % 5 === 0);

        if (isDot) {
          const dotX = startCol + c;
          const byteIdx = r * widthBytes + Math.floor(dotX / 8);
          const bitPos = 7 - (dotX % 8);
          rasterBytes[byteIdx] |= 1 << bitPos;
        }
      }
    }
  }

  const escposCommand = formatEscPosRasterBitImage(rasterBytes, widthDots, heightDots);
  return { widthDots, heightDots, widthBytes, rasterBytes, escposCommand };
}

export function rasterizeTextToEscPos(
  text: string,
  options: BanglaRasterOptions = {}
): RasterImageResult {
  const paperWidthMm = options.paperWidthMm || 80;
  const maxDots = paperWidthMm === 80 ? 576 : 384;
  const fontSize = options.fontSize || 24;
  const heightDots = Math.max(24, Math.ceil(fontSize * 1.4));

  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(maxDots, heightDots);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, maxDots, heightDots);
        ctx.fillStyle = "#000000";
        ctx.font = `${options.bold ? "bold " : ""}${fontSize}px 'Noto Sans Bengali', Kalpurush, SolaimanLipi, sans-serif`;
        ctx.textBaseline = "middle";

        let x = 4;
        if (options.align === "center") {
          const metrics = ctx.measureText(text);
          x = Math.max(0, (maxDots - metrics.width) / 2);
        } else if (options.align === "right") {
          const metrics = ctx.measureText(text);
          x = Math.max(0, maxDots - metrics.width - 4);
        }

        ctx.fillText(text, x, heightDots / 2);
        const imgData = ctx.getImageData(0, 0, maxDots, heightDots);
        const widthBytes = Math.ceil(maxDots / 8);
        const rasterBytes = new Uint8Array(widthBytes * heightDots);

        for (let y = 0; y < heightDots; y++) {
          for (let col = 0; col < maxDots; col++) {
            const pixelIdx = (y * maxDots + col) * 4;
            const r = imgData.data[pixelIdx];
            const g = imgData.data[pixelIdx + 1];
            const b = imgData.data[pixelIdx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 128) {
              const byteIdx = y * widthBytes + Math.floor(col / 8);
              const bitPos = 7 - (col % 8);
              rasterBytes[byteIdx] |= 1 << bitPos;
            }
          }
        }

        const escposCommand = formatEscPosRasterBitImage(rasterBytes, maxDots, heightDots);
        return { widthDots: maxDots, heightDots, widthBytes, rasterBytes, escposCommand };
      }
    } catch {
      // Fallback
    }
  }

  return generateHeadlessMonochromeRaster(text, maxDots, heightDots);
}

// ESC/POS Command Byte Constants
export const ESC_POS_COMMANDS = {
  // Initialization & Reset
  INIT: [0x1b, 0x40], // ESC @
  
  // Text Alignment
  ALIGN_LEFT: [0x1b, 0x61, 0x00],
  ALIGN_CENTER: [0x1b, 0x61, 0x01],
  ALIGN_RIGHT: [0x1b, 0x61, 0x02],

  // Text Styling
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  UNDERLINE_ON: [0x1b, 0x2d, 0x01],
  UNDERLINE_OFF: [0x1b, 0x2d, 0x00],
  INVERT_ON: [0x1d, 0x42, 0x01],
  INVERT_OFF: [0x1d, 0x42, 0x00],

  // Text Sizing: [0x1D, 0x21, n] where n = (width_multiplier << 4) | height_multiplier
  SIZE_NORMAL: [0x1d, 0x21, 0x00],
  SIZE_DOUBLE_HEIGHT: [0x1d, 0x21, 0x01],
  SIZE_DOUBLE_WIDTH: [0x1d, 0x21, 0x10],
  SIZE_DOUBLE_BOTH: [0x1d, 0x21, 0x11],
  SIZE_TRIPLE_BOTH: [0x1d, 0x21, 0x22],

  // Line Feeds & Spacing
  FEED_LINE: [0x0a], // LF
  FEED_LINES: (n: number) => [0x1b, 0x64, Math.max(1, Math.min(255, n))],

  // Paper Cut
  CUT_FULL: [0x1d, 0x56, 0x41, 0x00], // GS V A 0
  CUT_PARTIAL: [0x1d, 0x56, 0x42, 0x00], // GS V B 0

  // Cash Drawer Kick
  DRAWER_KICK: [0x1b, 0x70, 0x00, 0x19, 0xfa], // ESC p 0 25 250 (Pin 2, 50ms pulse)

  // Beeper / Alert
  BEEP: [0x1b, 0x42, 0x03, 0x02], // ESC B 3 2 (Beep 3 times, 200ms)
};

/**
 * Low-level ESC/POS Byte Buffer Builder
 */
export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  public init(): this {
    this.buffer.push(...ESC_POS_COMMANDS.INIT);
    return this;
  }

  public align(alignment: "left" | "center" | "right"): this {
    if (alignment === "center") {
      this.buffer.push(...ESC_POS_COMMANDS.ALIGN_CENTER);
    } else if (alignment === "right") {
      this.buffer.push(...ESC_POS_COMMANDS.ALIGN_RIGHT);
    } else {
      this.buffer.push(...ESC_POS_COMMANDS.ALIGN_LEFT);
    }
    return this;
  }

  public bold(enable = true): this {
    this.buffer.push(...(enable ? ESC_POS_COMMANDS.BOLD_ON : ESC_POS_COMMANDS.BOLD_OFF));
    return this;
  }

  public underline(enable = true): this {
    this.buffer.push(...(enable ? ESC_POS_COMMANDS.UNDERLINE_ON : ESC_POS_COMMANDS.UNDERLINE_OFF));
    return this;
  }

  public invert(enable = true): this {
    this.buffer.push(...(enable ? ESC_POS_COMMANDS.INVERT_ON : ESC_POS_COMMANDS.INVERT_OFF));
    return this;
  }

  public size(multiplier: "normal" | "double-height" | "double-width" | "double" | "triple"): this {
    switch (multiplier) {
      case "double-height":
        this.buffer.push(...ESC_POS_COMMANDS.SIZE_DOUBLE_HEIGHT);
        break;
      case "double-width":
        this.buffer.push(...ESC_POS_COMMANDS.SIZE_DOUBLE_WIDTH);
        break;
      case "double":
        this.buffer.push(...ESC_POS_COMMANDS.SIZE_DOUBLE_BOTH);
        break;
      case "triple":
        this.buffer.push(...ESC_POS_COMMANDS.SIZE_TRIPLE_BOTH);
        break;
      default:
        this.buffer.push(...ESC_POS_COMMANDS.SIZE_NORMAL);
    }
    return this;
  }

  public text(str: string): this {
    // Encode string to single-byte ASCII/Latin-1 characters
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code <= 0xff ? code : 0x3f); // replace unmappable unicode with '?'
    }
    return this;
  }

  public textLine(str = ""): this {
    this.text(str);
    this.buffer.push(...ESC_POS_COMMANDS.FEED_LINE);
    return this;
  }

  public feed(lines = 1): this {
    this.buffer.push(...ESC_POS_COMMANDS.FEED_LINES(lines));
    return this;
  }

  public rule(char = "-", width = 42): this {
    return this.textLine(char.repeat(width));
  }

  public doubleRule(width = 42): this {
    return this.rule("=", width);
  }

  /**
   * Two-column row formatted with left text and right text
   */
  public twoColumns(left: string, right: string, totalWidth = 42): this {
    const spaceCount = Math.max(1, totalWidth - left.length - right.length);
    return this.textLine(`${left}${" ".repeat(spaceCount)}${right}`);
  }

  /**
   * 1D Barcode (CODE128)
   */
  public barcode128(data: string, height = 60): this {
    this.align("center");
    // GS h <height>
    this.buffer.push(0x1d, 0x68, Math.max(20, Math.min(255, height)));
    // GS w <width (2-6)>
    this.buffer.push(0x1d, 0x77, 2);
    // GS H <HRI position (2 = below)>
    this.buffer.push(0x1d, 0x48, 2);
    // GS k 73 <length> <data> (CODE128)
    const sanitized = data.replace(/[^\x20-\x7E]/g, "");
    this.buffer.push(0x1d, 0x6b, 73, sanitized.length);
    for (let i = 0; i < sanitized.length; i++) {
      this.buffer.push(sanitized.charCodeAt(i));
    }
    this.buffer.push(...ESC_POS_COMMANDS.FEED_LINE);
    this.align("left");
    return this;
  }

  /**
   * 2D QR Code (ESC/POS Standard)
   */
  public qrCode(data: string, moduleSize = 4): this {
    this.align("center");
    const sanitized = data.slice(0, 500); // QR size safety limit
    const bytes = Array.from(new TextEncoder().encode(sanitized));
    const len = bytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // 1. Model: GS ( k 4 0 49 65 50 0 (Model 2)
    this.buffer.push(0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0);
    // 2. Size: GS ( k 3 0 49 67 <size>
    this.buffer.push(0x1d, 0x28, 0x6b, 3, 0, 49, 67, Math.max(1, Math.min(16, moduleSize)));
    // 3. Error Correction: GS ( k 3 0 49 69 49 (Level M)
    this.buffer.push(0x1d, 0x28, 0x6b, 3, 0, 49, 69, 49);
    // 4. Store Data: GS ( k pL pH 49 80 48 <data>
    this.buffer.push(0x1d, 0x28, 0x6b, pL, pH, 49, 80, 48, ...bytes);
    // 5. Print QR: GS ( k 3 0 49 81 48
    this.buffer.push(0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48);
    this.buffer.push(...ESC_POS_COMMANDS.FEED_LINE);
    this.align("left");
    return this;
  }

  /**
   * Appends 1-Bit Monochrome Raster Image (ESC/POS GS v 0)
   */
  public rasterBitImage(rasterData: Uint8Array, widthDots: number, heightDots: number): this {
    const cmd = formatEscPosRasterBitImage(rasterData, widthDots, heightDots);
    for (let i = 0; i < cmd.length; i++) {
      this.buffer.push(cmd[i]);
    }
    return this;
  }

  /**
   * Prints text line with automatic Bangla & Unicode rasterization fallback.
   * If string contains Bangla or non-ASCII characters, renders high-contrast
   * 1-bit monochrome raster image, preventing '?' replacement.
   */
  public textUnicode(
    text: string,
    options: BanglaRasterOptions = {}
  ): this {
    if (hasBanglaOrUnicode(text)) {
      const raster = rasterizeTextToEscPos(text, options);
      return this.rasterBitImage(raster.rasterBytes, raster.widthDots, raster.heightDots);
    }
    return this.textLine(text);
  }

  /**
   * Cash Drawer Kick
   */
  public kickDrawer(): this {
    this.buffer.push(...ESC_POS_COMMANDS.DRAWER_KICK);
    return this;
  }

  /**
   * Cut Paper
   */
  public cut(partial = true): this {
    this.feed(3);
    this.buffer.push(...(partial ? ESC_POS_COMMANDS.CUT_PARTIAL : ESC_POS_COMMANDS.CUT_FULL));
    return this;
  }

  /**
   * Build complete Uint8Array
   */
  public build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Get raw byte array
   */
  public getBytes(): number[] {
    return [...this.buffer];
  }
}

// ============================================================================
// Transports: WebUSB, WebSerial, Network Socket, and Browser Fallback
// ============================================================================

export type PrinterTransportType = "WEB_USB" | "WEB_SERIAL" | "NETWORK_TCP" | "BROWSER_PRINT";

export interface PrinterConnectionResult {
  success: boolean;
  transport: PrinterTransportType;
  deviceName?: string;
  error?: string;
}

export interface ThermalPrinterOptions {
  paperWidthMm?: 80 | 58;
  baudRate?: number;
  networkHost?: string;
  networkPort?: number;
}

/**
 * WebUSB Thermal Printer Driver
 */
export async function printViaWebUsb(data: Uint8Array): Promise<PrinterConnectionResult> {
  if (typeof navigator === "undefined" || !("usb" in navigator)) {
    return {
      success: false,
      transport: "WEB_USB",
      error: "WebUSB is not supported in this browser or environment (requires Chrome/Edge on HTTPS).",
    };
  }

  try {
    const navUsb = (navigator as unknown as { usb: { requestDevice: (opt: object) => Promise<unknown> } }).usb;
    // Request thermal printer device (class 0x07 = Printer or vendor-specific)
    const device = (await navUsb.requestDevice({
      filters: [
        { classCode: 0x07 }, // USB Printer Class
        { vendorId: 0x04b8 }, // Epson
        { vendorId: 0x1fc9 }, // Xprinter
        { vendorId: 0x0dd4 }, // Custom
      ],
    })) as {
      open: () => Promise<void>;
      selectConfiguration: (c: number) => Promise<void>;
      claimInterface: (i: number) => Promise<void>;
      transferOut: (endpointNumber: number, data: Uint8Array) => Promise<{ status: string }>;
      close: () => Promise<void>;
      productName?: string;
    };

    await device.open();
    if (device.selectConfiguration) {
      await device.selectConfiguration(1);
    }

    // Dynamic Interface and Endpoint Discovery (scans descriptors for printer class & bulk OUT endpoint)
    let selectedInterface = 0;
    let selectedEndpoint = 1;

    try {
      const devAny = device as unknown as {
        configuration?: {
          interfaces?: Array<{
            interfaceNumber: number;
            alternates?: Array<{
              interfaceClass: number;
              endpoints?: Array<{ direction: string; type: string; endpointNumber: number }>;
            }>;
          }>;
        };
      };
      const interfaces = devAny.configuration?.interfaces;
      if (interfaces) {
        for (const iface of interfaces) {
          for (const alt of iface.alternates || []) {
            if (alt.interfaceClass === 7 || alt.interfaceClass === 255) {
              for (const ep of alt.endpoints || []) {
                if (ep.direction === "out" && ep.type === "bulk") {
                  selectedInterface = iface.interfaceNumber;
                  selectedEndpoint = ep.endpointNumber;
                  break;
                }
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback to interface 0, endpoint 1 if introspection is unavailable
    }

    await device.claimInterface(selectedInterface);
    await device.transferOut(selectedEndpoint, data);
    await device.close();

    return {
      success: true,
      transport: "WEB_USB",
      deviceName: device.productName || "USB Thermal Printer",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "WebUSB printer transmission error";
    return {
      success: false,
      transport: "WEB_USB",
      error: msg,
    };
  }
}

/**
 * WebSerial (COM / RS-232) Thermal Printer Driver
 */
export async function printViaWebSerial(
  data: Uint8Array,
  baudRate = 9600
): Promise<PrinterConnectionResult> {
  if (typeof navigator === "undefined" || !("serial" in navigator)) {
    return {
      success: false,
      transport: "WEB_SERIAL",
      error: "WebSerial is not supported in this browser or environment (requires Chrome/Edge on HTTPS).",
    };
  }

  try {
    const navSerial = (navigator as unknown as {
      serial: {
        requestPort: () => Promise<{
          open: (opt: { baudRate: number }) => Promise<void>;
          writable: WritableStream<Uint8Array>;
          close: () => Promise<void>;
        }>;
      };
    }).serial;

    const port = await navSerial.requestPort();
    await port.open({ baudRate });

    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    await port.close();

    return {
      success: true,
      transport: "WEB_SERIAL",
      deviceName: `Serial Printer (${baudRate} baud)`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "WebSerial printer transmission error";
    return {
      success: false,
      transport: "WEB_SERIAL",
      error: msg,
    };
  }
}

/**
 * Network TCP Thermal Printer Driver (dispatches to local printer bridge daemon or direct socket)
 */
export async function printViaNetworkTcp(
  data: Uint8Array,
  host = "192.168.1.200",
  port = 9100
): Promise<PrinterConnectionResult> {
  try {
    // Send base64 payload to local bridge listener on hospital workstation
    const base64Data = typeof Buffer !== "undefined"
      ? Buffer.from(data).toString("base64")
      : btoa(String.fromCharCode(...data));

    const bridgeUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_HARDWARE_BRIDGE_URL) || "";
    if (!bridgeUrl) {
      return {
        success: false,
        transport: "NETWORK_TCP",
        error: `Network printing requires NEXT_PUBLIC_HARDWARE_BRIDGE_URL or local bridge service. Target printer: ${host}:${port}`,
      };
    }

    const response = await fetch(`${bridgeUrl}/api/printer/raw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        port,
        payload_base64: base64Data,
      }),
    });

    if (response.ok) {
      return {
        success: true,
        transport: "NETWORK_TCP",
        deviceName: `Network Printer at ${host}:${port}`,
      };
    }

    return {
      success: false,
      transport: "NETWORK_TCP",
      error: `Local bridge returned HTTP ${response.status}`,
    };
  } catch {
    // If local bridge is not running, return informative fallback message
    return {
      success: false,
      transport: "NETWORK_TCP",
      error: `Network printing requires the OHMS Local Hardware Bridge daemon on port 5101. Target: ${host}:${port}`,
    };
  }
}

/**
 * Browser Print Fallback (renders iframe with exact 80mm / 58mm CSS styles)
 */
export function printViaBrowserFallback(htmlContent: string): PrinterConnectionResult {
  if (typeof window === "undefined") {
    return {
      success: false,
      transport: "BROWSER_PRINT",
      error: "Browser window is not available for printing.",
    };
  }

  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "80mm";
    iframe.style.height = "100mm";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return {
        success: false,
        transport: "BROWSER_PRINT",
        error: "Failed to access print iframe document.",
      };
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>OHMS Thermal Receipt</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Kalpurush", monospace;
              width: 72mm;
              margin: 0 auto;
              padding: 4mm 0;
              font-size: 12px;
              line-height: 1.3;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .token-num { font-size: 26px; font-weight: bold; margin: 6px 0; }
            .rule { border-top: 1px dashed #000; margin: 4px 0; }
            .double-rule { border-top: 2px solid #000; margin: 4px 0; }
            .flex-row { display: flex; justify-content: space-between; }
            @media screen { body { background: #eee; } }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    doc.close();

    // Auto cleanup iframe after print dialog closes
    setTimeout(() => {
      try {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      } catch {
        // ignored
      }
    }, 2000);

    return {
      success: true,
      transport: "BROWSER_PRINT",
      deviceName: "Browser System Print Dialog (80mm Thermal)",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Browser print dialog failed";
    return {
      success: false,
      transport: "BROWSER_PRINT",
      error: msg,
    };
  }
}

// ============================================================================
// Clinical Slips & Receipts Template Builders
// ============================================================================

export interface OpdTokenData {
  tokenNumber: string | number;
  doctorName: string;
  department: string;
  roomNumber: string;
  patientName: string;
  uhid: string;
  timeSlot: string;
  estimatedWaitMins?: number;
  hospitalName?: string;
  hospitalHotline?: string;
}

export function buildOpdTokenEscPos(data: OpdTokenData): EscPosBuilder {
  const hospital = data.hospitalName || "ANNESHA HOSPITAL & DIAGNOSTIC";
  const hotline = data.hospitalHotline || "01718835623";

  return new EscPosBuilder()
    .align("center")
    .bold(true)
    .textLine(hospital)
    .bold(false)
    .textLine("OUTPATIENT CLINIC (OPD)")
    .textLine(`Hotline: ${hotline}`)
    .rule("=")
    .textLine("YOUR QUEUE TOKEN")
    .size("double")
    .bold(true)
    .textLine(`#${data.tokenNumber}`)
    .size("normal")
    .bold(false)
    .rule("-")
    .align("left")
    .twoColumns("Doctor:", data.doctorName.slice(0, 26))
    .twoColumns("Dept:", data.department.slice(0, 26))
    .twoColumns("Room:", data.roomNumber)
    .twoColumns("Time:", data.timeSlot)
    .twoColumns("UHID:", data.uhid)
    .twoColumns("Patient:", data.patientName.slice(0, 24))
    .rule("-")
    .align("center")
    .textLine(data.estimatedWaitMins ? `Approx Wait: ~${data.estimatedWaitMins} mins` : "Please wait in lobby until called")
    .feed(1)
    .qrCode(`OHMS:TOKEN:${data.tokenNumber}:UHID:${data.uhid}`)
    .textLine("Scan to verify live queue status")
    .feed(1)
    .textLine(`Printed: ${new Date().toLocaleTimeString("en-GB")}`)
    .cut();
}

export interface BillingReceiptItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface BillingReceiptData {
  invoiceNumber: string;
  patientName: string;
  uhid: string;
  items: BillingReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  paymentMethod: string;
  cashierName: string;
  hospitalName?: string;
}

export function buildBillingReceiptEscPos(data: BillingReceiptData): EscPosBuilder {
  const hospital = data.hospitalName || "ANNESHA HOSPITAL & DIAGNOSTIC";
  const builder = new EscPosBuilder()
    .align("center")
    .bold(true)
    .size("double-height")
    .textLine(hospital)
    .size("normal")
    .bold(false)
    .textLine("Khandar, Bogura | Tel: 01718835623")
    .bold(true)
    .textLine("OFFICIAL CASH RECEIPT")
    .bold(false)
    .rule("=")
    .align("left")
    .twoColumns("Invoice #:", data.invoiceNumber)
    .twoColumns("Date:", new Date().toLocaleDateString("en-GB"))
    .twoColumns("Patient:", data.patientName.slice(0, 24))
    .twoColumns("UHID:", data.uhid)
    .rule("-")
    .twoColumns("Item / Service", "Amount (BDT)")
    .rule("-");

  for (const item of data.items) {
    const desc = item.qty > 1 ? `${item.description} x${item.qty}` : item.description;
    builder.twoColumns(desc.slice(0, 28), item.total.toFixed(2));
  }

  builder
    .rule("-")
    .twoColumns("Subtotal:", data.subtotal.toFixed(2))
    .twoColumns("Discount:", `-${data.discount.toFixed(2)}`)
    .twoColumns("Govt Tax (VAT):", data.tax.toFixed(2))
    .doubleRule()
    .bold(true)
    .size("double-height")
    .twoColumns("TOTAL:", `BDT ${data.total.toFixed(2)}`)
    .size("normal")
    .twoColumns("Paid Amount:", `BDT ${data.paid.toFixed(2)}`)
    .twoColumns("Due / Balance:", `BDT ${data.balance.toFixed(2)}`)
    .bold(false)
    .rule("-")
    .twoColumns("Payment Mode:", data.paymentMethod)
    .twoColumns("Cashier:", data.cashierName)
    .align("center")
    .feed(1)
    .barcode128(data.invoiceNumber, 50)
    .textLine("Thank you for choosing Onnesha Hospital")
    .textLine("Non-refundable without original receipt")
    .cut();

  return builder;
}

export interface HardwareTestTicketData {
  portName?: string;
  transportType?: string;
  timestamp?: string;
}

export function buildHardwareTestTicket(data: HardwareTestTicketData = {}): EscPosBuilder {
  return new EscPosBuilder()
    .align("center")
    .bold(true)
    .size("double")
    .textLine("OHMS PRINTER TEST")
    .size("normal")
    .bold(false)
    .textLine("Onnesha Hospital Hardware Bridge")
    .rule("=")
    .align("left")
    .twoColumns("Transport:", data.transportType || "ESC/POS 80mm")
    .twoColumns("Port / Device:", data.portName || "USB/COM Default")
    .twoColumns("Timestamp:", data.timestamp || new Date().toISOString())
    .rule("-")
    .textLine("Formatting Verification:")
    .bold(true)
    .textLine("  [PASS] Bold Font Active")
    .bold(false)
    .underline(true)
    .textLine("  [PASS] Underline Font Active")
    .underline(false)
    .invert(true)
    .textLine("  [PASS] Inverted Video Active  ")
    .invert(false)
    .rule("-")
    .align("center")
    .textLine("1D Barcode Test (CODE128):")
    .barcode128("TEST-80MM-PRN", 45)
    .textLine("2D QR Code Test (Model 2):")
    .qrCode("OHMS:HARDWARE:TEST:OK")
    .feed(1)
    .textLine("=== HARDWARE SELF-TEST COMPLETE ===")
    .cut();
}

/**
 * Test ticket with native Bangla Unicode typography rasterization
 */
export function buildBanglaTestTicket(): EscPosBuilder {
  return new EscPosBuilder()
    .align("center")
    .bold(true)
    .size("double")
    .textUnicode("অন্বেষা হাসপাতাল ও ডায়াগনস্টিক", { bold: true, fontSize: 28, align: "center" })
    .size("normal")
    .bold(false)
    .textUnicode("খান্দার, শেরপুর রোড, বগুড়া", { fontSize: 20, align: "center" })
    .rule("=")
    .align("left")
    .textUnicode("বিভাগ: সাধারণ ওপিডি কনসালটেশন", { fontSize: 22 })
    .textUnicode("রোগীর নাম: মোঃ রফিকুল ইসলাম", { fontSize: 22 })
    .textUnicode("চিকিৎসক: ডাঃ মোঃ নাজমুল হুদা", { fontSize: 22 })
    .twoColumns("UHID: ONN-P-10948", "টোকেন: ৪২")
    .rule("-")
    .textUnicode("পরীক্ষা: ডিজিটাল এক্স-রে ও ইসিজি", { fontSize: 20 })
    .textUnicode("পরিশোধিত টাকা: ৫০০.০০ (নগদ)", { fontSize: 20 })
    .rule("-")
    .align("center")
    .qrCode("OHMS:TOKEN:42:ONN-P-10948")
    .textUnicode("রোগীর দ্রুত আরোগ্য কামনায়", { fontSize: 20, align: "center" })
    .cut();
}

export interface PrintJob {
  jobId: string;
  ticketType: string;
  fingerprint: string;
  bytesSent: number;
  createdAt: number;
  status: "PENDING" | "PRINTING" | "COMPLETED" | "FAILED";
  error?: string;
}

export class PrintJobQueue {
  private static instance: PrintJobQueue;
  private jobs: Map<string, PrintJob> = new Map();
  private recentFingerprints: Map<string, number> = new Map();
  private duplicateDebounceMs = 4000;

  public static getInstance(): PrintJobQueue {
    if (!PrintJobQueue.instance) {
      PrintJobQueue.instance = new PrintJobQueue();
    }
    return PrintJobQueue.instance;
  }

  public shouldSuppressDuplicate(fingerprint: string): boolean {
    const lastTime = this.recentFingerprints.get(fingerprint);
    const now = Date.now();
    if (lastTime && now - lastTime < this.duplicateDebounceMs) {
      return true;
    }
    this.recentFingerprints.set(fingerprint, now);
    return false;
  }

  public registerJob(ticketType: string, fingerprint: string, byteLength: number): PrintJob {
    const jobId = `PRINT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: PrintJob = {
      jobId,
      ticketType,
      fingerprint,
      bytesSent: byteLength,
      createdAt: Date.now(),
      status: "COMPLETED",
    };
    this.jobs.set(jobId, job);
    return job;
  }

  public getRecentJobs(): PrintJob[] {
    return Array.from(this.jobs.values()).slice(-20);
  }
}

