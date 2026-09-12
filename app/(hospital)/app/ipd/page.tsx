"use client";

import React, { useState } from "react";
import {
  Bed,
  UserCheck,
  FileCheck,
  Printer,
  Calendar,
  Stethoscope,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { MOCK_BEDS, MOCK_PATIENTS, MOCK_DOCTORS } from "@/lib/mock-data";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function IPDAdmissionsPage() {
  const [selectedAdmission, setSelectedAdmission] = useState({
    patient_name: "Abdul Karim",
    patient_id: "OH-000089",
    bed_number: "MW-01",
    ward_name: "Male General Ward",
    admitted_at: "2026-09-10",
    doctor: "Prof. Dr. M. A. Rahman",
    provisional_diagnosis: "Acute Bronchial Asthma with Exacerbation",
    status: "Admitted (Under Medical Treatment)",
  });

  const [showDischargeModal, setShowDischargeModal] = useState(false);

  const handlePrintDischarge = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Inpatient Care & Hospital Rounds
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            IPD Inpatient Admissions & Discharge Summaries
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bed allocation logs, nursing rounds, provisional diagnoses, and official computer-generated discharge certificates.
          </p>
        </div>

        <button
          onClick={() => setShowDischargeModal(true)}
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-2xs transition"
        >
          <FileCheck className="w-4 h-4 mr-1.5" />
          Prepare Discharge Certificate
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active IPD Patient List (5 cols) */}
        <div className="lg:col-span-5 space-y-4 no-print">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Currently Admitted Inpatients
            </h3>

            <div className="space-y-2">
              {MOCK_BEDS.filter((b) => b.status === "occupied").map((b) => (
                <div
                  key={b.id}
                  onClick={() =>
                    setSelectedAdmission({
                      patient_name: b.patient_name || "Patient",
                      patient_id: b.patient_code || "OH-000089",
                      bed_number: b.bed_number,
                      ward_name: b.ward_name,
                      admitted_at: b.admitted_at || "2026-09-10",
                      doctor: "Prof. Dr. M. A. Rahman",
                      provisional_diagnosis: "Acute Bronchial Asthma",
                      status: "Admitted",
                    })
                  }
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition flex justify-between items-center"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs text-slate-900">
                        {b.bed_number}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 uppercase">
                        Inpatient
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 mt-1">
                      {b.patient_name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {b.ward_name} • Admitted: {b.admitted_at}
                    </p>
                  </div>
                  <Bed className="w-5 h-5 text-sky-600" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Admission Card & Discharge Summary (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 no-print">
              <h3 className="text-base font-bold text-slate-900">
                Inpatient Admission Record
              </h3>
              <button
                onClick={handlePrintDischarge}
                className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
                Print Discharge Summary
              </button>
            </div>

            <div className="print-pad">
              <HospitalPrintHeader
                documentTitle="INPATIENT DISCHARGE SUMMARY & MEDICAL CERTIFICATE"
                documentNumber={`IPD-${selectedAdmission.patient_id}`}
                dateStr="12 Sep 2026"
              />

              <div className="grid grid-cols-2 gap-4 text-xs py-3 border-y border-slate-200 my-4">
                <div>
                  <span className="text-slate-500 block text-[10px]">Patient Name</span>
                  <strong className="text-slate-900">{selectedAdmission.patient_name}</strong>
                  <span className="block text-slate-600 font-mono text-[11px]">
                    Patient ID: {selectedAdmission.patient_id}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px]">Bed / Ward</span>
                  <strong className="text-slate-800">
                    {selectedAdmission.bed_number} ({selectedAdmission.ward_name})
                  </strong>
                  <span className="block text-slate-500 text-[11px]">
                    Admission Date: {selectedAdmission.admitted_at}
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="font-bold text-slate-900 uppercase tracking-wide block mb-1">
                    Final Clinical Diagnosis:
                  </span>
                  <p className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-slate-800 font-semibold">
                    {selectedAdmission.provisional_diagnosis}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-900 uppercase tracking-wide block mb-1">
                    Hospital Course & Treatment Given:
                  </span>
                  <p className="text-slate-700 leading-relaxed">
                    Patient was stabilized with IV hydrocortisone, nebulization with Salbutamol + Ipratropium, and broad-spectrum IV antibiotics. Oxygen saturation improved from 88% to 98% on room air. Vitals are currently stable.
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-900 uppercase tracking-wide block mb-1">
                    Discharge Advice & Follow-Up Instructions:
                  </span>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    <li>Tab. Montelukast 10mg — 0+0+1 at night for 1 month</li>
                    <li>Inhaler Budesonide + Formoterol (200mcg) — 2 puffs twice daily</li>
                    <li>Avoid dust, cold food, and smoke</li>
                    <li>Follow up in OPD after 7 days (or earlier if respiratory distress recurs)</li>
                  </ul>
                </div>
              </div>

              <HospitalPrintFooter />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
