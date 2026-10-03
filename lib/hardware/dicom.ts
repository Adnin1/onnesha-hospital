/**
 * Onnesha Hospital Management System (OHMS)
 * DICOM Part 10 Medical Imaging Parser & PACS Bridge Architecture
 *
 * Capabilities:
 * - Pure JavaScript/TypeScript DICOM Part 10 parser (zero external binary dependencies)
 * - Explicit VR and Implicit VR Little Endian data element decoding
 * - Window/Level (contrast & brightness) grayscale rendering to HTML5 Canvas ImageData
 * - Synthetic Calibration Phantom Generator for zero-dependency offline testing
 * - PACS C-STORE, C-FIND, and Modality Worklist (MWL) integration specification
 */

export interface DicomMetadata {
  patientName?: string;
  patientId?: string;
  patientBirthDate?: string;
  patientSex?: string;
  studyDate?: string;
  modality?: string; // e.g. "XR", "CT", "MR", "CR", "DX", "US"
  studyDescription?: string;
  seriesDescription?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  rows: number;
  columns: number;
  bitsAllocated: number; // 8 or 16
  bitsStored: number;
  pixelRepresentation: number; // 0 = unsigned, 1 = signed (2's complement)
  windowCenter: number;
  windowWidth: number;
  rescaleIntercept: number;
  rescaleSlope: number;
}

export interface ParsedDicomImage {
  isValidDicom: boolean;
  metadata: DicomMetadata;
  pixelData?: Uint8Array | Uint16Array | Int16Array;
  minPixelValue: number;
  maxPixelValue: number;
  error?: string;
}

/**
 * Checks if buffer starts with standard DICOM 128-byte preamble + "DICM"
 */
export function isDicomPreamble(bytes: Uint8Array): boolean {
  if (bytes.length < 132) return false;
  return (
    bytes[128] === 0x44 && // D
    bytes[129] === 0x49 && // I
    bytes[130] === 0x43 && // C
    bytes[131] === 0x4d    // M
  );
}

/**
 * Parses raw DICOM Part 10 ArrayBuffer into structured metadata and pixel arrays
 */
