"use client";

import React from "react";
import { HospitalPrintHeader, HospitalPrintFooter } from "./HospitalPrintHeader";

export interface DischargeSummaryPrintProps {
  admissionNumber: string;
  dischargeDateStr: string;
  admissionDateStr: string;
  patient: {
    name: string;
    patientCode: string;
    age?: number | string;
    gender?: string;
    phone?: string;
    address?: string;
  };
  wardName: string;
  bedNumber: string;
  consultantDoctorName: string;
  admissionDiagnosis: string;
  finalDiagnosis: string;
  hospitalCourseSummary: string;
  dischargeVitals?: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    spo2?: number;
  };
  takeHomeMedications: Array<{
    name: string;
    dosage: string;
    duration: string;
    instructions?: string;
  }>;
  followUpInstructions: string;
}

export function DischargeSummaryPrint({
  admissionNumber,
  dischargeDateStr,
  admissionDateStr,
  patient,
  wardName,
  bedNumber,
  consultantDoctorName,
  admissionDiagnosis,
  finalDiagnosis,
  hospitalCourseSummary,
  dischargeVitals,
  takeHomeMedications,
  followUpInstructions,
}: DischargeSummaryPrintProps) {
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:m-0 print:p-0">
      {/* Header */}
      <HospitalPrintHeader
        documentTitle="IPD DISCHARGE CERTIFICATE & CLINICAL SUMMARY"
        documentNumber={admissionNumber}
        dateStr={dischargeDateStr}
      />

      {/* Patient & Stay Details */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded border bg-zinc-50 p-4 text-xs">
        <div className="space-y-1">
          <div><span className="text-zinc-500">Patient: </span><strong>{patient.name}</strong></div>
          <div><span className="text-zinc-500">Patient Code: </span><span className="font-mono">{patient.patientCode}</span></div>
          <div><span className="text-zinc-500">Age / Gender: </span><span>{patient.age || "—"} Y / {patient.gender || "—"}</span></div>
          {patient.phone && <div><span className="text-zinc-500">Phone: </span><span>{patient.phone}</span></div>}
        </div>
        <div className="space-y-1 text-right">
          <div><span className="text-zinc-500">Ward / Bed: </span><strong>{wardName} (Bed #{bedNumber})</strong></div>
          <div><span className="text-zinc-500">Attending Consultant: </span><strong>{consultantDoctorName}</strong></div>
          <div><span className="text-zinc-500">Admission Date: </span><span>{admissionDateStr}</span></div>
          <div><span className="text-zinc-500">Discharge Date: </span><strong className="text-sky-900">{dischargeDateStr}</strong></div>
        </div>
      </div>

      {/* Diagnoses */}
      <div className="mb-4 grid grid-cols-2 gap-4 rounded border p-3 text-xs">
        <div>
          <span className="text-zinc-500 block font-semibold uppercase">Admission Diagnosis:</span>
          <p className="text-zinc-800 font-medium">{admissionDiagnosis}</p>
        </div>
        <div>
          <span className="text-zinc-500 block font-semibold uppercase">Final Discharge Diagnosis:</span>
          <p className="text-sky-950 font-bold">{finalDiagnosis}</p>
        </div>
      </div>

      {/* Hospital Course & Vitals */}
      <div className="mb-4 space-y-3 text-xs">
        <div className="rounded border p-3">
          <h3 className="font-bold uppercase text-zinc-700 mb-1">Clinical Course in Hospital</h3>
          <p className="text-zinc-600 whitespace-pre-line leading-relaxed">{hospitalCourseSummary}</p>
        </div>

        {dischargeVitals && (
          <div className="flex gap-6 rounded border bg-zinc-50 p-2.5">
            <div><span className="text-zinc-500">Discharge BP: </span><strong>{dischargeVitals.bp || "—"}</strong></div>
            <div><span className="text-zinc-500">Pulse: </span><strong>{dischargeVitals.pulse ? `${dischargeVitals.pulse} bpm` : "—"}</strong></div>
            <div><span className="text-zinc-500">Temp: </span><strong>{dischargeVitals.tempC ? `${dischargeVitals.tempC} °C` : "—"}</strong></div>
            <div><span className="text-zinc-500">SpO2: </span><strong>{dischargeVitals.spo2 ? `${dischargeVitals.spo2} %` : "—"}</strong></div>
          </div>
        )}
      </div>

      {/* Discharge Medications */}
      <div className="mb-4 text-xs">
        <h3 className="font-bold uppercase text-zinc-700 mb-2">Take-Home Medications (Rx)</h3>
        <table className="w-full text-left border border-collapse">
          <thead className="bg-zinc-100">
            <tr>
              <th className="border p-1.5">Medicine Name</th>
              <th className="border p-1.5">Dosage / Frequency</th>
              <th className="border p-1.5">Duration</th>
              <th className="border p-1.5">Special Instructions</th>
            </tr>
          </thead>
          <tbody>
            {takeHomeMedications.map((med, idx) => (
              <tr key={idx}>
                <td className="border p-1.5 font-bold">{med.name}</td>
                <td className="border p-1.5">{med.dosage}</td>
                <td className="border p-1.5">{med.duration}</td>
                <td className="border p-1.5 italic text-zinc-500">{med.instructions || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Advice & Follow-Up */}
      <div className="mb-6 rounded border border-amber-200 bg-amber-50/50 p-3 text-xs">
        <h4 className="font-bold text-amber-900 mb-1">Advice on Discharge & Follow-up</h4>
        <p className="text-amber-800 whitespace-pre-line">{followUpInstructions}</p>
      </div>

      {/* Footer */}
      <HospitalPrintFooter />
    </div>
  );
}
