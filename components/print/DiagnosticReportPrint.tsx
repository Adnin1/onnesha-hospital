"use client";

import React from "react";
import { HospitalPrintHeader, HospitalPrintFooter } from "./HospitalPrintHeader";
import { generateSvgBarcode } from "@/lib/print/barcode";

export interface DiagnosticReportPrintProps {
  orderNumber: string;
  reportDateStr: string;
  sampleCollectedAtStr?: string;
  patient: {
    name: string;
    patientCode: string;
    age?: number | string;
    gender?: string;
    phone?: string;
  };
  referringDoctorName?: string;
  departmentName?: string;
  parameters: Array<{
    name: string;
    resultValue: string;
    unit?: string;
    referenceRange?: string;
    isAbnormal?: boolean;
  }>;
  technologistName: string;
  pathologist: {
    name: string;
    qualifications: string;
    designation: string;
  };
  clinicalNotes?: string;
}

export function DiagnosticReportPrint({
  orderNumber,
  reportDateStr,
  sampleCollectedAtStr,
  patient,
  referringDoctorName,
  departmentName,
  parameters,
  technologistName,
  pathologist,
  clinicalNotes,
}: DiagnosticReportPrintProps) {
  const barcodeSvg = generateSvgBarcode(orderNumber, 32);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:m-0 print:p-0">
      {/* 1. Header */}
      <HospitalPrintHeader
        documentTitle="DIAGNOSTIC TEST REPORT"
        documentNumber={orderNumber}
        dateStr={reportDateStr}
      />

      {/* 2. Patient & Sample Bar */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded border bg-zinc-50 p-4 text-xs">
        <div className="space-y-1">
          <div><span className="text-zinc-500">Patient: </span><strong>{patient.name}</strong></div>
          <div><span className="text-zinc-500">Patient Code: </span><span className="font-mono">{patient.patientCode}</span></div>
          <div><span className="text-zinc-500">Age / Gender: </span><span>{patient.age || "—"} Y / {patient.gender || "—"}</span></div>
        </div>
        <div className="space-y-1 text-right">
          {referringDoctorName && <div><span className="text-zinc-500">Ref. Doctor: </span><strong>{referringDoctorName}</strong></div>}
          {departmentName && <div><span className="text-zinc-500">Section: </span><span>{departmentName}</span></div>}
          {sampleCollectedAtStr && <div><span className="text-zinc-500">Sample Time: </span><span>{sampleCollectedAtStr}</span></div>}
        </div>
      </div>

      {/* 3. Investigation Parameters Table */}
      <div className="mb-6 min-h-[350px]">
        <table className="w-full text-left text-xs border border-collapse border-zinc-200">
          <thead className="bg-zinc-100">
            <tr>
              <th className="border p-2">Investigation / Parameter</th>
              <th className="border p-2">Result</th>
              <th className="border p-2">Unit</th>
              <th className="border p-2">Biological Reference Range</th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((param, idx) => (
              <tr key={idx} className={param.isAbnormal ? "bg-amber-50/50" : ""}>
                <td className="border p-2 font-medium">{param.name}</td>
                <td className="border p-2 font-bold">
                  <span className={param.isAbnormal ? "text-rose-600 underline" : ""}>
                    {param.resultValue}
                  </span>
                  {param.isAbnormal && <span className="ml-1 text-[10px] text-rose-600 font-normal">[HIGH/LOW]</span>}
                </td>
                <td className="border p-2 text-zinc-500">{param.unit || "—"}</td>
                <td className="border p-2 text-zinc-600">{param.referenceRange || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {clinicalNotes && (
          <div className="mt-4 rounded border border-zinc-200 p-3 text-xs">
            <strong className="text-zinc-800">Pathologist Impression: </strong>
            <span className="text-zinc-600">{clinicalNotes}</span>
          </div>
        )}
      </div>

      {/* 4. Dual Signatures (Technologist & Pathologist) */}
      <div className="mb-6 flex justify-between items-end border-t pt-8 text-xs">
        <div>
          <div className="w-36 border-b border-zinc-400 mb-1"></div>
          <p className="font-semibold text-zinc-700">{technologistName}</p>
          <p className="text-[10px] text-zinc-500">Medical Technologist (Lab)</p>
        </div>

        <div className="text-right">
          <div className="inline-block px-2 py-0.5 mb-2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded border border-emerald-300">
            ELECTRONICALLY VERIFIED & APPROVED
          </div>
          <div className="w-48 border-b border-zinc-400 mb-1 ml-auto"></div>
          <p className="font-bold text-sky-950">{pathologist.name}</p>
          <p className="text-zinc-600">{pathologist.qualifications}</p>
          <p className="text-[10px] text-zinc-500">{pathologist.designation}</p>
        </div>
      </div>

      {/* Barcode */}
      <div className="flex justify-center border-t pt-3">
        <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
      </div>

      {/* Footer */}
      <HospitalPrintFooter />
    </div>
  );
}
