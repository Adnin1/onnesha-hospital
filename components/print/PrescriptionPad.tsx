"use client";

import React from "react";
import { HospitalPrintHeader, HospitalPrintFooter } from "./HospitalPrintHeader";

export interface PrescriptionPadProps {
  prescriptionNumber: string;
  dateStr: string;
  doctor: {
    name: string;
    specialty: string;
    qualifications: string;
    bmdcRegNo: string;
    departmentName: string;
  };
  patient: {
    name: string;
    patientCode: string;
    age?: number | string;
    gender?: string;
    phone?: string;
    address?: string;
  };
  clinicalFindings?: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    weightKg?: number;
    chiefComplaints?: string;
    diagnosis?: string;
  };
  rxItems: Array<{
    medicineName: string;
    dosage: string; // e.g. "1+0+1"
    frequency: string; // e.g. "After meal"
    duration: string; // e.g. "7 days"
    instructions?: string;
  }>;
  diagnosticAdvice?: string[];
  followUpDate?: string;
  specialInstructions?: string;
}

export function PrescriptionPad({
  prescriptionNumber,
  dateStr,
  doctor,
  patient,
  clinicalFindings,
  rxItems,
  diagnosticAdvice,
  followUpDate,
  specialInstructions,
}: PrescriptionPadProps) {
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:m-0 print:p-0">
      {/* 1. Official Hospital Header */}
      <HospitalPrintHeader
        documentTitle="DOCTOR PRESCRIPTION PAD"
        documentNumber={prescriptionNumber}
        dateStr={dateStr}
      />

      {/* 2. Doctor Information Banner */}
      <div className="mb-4 flex justify-between border-b pb-3 text-xs">
        <div>
          <h2 className="text-sm font-bold text-sky-950">{doctor.name}</h2>
          <p className="text-zinc-600">{doctor.qualifications}</p>
          <p className="font-medium text-sky-900">{doctor.specialty} — {doctor.departmentName}</p>
          <p className="text-[11px] text-zinc-500">BMDC Reg No: {doctor.bmdcRegNo}</p>
        </div>
        <div className="text-right text-zinc-600">
          <p className="font-semibold text-zinc-800">Chamber Consultation</p>
          <p>Serial / Token Session</p>
          <p className="text-[11px]">Onnesha Hospital OP Complex</p>
        </div>
      </div>

      {/* 3. Patient Vitals & Demographics Bar */}
      <div className="mb-6 grid grid-cols-4 rounded border bg-zinc-50 p-2 text-xs">
        <div>
          <span className="text-zinc-500">Patient: </span>
          <span className="font-bold">{patient.name}</span>
        </div>
        <div>
          <span className="text-zinc-500">ID: </span>
          <span className="font-mono font-semibold">{patient.patientCode}</span>
        </div>
        <div>
          <span className="text-zinc-500">Age/Sex: </span>
          <span>{patient.age || "—"} Y / {patient.gender || "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Date: </span>
          <span>{dateStr}</span>
        </div>
      </div>

      {/* 4. Dual-Column Clinical Pad Body */}
      <div className="grid min-h-[500px] grid-cols-12 gap-6">
        {/* Left Column: Clinical Examination & Diagnostics */}
        <div className="col-span-4 border-r pr-4 text-xs space-y-4">
          {clinicalFindings && (
            <div>
              <h3 className="mb-2 font-bold uppercase text-zinc-700">Clinical Findings</h3>
              <div className="space-y-1 text-zinc-600">
                {clinicalFindings.bp && <div>BP: <span className="font-semibold">{clinicalFindings.bp} mmHg</span></div>}
                {clinicalFindings.pulse && <div>Pulse: <span className="font-semibold">{clinicalFindings.pulse} bpm</span></div>}
                {clinicalFindings.tempC && <div>Temp: <span className="font-semibold">{clinicalFindings.tempC} °C</span></div>}
                {clinicalFindings.weightKg && <div>Weight: <span className="font-semibold">{clinicalFindings.weightKg} kg</span></div>}
              </div>
            </div>
          )}

          {clinicalFindings?.chiefComplaints && (
            <div>
              <h3 className="mb-1 font-bold uppercase text-zinc-700">Chief Complaints</h3>
              <p className="text-zinc-600 whitespace-pre-line">{clinicalFindings.chiefComplaints}</p>
            </div>
          )}

          {clinicalFindings?.diagnosis && (
            <div>
              <h3 className="mb-1 font-bold uppercase text-zinc-700">Diagnosis</h3>
              <p className="font-semibold text-sky-900">{clinicalFindings.diagnosis}</p>
            </div>
          )}

          {diagnosticAdvice && diagnosticAdvice.length > 0 && (
            <div>
              <h3 className="mb-2 font-bold uppercase text-zinc-700">Recommended Tests</h3>
              <ul className="list-inside list-disc space-y-1 text-zinc-600">
                {diagnosticAdvice.map((test, idx) => (
                  <li key={idx}>{test}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Rx Prescriptions */}
        <div className="col-span-8 text-xs">
          <div className="mb-3 text-lg font-serif font-black text-sky-950">℞</div>
          <ol className="space-y-4">
            {rxItems.map((item, idx) => (
              <li key={idx} className="border-b pb-2">
                <div className="flex justify-between font-bold text-sm text-zinc-900">
                  <span>{idx + 1}. {item.medicineName}</span>
                  <span className="text-zinc-600 font-normal">{item.duration}</span>
                </div>
                <div className="mt-1 flex gap-4 text-zinc-600">
                  <span>Dose: <strong className="text-zinc-800">{item.dosage}</strong></span>
                  <span>({item.frequency})</span>
                </div>
                {item.instructions && (
                  <p className="mt-1 italic text-zinc-500">{item.instructions}</p>
                )}
              </li>
            ))}
          </ol>

          {specialInstructions && (
            <div className="mt-6 rounded border border-amber-200 bg-amber-50/60 p-3 text-xs">
              <strong className="text-amber-900">Doctor Advice: </strong>
              <span className="text-amber-800">{specialInstructions}</span>
            </div>
          )}

          {followUpDate && (
            <div className="mt-4 text-xs font-semibold text-zinc-700">
              Next Follow-up Consultation: <span className="text-sky-900 underline">{followUpDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Official Hospital Footer */}
      <HospitalPrintFooter />
    </div>
  );
}
