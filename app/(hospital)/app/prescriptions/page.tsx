"use client";

import React, { useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Printer,
  Calendar,
  CheckCircle2,
  Stethoscope,
} from "lucide-react";
import { MOCK_PRESCRIPTION, MOCK_PATIENTS, MOCK_DOCTORS } from "@/lib/mock-data";
import { Prescription } from "@/types";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function PrescriptionsPage() {
  const [prescription, setPrescription] = useState<Prescription>(MOCK_PRESCRIPTION);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Clinical Documentation
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Digital Prescription Pad (Rx)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            E-prescriptions with structured diagnosis, 1+0+1 dosage intervals, dietary advice, and official letterhead printing.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
        >
          <Printer className="w-4 h-4 mr-1.5" />
          Print Prescription Pad
        </button>
      </div>

      {/* Official Prescription Pad Document */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs max-w-4xl mx-auto print-pad">
        <HospitalPrintHeader
          documentTitle="MEDICAL PRESCRIPTION"
          documentNumber={prescription.prescription_number}
          dateStr={prescription.date}
        />

        {/* Doctor & Patient Information Strip */}
        <div className="flex flex-col sm:flex-row justify-between pb-4 border-b border-slate-200 text-xs gap-4">
          <div>
            <h3 className="font-bold text-sm text-sky-900">{prescription.doctor_name}</h3>
            <p className="text-slate-600">{prescription.doctor_degrees}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-slate-700 font-semibold">
              Patient: <strong className="text-slate-900">{prescription.patient_name}</strong>
            </p>
            <p className="text-slate-500">
              {prescription.patient_age} Years • {prescription.patient_gender} • ID: OH-000101
            </p>
          </div>
        </div>

        {/* Patient Vitals Mini-Bar */}
        <div className="my-4 p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap justify-between text-xs font-mono text-slate-700">
          <span>BP: <strong>{prescription.vitals.bp}</strong></span>
          <span>Pulse: <strong>{prescription.vitals.pulse}</strong></span>
          <span>Temp: <strong>{prescription.vitals.temp}</strong></span>
          <span>Weight: <strong>{prescription.vitals.weight}</strong></span>
        </div>

        {/* Main Rx Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 my-6">
          {/* Left Column: Complaints & Diagnosis (4 cols) */}
          <div className="md:col-span-4 border-r border-slate-200 pr-4 space-y-6 text-xs">
            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2 text-[11px]">
                Chief Complaints:
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                {prescription.chief_complaints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2 text-[11px]">
                Clinical Diagnosis:
              </h4>
              <div className="space-y-1">
                {prescription.diagnosis.map((d, i) => (
                  <div key={i} className="p-1.5 bg-sky-50 text-sky-900 rounded font-semibold border border-sky-100">
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Rx Medicines & Dosages (8 cols) */}
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-center space-x-2 text-2xl font-black font-serif text-sky-900">
              <span>℞</span>
            </div>

            <div className="space-y-4">
              {prescription.medicines.map((med, idx) => (
                <div key={idx} className="pb-3 border-b border-slate-100">
                  <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-slate-900">
                      {idx + 1}. {med.name}
                    </div>
                    <span className="font-mono font-bold text-xs text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {med.dosage}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 flex space-x-3">
                    <span>{med.instruction}</span>
                    <span>•</span>
                    <span className="font-medium text-slate-800">Duration: {med.duration}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Advice & Next Visit */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-xs space-y-2">
              <p>
                <strong className="text-slate-900">General Advice:</strong> {prescription.advice}
              </p>
              {prescription.next_visit && (
                <p className="text-sky-900 font-semibold">
                  Follow-up Visit Date: {prescription.next_visit}
                </p>
              )}
            </div>
          </div>
        </div>

        <HospitalPrintFooter />
      </div>
    </div>
  );
}