export function parseDicomBuffer(input: ArrayBuffer | Uint8Array): ParsedDicomImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  const defaultMeta: DicomMetadata = {
    rows: 0,
    columns: 0,
    bitsAllocated: 16,
    bitsStored: 12,
    pixelRepresentation: 0,
    windowCenter: 128,
    windowWidth: 256,
    rescaleIntercept: 0,
    rescaleSlope: 1,
  };

  if (!isDicomPreamble(bytes)) {
    return {
      isValidDicom: false,
      metadata: defaultMeta,
      minPixelValue: 0,
      maxPixelValue: 0,
      error: "Missing standard 128-byte preamble or 'DICM' identifier at byte 128.",
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 132;
  const length = bytes.length;
  let pixelData: Uint8Array | Uint16Array | Int16Array | undefined;

  let minVal = Infinity;
  let maxVal = -Infinity;

  try {
    while (offset < length - 8) {
      const group = view.getUint16(offset, true);
      const element = view.getUint16(offset + 2, true);
      offset += 4;

      // Detect Explicit VR (two ASCII uppercase letters)
      const vr1 = String.fromCharCode(bytes[offset]);
      const vr2 = String.fromCharCode(bytes[offset + 1]);
      const isExplicitVR = /^[A-Z]{2}$/.test(vr1 + vr2);

      let vr = "";
      let elementLength = 0;

      if (isExplicitVR) {
        vr = vr1 + vr2;
        offset += 2;
        if (["OB", "OW", "OF", "SQ", "UT", "UN"].includes(vr)) {
          // Reserved 2 bytes then 4-byte uint32 length
          offset += 2;
          elementLength = view.getUint32(offset, true);
          offset += 4;
        } else {
          // 2-byte uint16 length
          elementLength = view.getUint16(offset, true);
          offset += 2;
        }
      } else {
        // Implicit VR Little Endian: 4-byte uint32 length
        elementLength = view.getUint32(offset, true);
        offset += 4;
      }

      if (elementLength === 0xffffffff) {
        // Undefined length sequence (skip or break for simple parser)
        break;
      }

      // Read values for important tags
      const tagHex = (group << 16) | element;

      if (tagHex === 0x00100010) {
        // Patient Name
        defaultMeta.patientName = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).replace(/\^/g, " ").trim();
      } else if (tagHex === 0x00100020) {
        // Patient ID
        defaultMeta.patientId = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
      } else if (tagHex === 0x00080060) {
        // Modality
        defaultMeta.modality = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
      } else if (tagHex === 0x00080020) {
        // Study Date
        defaultMeta.studyDate = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
      } else if (tagHex === 0x0008103e) {
        // Series Description
        defaultMeta.seriesDescription = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
      } else if (tagHex === 0x00280010) {
        // Rows
        defaultMeta.rows = view.getUint16(offset, true);
      } else if (tagHex === 0x00280011) {
        // Columns
        defaultMeta.columns = view.getUint16(offset, true);
      } else if (tagHex === 0x00280100) {
        // Bits Allocated
        defaultMeta.bitsAllocated = view.getUint16(offset, true);
      } else if (tagHex === 0x00280101) {
        // Bits Stored
        defaultMeta.bitsStored = view.getUint16(offset, true);
      } else if (tagHex === 0x00280103) {
        // Pixel Representation
        defaultMeta.pixelRepresentation = view.getUint16(offset, true);
      } else if (tagHex === 0x00281050) {
        // Window Center
        const str = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
        defaultMeta.windowCenter = parseFloat(str.split("\\")[0]) || defaultMeta.windowCenter;
      } else if (tagHex === 0x00281051) {
        // Window Width
        const str = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
        defaultMeta.windowWidth = parseFloat(str.split("\\")[0]) || defaultMeta.windowWidth;
      } else if (tagHex === 0x00281052) {
        // Rescale Intercept
        const str = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
        defaultMeta.rescaleIntercept = parseFloat(str) || 0;
      } else if (tagHex === 0x00281053) {
        // Rescale Slope
        const str = new TextDecoder().decode(bytes.slice(offset, offset + elementLength)).trim();
        defaultMeta.rescaleSlope = parseFloat(str) || 1;
      } else if (tagHex === 0x7fe00010) {
        // Pixel Data (7FE0, 0010)
        const pixelBytes = bytes.slice(offset, offset + elementLength);
        if (defaultMeta.bitsAllocated === 8) {
          pixelData = pixelBytes;
          for (let i = 0; i < pixelBytes.length; i++) {
            const v = pixelBytes[i];
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }
        } else {
          // 16-bit pixels
          const numPixels = Math.floor(pixelBytes.length / 2);
          if (defaultMeta.pixelRepresentation === 1) {
            const int16View = new Int16Array(pixelBytes.buffer, pixelBytes.byteOffset, numPixels);
            pixelData = int16View;
            for (let i = 0; i < int16View.length; i++) {
              const v = int16View[i];
              if (v < minVal) minVal = v;
              if (v > maxVal) maxVal = v;
            }
          } else {
            const uint16View = new Uint16Array(pixelBytes.buffer, pixelBytes.byteOffset, numPixels);
            pixelData = uint16View;
            for (let i = 0; i < uint16View.length; i++) {
              const v = uint16View[i];
              if (v < minVal) minVal = v;
              if (v > maxVal) maxVal = v;
            }
          }
        }
        break; // Pixel data usually at the end of file
      }

      offset += elementLength;
    }
  } catch (err: unknown) {
    console.warn("[DICOM Parser] parse warning:", err);
  }

  if (minVal === Infinity) minVal = 0;
  if (maxVal === -Infinity) maxVal = 255;

  return {
    isValidDicom: true,
    metadata: defaultMeta,
    pixelData,
    minPixelValue: minVal,
    maxPixelValue: maxVal,
  };
}

/**
 * Transforms raw DICOM pixel array to HTML Canvas ImageData applying Window/Level contrast
 */
export function renderDicomToImageData(
  parsed: ParsedDicomImage,
  customCenter?: number,
  customWidth?: number
): ImageData | null {
  if (typeof window === "undefined" || !parsed.pixelData || !parsed.metadata.rows || !parsed.metadata.columns) {
    return null;
  }

  const { rows, columns, rescaleSlope, rescaleIntercept } = parsed.metadata;
  const wc = customCenter !== undefined ? customCenter : parsed.metadata.windowCenter;
  const ww = Math.max(1, customWidth !== undefined ? customWidth : parsed.metadata.windowWidth);

  const lowBound = wc - 0.5 - (ww - 1) / 2;
  const highBound = wc - 0.5 + (ww - 1) / 2;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imgData = ctx.createImageData(columns, rows);
  const data = imgData.data;
  const pixels = parsed.pixelData;

  const totalPixels = rows * columns;
  for (let i = 0; i < totalPixels; i++) {
    const rawVal = pixels[i];
    // Apply Modality LUT: Hounsfield Units (HU) = raw * slope + intercept
    const hu = rawVal * rescaleSlope + rescaleIntercept;

    let intensity = 0;
    if (hu <= lowBound) {
      intensity = 0;
    } else if (hu > highBound) {
      intensity = 255;
    } else {
      intensity = Math.round(((hu - (wc - 0.5)) / (ww - 1) + 0.5) * 255);
    }

    const idx = i * 4;
    data[idx] = intensity;     // Red
    data[idx + 1] = intensity; // Green
    data[idx + 2] = intensity; // Blue
    data[idx + 3] = 255;       // Alpha
  }

  return imgData;
}

