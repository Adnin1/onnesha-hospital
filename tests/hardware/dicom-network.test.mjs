import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DICOM_SOP_CLASSES,
  DICOM_TRANSFER_SYNTAXES,
  DICOM_PDU_TYPES,
  DIMSE_COMMANDS,
  DIMSE_STATUS,
  encodeAssociateRqPdu,
  encodeAssociateAcPdu,
  encodeReleaseRqPdu,
  encodeReleaseRpPdu,
  encodePDataTfPdu,
  decodePduHeader,
  decodePDataTf,
  encodeDimseCommand,
  decodeDimseCommand,
  PacsBridgeService,
  DicomModalitySimulator,
  createSyntheticDicomBuffer,
} from '../../lib/hardware/pacs/dicom-pacs.ts';

test('DICOM 1. A-ASSOCIATE-RQ and A-ASSOCIATE-AC PDU encoding and decoding', () => {
  const reqPdu = encodeAssociateRqPdu({
    callingAeTitle: 'RAD_MODALITY1',
    calledAeTitle: 'OHMS_PACS',
    presentationContexts: [
      {
        id: 1,
        abstractSyntax: DICOM_SOP_CLASSES.VERIFICATION,
        transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
      },
      {
        id: 3,
        abstractSyntax: DICOM_SOP_CLASSES.DX_IMAGE_STORAGE,
        transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
      },
    ],
  });

  const reqHeader = decodePduHeader(reqPdu);
  assert.equal(reqHeader.pduType, DICOM_PDU_TYPES.A_ASSOCIATE_RQ);
  assert.ok(reqHeader.pduLength > 68, 'PDU length must include 68 fixed bytes plus items');

  const acPdu = encodeAssociateAcPdu({
    callingAeTitle: 'RAD_MODALITY1',
    calledAeTitle: 'OHMS_PACS',
    presentationContexts: [
      {
        id: 1,
        abstractSyntax: DICOM_SOP_CLASSES.VERIFICATION,
        transferSyntaxes: [DICOM_TRANSFER_SYNTAXES.EXPLICIT_VR_LITTLE_ENDIAN],
        result: 0,
      },
    ],
    maxPduLength: 65536,
  });

  const acHeader = decodePduHeader(acPdu);
  assert.equal(acHeader.pduType, DICOM_PDU_TYPES.A_ASSOCIATE_AC);
});

test('DICOM 2. A-RELEASE-RQ and A-RELEASE-RP association teardown framing', () => {
  const relRq = encodeReleaseRqPdu();
  assert.equal(decodePduHeader(relRq).pduType, DICOM_PDU_TYPES.A_RELEASE_RQ);
  assert.equal(relRq.length, 10);

  const relRp = encodeReleaseRpPdu();
  assert.equal(decodePduHeader(relRp).pduType, DICOM_PDU_TYPES.A_RELEASE_RP);
  assert.equal(relRp.length, 10);
});

test('DICOM 3. P-DATA-TF presentation data value (PDV) framing and flags', () => {
  const testData = Buffer.from('DICOM_DATASET_PAYLOAD', 'ascii');
  const pDataPdu = encodePDataTfPdu(1, testData, true, true);

  const header = decodePduHeader(pDataPdu);
  assert.equal(header.pduType, DICOM_PDU_TYPES.P_DATA_TF);

  const pdv = decodePDataTf(pDataPdu);
  assert.equal(pdv.presentationContextId, 1);
  assert.equal(pdv.isCommand, true);
  assert.equal(pdv.isLast, true);
  assert.equal(pdv.data.toString('ascii'), 'DICOM_DATASET_PAYLOAD');
});

test('DICOM 4. DIMSE Command Group (0000,xxxx) binary roundtrip', () => {
  const original = {
    commandField: DIMSE_COMMANDS.C_STORE_RQ,
    messageId: 42,
    hasDataset: true,
    affectedSopClassUid: DICOM_SOP_CLASSES.DX_IMAGE_STORAGE,
    affectedSopInstanceUid: '1.2.826.0.1.3680043.8.498.12345',
  };

  const encoded = encodeDimseCommand(original);
  assert.ok(encoded.length > 20, 'DIMSE command buffer must contain serialized elements');

  const decoded = decodeDimseCommand(encoded);
  assert.equal(decoded.commandField, DIMSE_COMMANDS.C_STORE_RQ);
  assert.equal(decoded.messageId, 42);
  assert.equal(decoded.hasDataset, true);
  assert.equal(decoded.affectedSopClassUid, DICOM_SOP_CLASSES.DX_IMAGE_STORAGE);
  assert.equal(decoded.affectedSopInstanceUid, '1.2.826.0.1.3680043.8.498.12345');
});

test('DICOM 5. PACS Bridge Modality Worklist (MWL) query and C-STORE instance storage', async () => {
  const pacs = new PacsBridgeService({ localAeTitle: 'OHMS_PACS', port: 11112 });
  await pacs.start();

  const status = pacs.getStatus();
  assert.equal(status.state, 'CONNECTED');
  assert.equal(status.telemetry?.localAeTitle, 'OHMS_PACS');

  // Query Modality Worklist (C-FIND)
  const worklist = await pacs.queryWorklist({ modality: 'DX' });
  assert.ok(worklist.length > 0, 'Must return scheduled X-Ray exams from worklist');
  assert.equal(worklist[0].modality, 'DX');
  assert.equal(worklist[0].patientId, 'ONN-P-10948');

  // Store DICOM instance (C-STORE)
  const phantomBytes = createSyntheticDicomBuffer({
    patientId: 'ONN-P-10948',
    patientName: 'ISLAM^RAFIQUL',
    modality: 'DX',
  });

  const storeResult = await pacs.storeInstance(phantomBytes, {
    aeTitle: 'SHIMADZU_RAD1',
    host: '192.168.1.210',
    port: 104,
  });

  assert.equal(storeResult.success, true);
  assert.ok(storeResult.sopInstanceUid.length > 0);
  assert.equal(pacs.getStoredCount(), 1);

  const storedInstance = pacs.getStoredInstance(storeResult.sopInstanceUid);
  assert.ok(storedInstance !== undefined);
  assert.equal(storedInstance.bytes.length, phantomBytes.length);

  await pacs.stop();
});

test('DICOM 6. End-to-End Modality Simulator execution cycle', async () => {
  const simulator = new DicomModalitySimulator();
  const report = await simulator.executeFullClinicalRadiologyCycle();

  assert.equal(report.modalityAe, 'SHIMADZU_RAD1');
  assert.equal(report.pacsAe, 'OHMS_PACS');
  assert.equal(report.associationAccepted, true, 'Association negotiation must succeed');
  assert.ok(report.worklistItemsFound > 0, 'Must query Modality Worklist successfully');
  assert.equal(report.studyUploaded, true, 'Must upload DICOM study instance to PACS');
  assert.ok(report.bytesTransferred > 50000, 'Must transfer valid DICOM imaging bytes');
});
