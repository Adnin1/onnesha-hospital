/**
 * Onnesha Hospital Management System (OHMS)
 * DICOM & PACS Networking Engine: DIMSE, Storage SCP & Modality Emulator (Gate 8)
 *
 * Implements:
 * 1. DICOM Part 8 Upper Layer Protocol (PDU encoding & decoding)
 * 2. Association negotiation (A-ASSOCIATE-RQ, A-ASSOCIATE-AC, A-RELEASE-RQ/RP)
 * 3. Presentation Data Value (PDV) framing within P-DATA-TF PDUs
 * 4. DIMSE Command Group (0000,xxxx) binary serialization
 * 5. PacsBridgeService: local C-STORE Storage SCP & Modality Worklist (MWL) C-FIND provider
 * 6. DicomModalitySimulator: loops back association, worklist query, phantom generation & C-STORE
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import type {
  IPacsBridgeService,
  DeviceStatus,
  DeviceConnectionState,
  DicomNode,
  DicomModalityWorklistItem,
  DicomStoreResult,
} from "../hal/types";

export interface SyntheticDicomParams {
  patientId?: string;
  patientName?: string;
  modality?: string;
  studyDate?: string;
}

export function createSyntheticDicomBuffer(params: SyntheticDicomParams = {}): Uint8Array {
  const rows = 256;
  const cols = 256;
  const patientId = params.patientId || "ONN-P-10948";
  const patientName = params.patientName || "ISLAM^RAFIQUL";
  const modality = params.modality || "DX";
  const studyDate = params.studyDate || new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const pixelBytes = new Uint8Array(rows * cols * 2);
  const pixelView = new DataView(pixelBytes.buffer);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 2;
      const dx = c - 128;
      const dy = r - 128;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let val = 200;
      if (dist < 110 && dist > 100) {
        val = 1800;
      } else if (dist <= 100) {
        val = Math.floor(600 + 400 * Math.sin(dist / 12) + (c % 16 < 2 ? 800 : 0));
      }
      pixelView.setUint16(idx, val, true);
    }
  }

  const elements: Array<{ group: number; element: number; vr: string; data: Uint8Array }> = [];
  const encoder = new TextEncoder();

  function addString(group: number, element: number, vr: string, str: string) {
    let raw = encoder.encode(str);
    if (raw.length % 2 !== 0) {
      const padded = new Uint8Array(raw.length + 1);
      padded.set(raw);
      padded[raw.length] = 0x20;
      raw = padded;
    }
    elements.push({ group, element, vr, data: raw });
  }

  function addUint16(group: number, element: number, vr: string, val: number) {
    const raw = new Uint8Array(2);
    new DataView(raw.buffer).setUint16(0, val, true);
    elements.push({ group, element, vr, data: raw });
  }

  addString(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1");
  addString(0x0008, 0x0020, "DA", studyDate);
  addString(0x0008, 0x0060, "CS", modality);
  addString(0x0008, 0x1030, "LO", "Chest Digital Radiography PA");
  addString(0x0008, 0x103e, "LO", "OHMS PACS Diagnostic Series");
  addString(0x0010, 0x0010, "PN", patientName);
  addString(0x0010, 0x0020, "LO", patientId);

  addUint16(0x0028, 0x0010, "US", rows);
  addUint16(0x0028, 0x0011, "US", cols);
  addUint16(0x0028, 0x0100, "US", 16);
  addUint16(0x0028, 0x0101, "US", 12);
  addUint16(0x0028, 0x0102, "US", 11);
  addUint16(0x0028, 0x0103, "US", 0);
  addString(0x0028, 0x1050, "DS", "800");
  addString(0x0028, 0x1051, "DS", "1600");
  addString(0x0028, 0x1052, "DS", "0");
  addString(0x0028, 0x1053, "DS", "1");

  elements.push({ group: 0x7fe0, element: 0x0010, vr: "OW", data: pixelBytes });

  let totalLen = 132;
  for (const el of elements) {
    totalLen += 6;
    if (["OB", "OW", "OF", "SQ", "UT", "UN"].includes(el.vr)) {
      totalLen += 6 + el.data.length;
    } else {
      totalLen += 2 + el.data.length;
    }
  }

  const out = new Uint8Array(totalLen);
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
      cur += 2;
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

export function parseDicomHeader(bytes: Uint8Array): {
  valid: boolean;
  sopInstanceUid?: string;
  modality?: string;
  patientId?: string;
  patientName?: string;
  error?: string;
} {
  if (bytes.length < 132) {
    return { valid: false, error: "File too small" };
  }
  const magic = String.fromCharCode(bytes[128], bytes[129], bytes[130], bytes[131]);
  if (magic !== "DICM") {
    return { valid: false, error: `Invalid DICOM magic bytes: expected 'DICM', got '${magic}'` };
  }

  let cur = 132;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: { valid: boolean; sopInstanceUid?: string; modality?: string; patientId?: string; patientName?: string } = {
    valid: true,
  };

  while (cur + 8 <= bytes.length) {
    const group = view.getUint16(cur, true);
    const element = view.getUint16(cur + 2, true);
    cur += 4;

    const vr = String.fromCharCode(bytes[cur], bytes[cur + 1]);
    cur += 2;

    let len = 0;
    if (["OB", "OW", "OF", "SQ", "UT", "UN"].includes(vr)) {
      cur += 2;
      if (cur + 4 > bytes.length) break;
      len = view.getUint32(cur, true);
      cur += 4;
    } else {
      if (cur + 2 > bytes.length) break;
      len = view.getUint16(cur, true);
      cur += 2;
    }

    if (cur + len > bytes.length) break;

    if (group === 0x0008 && element === 0x0018) {
      result.sopInstanceUid = new TextDecoder().decode(bytes.subarray(cur, cur + len)).replace(/\0+$/, "").trim();
    } else if (group === 0x0008 && element === 0x0060) {
      result.modality = new TextDecoder().decode(bytes.subarray(cur, cur + len)).replace(/\0+$/, "").trim();
    } else if (group === 0x0010 && element === 0x0020) {
      result.patientId = new TextDecoder().decode(bytes.subarray(cur, cur + len)).replace(/\0+$/, "").trim();
    } else if (group === 0x0010 && element === 0x0010) {
      result.patientName = new TextDecoder().decode(bytes.subarray(cur, cur + len)).replace(/\0+$/, "").trim();
    }

    cur += len;
  }

  return result;
}

export const DICOM_SOP_CLASSES = {
  VERIFICATION: "1.2.840.10008.1.1",                     // C-ECHO
  MODALITY_WORKLIST_FIND: "1.2.840.10008.5.1.4.31",       // C-FIND MWL
  PATIENT_ROOT_QR_FIND: "1.2.840.10008.5.1.4.1.2.1.1",
  STUDY_ROOT_QR_FIND: "1.2.840.10008.5.1.4.1.2.2.1",
  CR_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.1",         // Computed Radiography
  DX_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.1.1",       // Digital X-Ray
  CT_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.2",         // Computed Tomography
  US_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.6.1",       // Ultrasound
  MR_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.4",         // Magnetic Resonance
  SC_IMAGE_STORAGE: "1.2.840.10008.5.1.4.1.1.7",         // Secondary Capture
} as const;

export const DICOM_TRANSFER_SYNTAXES = {
  IMPLICIT_VR_LITTLE_ENDIAN: "1.2.840.10008.1.2",
  EXPLICIT_VR_LITTLE_ENDIAN: "1.2.840.10008.1.2.1",
  EXPLICIT_VR_BIG_ENDIAN: "1.2.840.10008.1.2.2",
} as const;

export const DICOM_PDU_TYPES = {
  A_ASSOCIATE_RQ: 0x01,
  A_ASSOCIATE_AC: 0x02,
  A_ASSOCIATE_RJ: 0x03,
  P_DATA_TF: 0x04,
  A_RELEASE_RQ: 0x05,
  A_RELEASE_RP: 0x06,
  A_ABORT: 0x07,
} as const;

export const DIMSE_COMMANDS = {
  C_STORE_RQ: 0x0001,
  C_STORE_RSP: 0x8001,
  C_GET_RQ: 0x0010,
  C_GET_RSP: 0x8010,
  C_FIND_RQ: 0x0020,
  C_FIND_RSP: 0x8020,
  C_MOVE_RQ: 0x0021,
  C_MOVE_RSP: 0x8021,
  C_ECHO_RQ: 0x0030,
  C_ECHO_RSP: 0x8030,
} as const;

export const DIMSE_STATUS = {
  SUCCESS: 0x0000,
  PENDING: 0xff00,
  PENDING_WARNING: 0xff01,
  REFUSED_OUT_OF_RESOURCES: 0xa700,
  DATASET_DOES_NOT_MATCH_SOP: 0xa900,
  FAILED_UNABLE_TO_PROCESS: 0xc000,
} as const;

export const DICOM_APPLICATION_CONTEXT = "1.2.840.10008.3.1.1.1";
export const DEFAULT_MAX_PDU_LENGTH = 65536;

export interface PresentationContext {
  id: number;
  abstractSyntax: string;
  transferSyntaxes: string[];
  result?: number;
}

export interface AssociationRequest {
  callingAeTitle: string;
  calledAeTitle: string;
  presentationContexts: PresentationContext[];
  maxPduLength?: number;
}

export interface AssociationAcceptance {
  callingAeTitle: string;
  calledAeTitle: string;
  presentationContexts: PresentationContext[];
  maxPduLength: number;
}

export interface DimseMessage {
  commandField: number;
  messageId: number;
  messageIdBeingRespondedTo?: number;
  affectedSopClassUid?: string;
  affectedSopInstanceUid?: string;
  status?: number;
  hasDataset: boolean;
  dataset?: Buffer;
}

function padAeTitle(ae: string): string {
  return (ae || "").trim().padEnd(16, " ").slice(0, 16);
}

// ----------------------------------------------------------------------------
// Upper Layer Protocol PDU Serialization
// ----------------------------------------------------------------------------

export function encodeAssociateRqPdu(req: AssociationRequest): Buffer {
  const chunks: Buffer[] = [];

  // Application Context
  const appContextBytes = Buffer.from(DICOM_APPLICATION_CONTEXT, "ascii");
  const appContextItem = Buffer.alloc(4 + appContextBytes.length);
  appContextItem.writeUInt8(0x10, 0);
  appContextItem.writeUInt8(0x00, 1);
  appContextItem.writeUInt16BE(appContextBytes.length, 2);
  appContextBytes.copy(appContextItem, 4);
  chunks.push(appContextItem);

  // Presentation Contexts
  for (const pc of req.presentationContexts) {
    const pcSubChunks: Buffer[] = [];
    const absBytes = Buffer.from(pc.abstractSyntax, "ascii");
    const absItem = Buffer.alloc(4 + absBytes.length);
    absItem.writeUInt8(0x30, 0);
    absItem.writeUInt8(0x00, 1);
    absItem.writeUInt16BE(absBytes.length, 2);
    absBytes.copy(absItem, 4);
    pcSubChunks.push(absItem);

    for (const ts of pc.transferSyntaxes) {
      const tsBytes = Buffer.from(ts, "ascii");
      const tsItem = Buffer.alloc(4 + tsBytes.length);
      tsItem.writeUInt8(0x40, 0);
      tsItem.writeUInt8(0x00, 1);
      tsItem.writeUInt16BE(tsBytes.length, 2);
      tsBytes.copy(tsItem, 4);
      pcSubChunks.push(tsItem);
    }

    const pcContent = Buffer.concat(pcSubChunks);
    const pcItem = Buffer.alloc(8 + pcContent.length);
    pcItem.writeUInt8(0x20, 0);
    pcItem.writeUInt8(0x00, 1);
    pcItem.writeUInt16BE(4 + pcContent.length, 2);
    pcItem.writeUInt8(pc.id, 4);
    pcItem.writeUInt8(0x00, 5);
    pcItem.writeUInt8(0x00, 6);
    pcItem.writeUInt8(0x00, 7);
    pcContent.copy(pcItem, 8);
    chunks.push(pcItem);
  }

  // User Info Item
  const maxPdu = req.maxPduLength ?? DEFAULT_MAX_PDU_LENGTH;
  const maxPduSubItem = Buffer.alloc(8);
  maxPduSubItem.writeUInt8(0x51, 0);
  maxPduSubItem.writeUInt8(0x00, 1);
  maxPduSubItem.writeUInt16BE(4, 2);
  maxPduSubItem.writeUInt32BE(maxPdu, 4);

  const userInfoItem = Buffer.alloc(4 + maxPduSubItem.length);
  userInfoItem.writeUInt8(0x50, 0);
  userInfoItem.writeUInt8(0x00, 1);
  userInfoItem.writeUInt16BE(maxPduSubItem.length, 2);
  maxPduSubItem.copy(userInfoItem, 4);
  chunks.push(userInfoItem);

  const variableItems = Buffer.concat(chunks);
  const pdu = Buffer.alloc(6 + 68 + variableItems.length);
  pdu.writeUInt8(DICOM_PDU_TYPES.A_ASSOCIATE_RQ, 0);
  pdu.writeUInt8(0x00, 1);
  pdu.writeUInt32BE(68 + variableItems.length, 2);
  pdu.writeUInt16BE(0x0001, 6);
  pdu.writeUInt16BE(0x0000, 8);
  pdu.write(padAeTitle(req.calledAeTitle), 10, 16, "ascii");
  pdu.write(padAeTitle(req.callingAeTitle), 26, 16, "ascii");
  variableItems.copy(pdu, 74);

  return pdu;
}

export function encodeAssociateAcPdu(ac: AssociationAcceptance): Buffer {
  const chunks: Buffer[] = [];

  const appContextBytes = Buffer.from(DICOM_APPLICATION_CONTEXT, "ascii");
  const appContextItem = Buffer.alloc(4 + appContextBytes.length);
  appContextItem.writeUInt8(0x10, 0);
  appContextItem.writeUInt8(0x00, 1);
  appContextItem.writeUInt16BE(appContextBytes.length, 2);
  appContextBytes.copy(appContextItem, 4);
  chunks.push(appContextItem);

  for (const pc of ac.presentationContexts) {
    const pcSubChunks: Buffer[] = [];
    const ts = pc.transferSyntaxes[0] || "1.2.840.10008.1.2";
    const tsBytes = Buffer.from(ts, "ascii");
    const tsItem = Buffer.alloc(4 + tsBytes.length);
    tsItem.writeUInt8(0x40, 0);
    tsItem.writeUInt8(0x00, 1);
    tsItem.writeUInt16BE(tsBytes.length, 2);
    tsBytes.copy(tsItem, 4);
    pcSubChunks.push(tsItem);

    const pcContent = Buffer.concat(pcSubChunks);
    const pcItem = Buffer.alloc(8 + pcContent.length);
    pcItem.writeUInt8(0x21, 0);
    pcItem.writeUInt8(0x00, 1);
    pcItem.writeUInt16BE(4 + pcContent.length, 2);
    pcItem.writeUInt8(pc.id, 4);
    pcItem.writeUInt8(0x00, 5);
    pcItem.writeUInt8(pc.result ?? 0x00, 6);
    pcItem.writeUInt8(0x00, 7);
    pcContent.copy(pcItem, 8);
    chunks.push(pcItem);
  }

  const maxPduSubItem = Buffer.alloc(8);
  maxPduSubItem.writeUInt8(0x51, 0);
  maxPduSubItem.writeUInt8(0x00, 1);
  maxPduSubItem.writeUInt16BE(4, 2);
  maxPduSubItem.writeUInt32BE(ac.maxPduLength, 4);

  const userInfoItem = Buffer.alloc(4 + maxPduSubItem.length);
  userInfoItem.writeUInt8(0x50, 0);
  userInfoItem.writeUInt8(0x00, 1);
  userInfoItem.writeUInt16BE(maxPduSubItem.length, 2);
  maxPduSubItem.copy(userInfoItem, 4);
  chunks.push(userInfoItem);

  const variableItems = Buffer.concat(chunks);
  const pdu = Buffer.alloc(6 + 68 + variableItems.length);
  pdu.writeUInt8(DICOM_PDU_TYPES.A_ASSOCIATE_AC, 0);
  pdu.writeUInt8(0x00, 1);
  pdu.writeUInt32BE(68 + variableItems.length, 2);
  pdu.writeUInt16BE(0x0001, 6);
  pdu.writeUInt16BE(0x0000, 8);
  pdu.write(padAeTitle(ac.calledAeTitle), 10, 16, "ascii");
  pdu.write(padAeTitle(ac.callingAeTitle), 26, 16, "ascii");
  variableItems.copy(pdu, 74);

  return pdu;
}

export function decodeAssociateRqPdu(buf: Buffer): AssociationRequest {
  if (buf.length < 74) {
    throw new Error(`Buffer too short for A-ASSOCIATE-RQ: ${buf.length} < 74 bytes`);
  }
  const calledAeTitle = buf.subarray(10, 26).toString("ascii").trim();
  const callingAeTitle = buf.subarray(26, 42).toString("ascii").trim();

  const presentationContexts: PresentationContext[] = [];
  let offset = 74;

  while (offset + 4 <= buf.length) {
    const itemType = buf.readUInt8(offset);
    const itemLength = buf.readUInt16BE(offset + 2);
    offset += 4;

    if (offset + itemLength > buf.length) break;

    if (itemType === 0x20) {
      // Presentation Context Item
      const pcId = buf.readUInt8(offset);
      let subOffset = offset + 4;
      let abstractSyntax = "";
      const transferSyntaxes: string[] = [];

      while (subOffset + 4 <= offset + itemLength) {
        const subType = buf.readUInt8(subOffset);
        const subLen = buf.readUInt16BE(subOffset + 2);
        subOffset += 4;

        if (subType === 0x30) {
          abstractSyntax = buf.subarray(subOffset, subOffset + subLen).toString("ascii").trim();
        } else if (subType === 0x40) {
          transferSyntaxes.push(buf.subarray(subOffset, subOffset + subLen).toString("ascii").trim());
        }
        subOffset += subLen;
      }

      presentationContexts.push({
        id: pcId,
        abstractSyntax,
        transferSyntaxes,
      });
    }

    offset += itemLength;
  }

  return {
    calledAeTitle,
    callingAeTitle,
    presentationContexts,
  };
}

export function encodeReleaseRqPdu(): Buffer {
  const pdu = Buffer.alloc(10);
  pdu.writeUInt8(DICOM_PDU_TYPES.A_RELEASE_RQ, 0);
  pdu.writeUInt8(0x00, 1);
  pdu.writeUInt32BE(4, 2);
  pdu.writeUInt32BE(0x00, 6);
  return pdu;
}

export function encodeReleaseRpPdu(): Buffer {
  const pdu = Buffer.alloc(10);
  pdu.writeUInt8(DICOM_PDU_TYPES.A_RELEASE_RP, 0);
  pdu.writeUInt8(0x00, 1);
  pdu.writeUInt32BE(4, 2);
  pdu.writeUInt32BE(0x00, 6);
  return pdu;
}

export function encodePDataTfPdu(
  presentationContextId: number,
  data: Buffer,
  isCommand: boolean,
  isLast: boolean
): Buffer {
  let msgControl = 0;
  if (isCommand) msgControl |= 0x01;
  if (isLast) msgControl |= 0x02;

  const pdvLength = 2 + data.length;
  const pduLength = 4 + pdvLength;

  const pdu = Buffer.alloc(6 + pduLength);
  pdu.writeUInt8(DICOM_PDU_TYPES.P_DATA_TF, 0);
  pdu.writeUInt8(0x00, 1);
  pdu.writeUInt32BE(pduLength, 2);

  pdu.writeUInt32BE(pdvLength, 6);
  pdu.writeUInt8(presentationContextId, 10);
  pdu.writeUInt8(msgControl, 11);
  data.copy(pdu, 12);

  return pdu;
}

export function decodePduHeader(buf: Buffer): {
  pduType: number;
  pduLength: number;
} {
  if (buf.length < 6) {
    throw new Error(`Buffer too short for DICOM PDU header: ${buf.length} < 6`);
  }
  return {
    pduType: buf.readUInt8(0),
    pduLength: buf.readUInt32BE(2),
  };
}

export function decodePDataTf(buf: Buffer): {
  presentationContextId: number;
  isCommand: boolean;
  isLast: boolean;
  data: Buffer;
} {
  if (buf.length < 12) {
    throw new Error("Invalid P-DATA-TF PDU: length < 12 bytes");
  }
  const pdvLength = buf.readUInt32BE(6);
  const presentationContextId = buf.readUInt8(10);
  const msgControl = buf.readUInt8(11);

  return {
    presentationContextId,
    isCommand: (msgControl & 0x01) !== 0,
    isLast: (msgControl & 0x02) !== 0,
    data: buf.subarray(12, 12 + pdvLength - 2),
  };
}

export function encodeDimseCommand(msg: DimseMessage): Buffer {
  const elements: Buffer[] = [];

  function addTag(tagGroup: number, tagElem: number, valBytes: Buffer) {
    let padded = valBytes;
    if (padded.length % 2 !== 0) {
      padded = Buffer.concat([padded, Buffer.from([0x00])]);
    }
    const header = Buffer.alloc(8);
    header.writeUInt16LE(tagGroup, 0);
    header.writeUInt16LE(tagElem, 2);
    header.writeUInt32LE(padded.length, 4);
    elements.push(Buffer.concat([header, padded]));
  }

  if (msg.affectedSopClassUid) {
    addTag(0x0000, 0x0002, Buffer.from(msg.affectedSopClassUid, "ascii"));
  }

  const cmdBuf = Buffer.alloc(2);
  cmdBuf.writeUInt16LE(msg.commandField, 0);
  addTag(0x0000, 0x0100, cmdBuf);

  if (msg.messageId !== undefined) {
    const idBuf = Buffer.alloc(2);
    idBuf.writeUInt16LE(msg.messageId, 0);
    addTag(0x0000, 0x0110, idBuf);
  }

  if (msg.messageIdBeingRespondedTo !== undefined) {
    const respBuf = Buffer.alloc(2);
    respBuf.writeUInt16LE(msg.messageIdBeingRespondedTo, 0);
    addTag(0x0000, 0x0120, respBuf);
  }

  const dsTypeBuf = Buffer.alloc(2);
  dsTypeBuf.writeUInt16LE(msg.hasDataset ? 0x0001 : 0x0101, 0);
  addTag(0x0000, 0x0800, dsTypeBuf);

  if (msg.status !== undefined) {
    const statusBuf = Buffer.alloc(2);
    statusBuf.writeUInt16LE(msg.status, 0);
    addTag(0x0000, 0x0900, statusBuf);
  }

  if (msg.affectedSopInstanceUid) {
    addTag(0x0000, 0x1000, Buffer.from(msg.affectedSopInstanceUid, "ascii"));
  }

  const rawElements = Buffer.concat(elements);
  const groupLenBuf = Buffer.alloc(12);
  groupLenBuf.writeUInt16LE(0x0000, 0);
  groupLenBuf.writeUInt16LE(0x0000, 2);
  groupLenBuf.writeUInt32LE(4, 4);
  groupLenBuf.writeUInt32LE(rawElements.length, 8);

  return Buffer.concat([groupLenBuf, rawElements]);
}

export function decodeDimseCommand(buf: Buffer): DimseMessage {
  let offset = 0;
  const msg: DimseMessage = {
    commandField: 0,
    messageId: 0,
    hasDataset: false,
  };

  while (offset + 8 <= buf.length) {
    const group = buf.readUInt16LE(offset);
    const element = buf.readUInt16LE(offset + 2);
    const length = buf.readUInt32LE(offset + 4);
    offset += 8;

    if (offset + length > buf.length) break;
    const valueBuf = buf.subarray(offset, offset + length);
    offset += length;

    if (group === 0x0000) {
      if (element === 0x0100) {
        msg.commandField = valueBuf.readUInt16LE(0);
      } else if (element === 0x0110) {
        msg.messageId = valueBuf.readUInt16LE(0);
      } else if (element === 0x0120) {
        msg.messageIdBeingRespondedTo = valueBuf.readUInt16LE(0);
      } else if (element === 0x0800) {
        const dsType = valueBuf.readUInt16LE(0);
        msg.hasDataset = dsType !== 0x0101;
      } else if (element === 0x0900) {
        msg.status = valueBuf.readUInt16LE(0);
      } else if (element === 0x0002) {
        msg.affectedSopClassUid = valueBuf.toString("ascii").replace(/\0+$/, "").trim();
      } else if (element === 0x1000) {
        msg.affectedSopInstanceUid = valueBuf.toString("ascii").replace(/\0+$/, "").trim();
      }
    }
  }

  return msg;
}

// ----------------------------------------------------------------------------
// PACS Storage Adapters
// ----------------------------------------------------------------------------

export interface StoredDicomInstance {
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
  storedAt: string;
}

export interface IPacsStorageAdapter {
  store(sopInstanceUid: string, bytes: Uint8Array, metadata: Record<string, unknown>): Promise<boolean>;
  retrieve(sopInstanceUid: string): Promise<StoredDicomInstance | undefined>;
  has(sopInstanceUid: string): Promise<boolean>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export class InMemoryDicomStorage implements IPacsStorageAdapter {
  private instances = new Map<string, StoredDicomInstance>();

  public async store(sopInstanceUid: string, bytes: Uint8Array, metadata: Record<string, unknown>): Promise<boolean> {
    this.instances.set(sopInstanceUid, {
      bytes,
      metadata,
      storedAt: new Date().toISOString(),
    });
    return true;
  }

  public async retrieve(sopInstanceUid: string): Promise<StoredDicomInstance | undefined> {
    return this.instances.get(sopInstanceUid);
  }

  public async has(sopInstanceUid: string): Promise<boolean> {
    return this.instances.has(sopInstanceUid);
  }

  public async count(): Promise<number> {
    return this.instances.size;
  }

  public async clear(): Promise<void> {
    this.instances.clear();
  }
}

export class DurableDiskDicomStorage implements IPacsStorageAdapter {
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    if (typeof process !== "undefined" && !fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch {
        // Restricted environment fallback
      }
    }
  }

  public async store(sopInstanceUid: string, bytes: Uint8Array, metadata: Record<string, unknown>): Promise<boolean> {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const dcmPath = path.join(this.storageDir, `${sopInstanceUid}.dcm`);
      const metaPath = path.join(this.storageDir, `${sopInstanceUid}.meta.json`);
      fs.writeFileSync(dcmPath, Buffer.from(bytes));
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  public async retrieve(sopInstanceUid: string): Promise<StoredDicomInstance | undefined> {
    const dcmPath = path.join(this.storageDir, `${sopInstanceUid}.dcm`);
    const metaPath = path.join(this.storageDir, `${sopInstanceUid}.meta.json`);
    if (!fs.existsSync(dcmPath)) return undefined;

    try {
      const bytes = new Uint8Array(fs.readFileSync(dcmPath));
      let meta: Record<string, unknown> = {};
      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
      }
      return {
        bytes,
        metadata: meta,
        storedAt: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

  public async has(sopInstanceUid: string): Promise<boolean> {
    const dcmPath = path.join(this.storageDir, `${sopInstanceUid}.dcm`);
    return fs.existsSync(dcmPath);
  }

  public async count(): Promise<number> {
    if (!fs.existsSync(this.storageDir)) return 0;
    return fs.readdirSync(this.storageDir).filter((f) => f.endsWith(".dcm")).length;
  }

  public async clear(): Promise<void> {
    if (fs.existsSync(this.storageDir)) {
      for (const f of fs.readdirSync(this.storageDir)) {
        try {
          fs.unlinkSync(path.join(this.storageDir, f));
        } catch {}
      }
    }
  }
}

// ----------------------------------------------------------------------------
// DICOM Network Transports
// ----------------------------------------------------------------------------

export interface IDicomNetworkTransport {
  listen(port: number, host?: string): Promise<void>;
  close(): Promise<void>;
  isListening(): boolean;
  onAssociation(handler: (req: AssociationRequest) => Promise<AssociationAcceptance>): void;
}

export class SimulatorDicomTransport implements IDicomNetworkTransport {
  private listening = false;
  private handler: ((req: AssociationRequest) => Promise<AssociationAcceptance>) | null = null;

  public async listen(_port: number, _host?: string): Promise<void> {
    this.listening = true;
  }

  public async close(): Promise<void> {
    this.listening = false;
  }

  public isListening(): boolean {
    return this.listening;
  }

  public onAssociation(handler: (req: AssociationRequest) => Promise<AssociationAcceptance>): void {
    this.handler = handler;
  }

  public async triggerAssociation(req: AssociationRequest): Promise<AssociationAcceptance> {
    if (!this.handler) {
      throw new Error("No association handler registered on simulator transport");
    }
    return this.handler(req);
  }
}

export class NodeTcpDicomTransport implements IDicomNetworkTransport {
  private server: net.Server | null = null;
  private listening = false;
  private handler: ((req: AssociationRequest) => Promise<AssociationAcceptance>) | null = null;

  public async listen(port: number, host = "0.0.0.0"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        socket.on("data", async (buf) => {
          try {
            const header = decodePduHeader(buf);
            if (header.pduType === DICOM_PDU_TYPES.A_ASSOCIATE_RQ) {
              const req = decodeAssociateRqPdu(buf);
              if (this.handler) {
                try {
                  const ac = await this.handler(req);
                  socket.write(encodeAssociateAcPdu(ac));
                } catch {
                  // Reject association
                  const rjBuf = Buffer.from([
                    DICOM_PDU_TYPES.A_ASSOCIATE_RJ,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x04,
                    0x00,
                    0x01,
                    0x01,
                    0x01,
                  ]);
                  socket.write(rjBuf);
                }
              }
            } else if (header.pduType === DICOM_PDU_TYPES.A_RELEASE_RQ) {
              socket.write(encodeReleaseRpPdu());
              socket.end();
            }
          } catch {
            socket.destroy();
          }
        });
      });

      this.server.listen(port, host, () => {
        this.listening = true;
        resolve();
      });

      this.server.on("error", (err) => {
        this.listening = false;
        reject(err);
      });
    });
  }

  public async close(): Promise<void> {
    this.listening = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  public isListening(): boolean {
    return this.listening;
  }

  public onAssociation(handler: (req: AssociationRequest) => Promise<AssociationAcceptance>): void {
    this.handler = handler;
  }
}

// ----------------------------------------------------------------------------
// PACS Bridge Service
// ----------------------------------------------------------------------------

export interface PacsBridgeConfig {
  localAeTitle: string;
  port: number;
  organizationId?: string;
  storageVaultDir?: string;
  allowedCallingAeTitles?: string[];
  maxAssociations?: number;
}

export class PacsBridgeService implements IPacsBridgeService {
  private config: PacsBridgeConfig;
  private isRunning = false;
  private storedStudiesCount = 0;
  private activeAssociationsCount = 0;
  private lastSeenAt: string | null = null;
  private lastError: string | undefined = undefined;

  private worklistItems: Map<string, DicomModalityWorklistItem> = new Map();
  private storedInstances: Map<string, { bytes: Uint8Array; metadata: unknown }> = new Map();
  private storage: IPacsStorageAdapter;
  private transport: IDicomNetworkTransport | null = null;
  private isSimulatedTransport = true;

  constructor(
    config: Partial<PacsBridgeConfig> = {},
    storage?: IPacsStorageAdapter,
    transport?: IDicomNetworkTransport
  ) {
    this.config = {
      localAeTitle: config.localAeTitle || "OHMS_PACS",
      port: config.port || 11112,
      organizationId: config.organizationId,
      storageVaultDir: config.storageVaultDir || "diagnostics-vault",
      allowedCallingAeTitles: config.allowedCallingAeTitles,
      maxAssociations: config.maxAssociations || 10,
    };

    this.storage = storage || new InMemoryDicomStorage();
    if (transport) {
      this.transport = transport;
      this.isSimulatedTransport = transport instanceof SimulatorDicomTransport;
    } else {
      this.transport = new SimulatorDicomTransport();
      this.isSimulatedTransport = true;
    }

    if (this.transport) {
      this.transport.onAssociation(this.negotiateAssociation.bind(this));
    }

    this.seedDefaultWorklist();
  }

  private seedDefaultWorklist(): void {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const defaults: DicomModalityWorklistItem[] = [
      {
        accessionNumber: "ACC-2026-9041",
        patientId: "ONN-P-10948",
        patientName: "ISLAM^RAFIQUL",
        patientBirthDate: "19820512",
        patientSex: "M",
        modality: "DX",
        scheduledStationAeTitle: "SHIMADZU_RAD1",
        scheduledProcedureStepStartDate: today,
        scheduledProcedureStepStartTime: "103000",
        scheduledProcedureStepDescription: "Chest X-Ray PA View",
        studyInstanceUid: "1.2.826.0.1.3680043.8.498.202609041",
        requestedProcedureId: "PROC-XR-CHEST",
      },
      {
        accessionNumber: "ACC-2026-9042",
        patientId: "ONN-P-08421",
        patientName: "ROKEYA^BEGUM",
        patientBirthDate: "19750920",
        patientSex: "F",
        modality: "US",
        scheduledStationAeTitle: "GE_VOLUSON_US1",
        scheduledProcedureStepStartDate: today,
        scheduledProcedureStepStartTime: "111500",
        scheduledProcedureStepDescription: "Whole Abdomen Ultrasound",
        studyInstanceUid: "1.2.826.0.1.3680043.8.498.202609042",
        requestedProcedureId: "PROC-US-ABD",
      },
    ];

    for (const item of defaults) {
      this.worklistItems.set(item.accessionNumber, item);
    }
  }

  public getStatus(): DeviceStatus {
    const isListening = this.transport ? this.transport.isListening() : false;
    let state: DeviceConnectionState = "UNCONFIGURED";
    if (!this.transport) {
      state = "UNCONFIGURED";
    } else if (this.isRunning && isListening) {
      state = "CONNECTED";
    } else if (this.isRunning) {
      state = "CONNECTED";
    } else {
      state = "DISCONNECTED";
    }

    return {
      deviceClass: "PACS_MODALITY",
      deviceId: `PACS_${this.config.localAeTitle}`,
      name: `PACS Bridge (${this.config.localAeTitle}:${this.config.port})`,
      state,
      isSimulated: this.isSimulatedTransport,
      lastSeenAt: this.lastSeenAt,
      errorMessage: this.lastError,
      telemetry: {
        localAeTitle: this.config.localAeTitle,
        port: this.config.port,
        storedStudiesCount: this.storedStudiesCount,
        activeAssociationsCount: this.activeAssociationsCount,
        activeWorklistCount: this.worklistItems.size,
        transport: this.isSimulatedTransport ? "LOOPBACK_SIMULATOR" : "TCP_LISTENER",
        allowedCallingAeTitles: this.config.allowedCallingAeTitles || ["*"],
      },
    };
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    if (this.transport) {
      await this.transport.listen(this.config.port);
    }
    this.lastSeenAt = new Date().toISOString();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.transport) {
      await this.transport.close();
    }
  }

  public async echo(_targetNode: DicomNode): Promise<boolean> {
    this.lastSeenAt = new Date().toISOString();
    return true;
  }

  public async negotiateAssociation(req: AssociationRequest): Promise<AssociationAcceptance> {
    if (
      this.config.allowedCallingAeTitles &&
      this.config.allowedCallingAeTitles.length > 0 &&
      !this.config.allowedCallingAeTitles.includes("*")
    ) {
      if (!this.config.allowedCallingAeTitles.includes(req.callingAeTitle)) {
        throw new Error(
          `DICOM Association rejected: Calling AE Title '${req.callingAeTitle}' not in allowlist`
        );
      }
    }

    const acceptedPcs: PresentationContext[] = [];
    const supportedSyntaxes = Object.values(DICOM_SOP_CLASSES) as string[];

    for (const pc of req.presentationContexts) {
      const isSyntaxSupported = supportedSyntaxes.includes(pc.abstractSyntax);
      if (!isSyntaxSupported) {
        acceptedPcs.push({
          id: pc.id,
          abstractSyntax: pc.abstractSyntax,
          transferSyntaxes: [],
          result: 3, // Abstract syntax not supported
        });
        continue;
      }

      const validSyntaxes: readonly string[] = Object.values(DICOM_TRANSFER_SYNTAXES);
      const acceptedTransferSyntax =
        pc.transferSyntaxes.find((ts) => validSyntaxes.includes(ts)) ||
        DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN;

      acceptedPcs.push({
        id: pc.id,
        abstractSyntax: pc.abstractSyntax,
        transferSyntaxes: [acceptedTransferSyntax],
        result: 0, // Acceptance
      });
    }

    this.activeAssociationsCount++;
    this.lastSeenAt = new Date().toISOString();

    return {
      callingAeTitle: req.callingAeTitle,
      calledAeTitle: this.config.localAeTitle,
      presentationContexts: acceptedPcs,
      maxPduLength: req.maxPduLength || DEFAULT_MAX_PDU_LENGTH,
    };
  }

  public async queryWorklist(
    filters: Partial<DicomModalityWorklistItem> = {}
  ): Promise<DicomModalityWorklistItem[]> {
    this.lastSeenAt = new Date().toISOString();

    const items = Array.from(this.worklistItems.values());
    if (Object.keys(filters).length === 0) {
      return items;
    }

    return items.filter((item) => {
      if (filters.modality && item.modality !== filters.modality) return false;
      if (filters.patientId && item.patientId !== filters.patientId) return false;
      if (filters.accessionNumber && item.accessionNumber !== filters.accessionNumber) return false;
      if (
        filters.scheduledStationAeTitle &&
        item.scheduledStationAeTitle !== filters.scheduledStationAeTitle
      ) {
        return false;
      }
      return true;
    });
  }

  public addWorklistItem(item: DicomModalityWorklistItem): void {
    this.worklistItems.set(item.accessionNumber, item);
  }

  public async storeInstance(
    dicomBytes: Uint8Array,
    _sourceNode: DicomNode
  ): Promise<DicomStoreResult> {
    try {
      this.lastSeenAt = new Date().toISOString();

      const parsed = parseDicomHeader(dicomBytes);
      const sopInstanceUid =
        parsed.sopInstanceUid ||
        `1.2.826.0.1.3680043.8.498.${Date.now()}`;
      const sopClassUid =
        parsed.modality === "CT"
          ? DICOM_SOP_CLASSES.CT_IMAGE_STORAGE
          : parsed.modality === "US"
          ? DICOM_SOP_CLASSES.US_IMAGE_STORAGE
          : DICOM_SOP_CLASSES.DX_IMAGE_STORAGE;

      await this.storage.store(sopInstanceUid, dicomBytes, parsed as Record<string, unknown>);

      this.storedInstances.set(sopInstanceUid, {
        bytes: dicomBytes,
        metadata: parsed,
      });

      this.storedStudiesCount++;

      return {
        success: true,
        sopInstanceUid,
        sopClassUid,
        bytesReceived: dicomBytes.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      return {
        success: false,
        sopInstanceUid: "",
        sopClassUid: "",
        bytesReceived: dicomBytes.length,
        error: msg,
      };
    }
  }

  public getStoredInstance(sopInstanceUid: string) {
    return this.storedInstances.get(sopInstanceUid);
  }

  public getStoredCount(): number {
    return this.storedStudiesCount;
  }

  public getStorageAdapter(): IPacsStorageAdapter {
    return this.storage;
  }

  public getNetworkTransport(): IDicomNetworkTransport | null {
    return this.transport;
  }
}

// ----------------------------------------------------------------------------
// Modality Simulator
// ----------------------------------------------------------------------------

export interface ModalitySimulationReport {
  modalityAe: string;
  pacsAe: string;
  associationAccepted: boolean;
  worklistItemsFound: number;
  studyUploaded: boolean;
  sopInstanceUid?: string;
  bytesTransferred: number;
}

export class DicomModalitySimulator {
  private modalityNode: DicomNode;
  private pacsNode: DicomNode;
  private pacsService: PacsBridgeService;

  constructor(
    modalityNode: Partial<DicomNode> = {},
    pacsNode: Partial<DicomNode> = {},
    pacsService?: PacsBridgeService
  ) {
    this.modalityNode = {
      aeTitle: modalityNode.aeTitle || "SHIMADZU_RAD1",
      host: modalityNode.host || "192.168.1.210",
      port: modalityNode.port || 104,
    };
    this.pacsNode = {
      aeTitle: pacsNode.aeTitle || "OHMS_PACS",
      host: pacsNode.host || "192.168.1.200",
      port: pacsNode.port || 11112,
    };
    this.pacsService = pacsService || new PacsBridgeService({
      localAeTitle: this.pacsNode.aeTitle,
      port: this.pacsNode.port,
    });
  }

  public async executeFullClinicalRadiologyCycle(): Promise<ModalitySimulationReport> {
    const assocReq: AssociationRequest = {
      callingAeTitle: this.modalityNode.aeTitle,
      calledAeTitle: this.pacsNode.aeTitle,
      presentationContexts: [
        {
          id: 1,
          abstractSyntax: DICOM_SOP_CLASSES.VERIFICATION,
          transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
        },
        {
          id: 3,
          abstractSyntax: DICOM_SOP_CLASSES.MODALITY_WORKLIST_FIND,
          transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
        },
        {
          id: 5,
          abstractSyntax: DICOM_SOP_CLASSES.DX_IMAGE_STORAGE,
          transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
        },
      ],
    };

    const rqPdu = encodeAssociateRqPdu(assocReq);
    const rqHeader = decodePduHeader(rqPdu);

    if (rqHeader.pduType !== 0x01) {
      throw new Error(`Failed to encode A-ASSOCIATE-RQ: type is ${rqHeader.pduType}`);
    }

    const acPdu = encodeAssociateAcPdu({
      callingAeTitle: assocReq.callingAeTitle,
      calledAeTitle: assocReq.calledAeTitle,
      presentationContexts: assocReq.presentationContexts.map((pc) => ({
        ...pc,
        result: 0x00,
      })),
      maxPduLength: 65536,
    });
    const acHeader = decodePduHeader(acPdu);
    const associationAccepted = acHeader.pduType === 0x02;

    const worklist = await this.pacsService.queryWorklist({
      modality: "DX",
    });

    const targetPatient = worklist[0] || {
      patientId: "ONN-P-10948",
      patientName: "ISLAM^RAFIQUL",
      accessionNumber: "ACC-2026-9041",
    };

    const syntheticPhantom = createSyntheticDicomBuffer({
      patientId: targetPatient.patientId,
      patientName: targetPatient.patientName,
      modality: "DX",
    });

    const storeResult = await this.pacsService.storeInstance(
      syntheticPhantom,
      this.modalityNode
    );

    const _relRq = encodeReleaseRqPdu();
    const relRp = encodeReleaseRpPdu();
    const relAccepted = decodePduHeader(relRp).pduType === 0x06;

    return {
      modalityAe: this.modalityNode.aeTitle,
      pacsAe: this.pacsNode.aeTitle,
      associationAccepted: associationAccepted && relAccepted,
      worklistItemsFound: worklist.length,
      studyUploaded: storeResult.success,
      sopInstanceUid: storeResult.sopInstanceUid,
      bytesTransferred: syntheticPhantom.length,
    };
  }
}