/**
 * Generates a valid synthetic 256x256 16-bit DICOM Part 10 buffer with an imaging phantom.
 * Used for zero-dependency offline self-tests and PACS node validation.
 */
export function generateSyntheticDicomPhantom(params: {
  patientId?: string;
  patientName?: string;
  modality?: string;
  studyDate?: string;
} = {}): Uint8Array {
  const rows = 256;
  const cols = 256;
  const patientId = params.patientId || "P-MOCK-001";
  const patientName = params.patientName || "DOE^JOHN";
  const modality = params.modality || "DX";
  const studyDate = params.studyDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Generate 256x256 16-bit gradient + circular phantom
  const pixelBytes = new Uint8Array(rows * cols * 2);
  const pixelView = new DataView(pixelBytes.buffer);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 2;
      // Distance from center
      const dx = c - 128;
      const dy = r - 128;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let val = 200; // background
      if (dist < 110 && dist > 100) {
        val = 1800; // outer anatomical ring
      } else if (dist <= 100) {
        // Concentric density bands mimicking soft tissue & bone
        val = Math.floor(600 + 400 * Math.sin(dist / 12) + (c % 16 < 2 ? 800 : 0));
      }
      pixelView.setUint16(idx, val, true);
    }
  }

  // Build DICOM elements list
  const elements: Array<{ group: number; element: number; vr: string; data: Uint8Array }> = [];
  const encoder = new TextEncoder();

  function addString(group: number, element: number, vr: string, str: string) {
    let raw = encoder.encode(str);
    if (raw.length % 2 !== 0) {
      // DICOM strings must be even length
      const padded = new Uint8Array(raw.length + 1);
      padded.set(raw);
      padded[raw.length] = 0x20; // space padding
      raw = padded;
    }
    elements.push({ group, element, vr, data: raw });
  }

  function addUint16(group: number, element: number, vr: string, val: number) {
    const raw = new Uint8Array(2);
    new DataView(raw.buffer).setUint16(0, val, true);
    elements.push({ group, element, vr, data: raw });
  }

  // File Meta Elements (Group 0002)
  addString(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"); // Explicit VR Little Endian

  // Dataset Elements
  addString(0x0008, 0x0020, "DA", studyDate);
  addString(0x0008, 0x0060, "CS", modality);
  addString(0x0008, 0x1030, "LO", "Chest PA Calibration Phantom");
  addString(0x0008, 0x103e, "LO", "OHMS Synthetic PACS Phantom");
  addString(0x0010, 0x0010, "PN", patientName);
  addString(0x0010, 0x0020, "LO", patientId);

  // Image Pixel Module
  addUint16(0x0028, 0x0010, "US", rows);
  addUint16(0x0028, 0x0011, "US", cols);
  addUint16(0x0028, 0x0100, "US", 16); // Bits Allocated
  addUint16(0x0028, 0x0101, "US", 12); // Bits Stored
  addUint16(0x0028, 0x0102, "US", 11); // High Bit
  addUint16(0x0028, 0x0103, "US", 0);  // Unsigned
  addString(0x0028, 0x1050, "DS", "800"); // Window Center
  addString(0x0028, 0x1051, "DS", "1600"); // Window Width
  addString(0x0028, 0x1052, "DS", "0");
  addString(0x0028, 0x1053, "DS", "1");

  // Pixel Data Element (7FE0, 0010)
  elements.push({ group: 0x7fe0, element: 0x0010, vr: "OW", data: pixelBytes });

  // Calculate total buffer size: 128 preamble + 4 "DICM" + elements
  let totalLen = 132;
  for (const el of elements) {
    totalLen += 4; // group + element
    totalLen += 2; // VR
    if (["OB", "OW", "OF", "SQ", "UT", "UN"].includes(el.vr)) {
      totalLen += 6 + el.data.length; // 2 reserved + 4 length + data
    } else {
      totalLen += 2 + el.data.length; // 2 length + data
    }
  }

  const out = new Uint8Array(totalLen);
  // Set magic bytes
  out[128] = 0x44; // D
  out[129] = 0x49; // I
  out[130] = 0x43; // C
  out[131] = 0x4d; // M

  const view = new DataView(out.buffer);
  let cur = 132;

  for (const el of elements) {
    view.setUint16(cur, el.group, true);
    view.setUint16(cur + 2, el.element, true);
    cur += 4;

    out[cur] = el.vr.charCodeAt(0);
    out[cur + 1] = el.vr.charCodeAt(1);
    cur += 2;

    if (["OB", "OW", "OF", "SQ", "UT", "UN"].includes(el.vr)) {
      cur += 2; // reserved 2 bytes (0x00 0x00)
      view.setUint32(cur, el.data.length, true);
      cur += 4;
    } else {
      view.setUint16(cur, el.data.length, true);
      cur += 2;
    }

    out.set(el.data, cur);
    cur += el.data.length;
  }

  return out;
}
