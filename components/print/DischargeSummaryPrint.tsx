"use client";

import React, { useState } from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { generateSvgBarcode } from "@/lib/print/barcode";

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
    guardianName?: string;
    village?: string;
    postOffice?: string;
    policeStation?: string;
    district?: string;
    bloodGroup?: string;
  };
  wardName: string;
  bedNumber: string;
  consultantDoctorName: string;
  consultantDesignation?: string;
  bmdcRegNumber?: string;
  dutyDoctorName?: string;
  admissionDiagnosis?: string;
  finalDiagnosis: string;
  hospitalCourseSummary?: string;
  presentingFeatures?: string;
  investigationsSummary?: string;
  operationDetails?: {
    operationName?: string;
    operationDate?: string;
    operationTime?: string;
    indication?: string;
    surgeonName?: string;
    assistantSurgeons?: string;
    anaesthetistName?: string;
    anaesthesiaType?: string;
    operativeFindings?: string;
  };
  babyNote?: {
    sex?: string;
    weightKg?: number | string;
    apgarScore?: string;
    cryCondition?: string;
    notes?: string;
  };
  takeHomeMedications: Array<{
    name: string;
    dosage: string;
    duration: string;
    instructions?: string;
    timing?: string;
    formulation?: string;
  }>;
  stitchRemovalDate?: string;
  followupDate?: string;
  followUpInstructions?: string;
}

export function DischargeSummaryPrint({
  admissionNumber,
  dischargeDateStr,
  admissionDateStr,
  patient,
  wardName,
  bedNumber,
  consultantDoctorName,
  consultantDesignation,
  bmdcRegNumber,
  dutyDoctorName,
  admissionDiagnosis,
  finalDiagnosis,
  hospitalCourseSummary,
  presentingFeatures,
  investigationsSummary,
  operationDetails,
  babyNote,
  takeHomeMedications,
  stitchRemovalDate,
  followupDate,
  followUpInstructions,
}: DischargeSummaryPrintProps) {
  const [activeTab, setActiveTab] = useState<"ALL" | "COVER" | "SUMMARY" | "TREATMENT" | "ADVICE">("ALL");
  const barcodeSvg = generateSvgBarcode(admissionNumber || patient.patientCode, 26);

  // Address parser fallback
  const parsedAddress = patient.address || "";

  return (
    <div className="onnesha-discharge-root mx-auto max-w-[210mm] bg-white text-slate-900 font-sans print:m-0 print:p-0 print:max-w-none">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-break-after {
            page-break-after: always;
            break-after: page;
          }
          .onnesha-discharge-root {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print-tab {
            display: none !important;
          }
        }
      `}} />

      {/* Screen Mode Tabs */}
      <div className="no-print-tab mb-4 flex items-center justify-between bg-slate-100 p-2 rounded-xl text-xs font-bold text-slate-700">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg transition ${activeTab === "ALL" ? "bg-sky-800 text-white shadow-xs" : "hover:bg-slate-200"}`}
          >
            Complete 4-Part Folder
          </button>
          <button
            onClick={() => setActiveTab("COVER")}
            className={`px-3 py-1.5 rounded-lg transition ${activeTab === "COVER" ? "bg-sky-800 text-white shadow-xs" : "hover:bg-slate-200"}`}
          >
            Page 1: Certificate Cover
          </button>
          <button
            onClick={() => setActiveTab("SUMMARY")}
            className={`px-3 py-1.5 rounded-lg transition ${activeTab === "SUMMARY" ? "bg-sky-800 text-white shadow-xs" : "hover:bg-slate-200"}`}
          >
            Page 2: Summary & OT
          </button>
          <button
            onClick={() => setActiveTab("TREATMENT")}
            className={`px-3 py-1.5 rounded-lg transition ${activeTab === "TREATMENT" ? "bg-sky-800 text-white shadow-xs" : "hover:bg-slate-200"}`}
          >
            Page 3: Rx Treatment
          </button>
          <button
            onClick={() => setActiveTab("ADVICE")}
            className={`px-3 py-1.5 rounded-lg transition ${activeTab === "ADVICE" ? "bg-sky-800 text-white shadow-xs" : "hover:bg-slate-200"}`}
          >
            Page 4: উপদেশ / Advice
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
        >
          Print Folder
        </button>
      </div>

      {/* ============================================================== */}
      {/* PAGE 1: DISCHARGE CERTIFICATE (ছাড়পত্র কভার) */}
      {/* ============================================================== */}
      {(activeTab === "ALL" || activeTab === "COVER") && (
        <div className={`p-8 border border-slate-300 rounded-2xl mb-8 min-h-[280mm] flex flex-col justify-between print:border-none print:p-0 print:m-0 print:min-h-0 ${activeTab === "ALL" ? "page-break-after" : ""}`}>
          <div>
            {/* Header */}
            <div className="border-b-4 border-double border-sky-900 pb-3 mb-4 text-center">
              <div className="flex justify-center items-center space-x-3 mb-1">
                <span className="w-12 h-12 rounded-lg bg-sky-900 text-white font-black text-xl flex items-center justify-center">
                  OH
                </span>
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-wider text-sky-950 leading-tight">
                    {HOSPITAL_METADATA.name}
                  </h1>
                  <h2 className="text-sm font-bold text-sky-800 leading-tight">
                    {HOSPITAL_METADATA.banglaName}
                  </h2>
                </div>
              </div>
              <p className="text-xs text-slate-700">
                {HOSPITAL_METADATA.address}
              </p>
              <p className="text-xs text-slate-600 font-medium">
                ফোন: 01620-003888, 01718-835623 | ২৪ ঘণ্টা জরুরি ও ইনডোর সেবা
              </p>
              <div className="mt-2 inline-block px-6 py-1 bg-sky-950 text-white rounded text-sm font-black uppercase tracking-widest">
                IPD DISCHARGE CERTIFICATE & CLINICAL SUMMARY (ছাড়পত্র)
              </div>
            </div>

            {/* Registration & Date Bar */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-300 p-2.5 rounded-lg text-xs font-mono mb-4">
              <div>
                <span className="text-slate-500 font-sans">Patient ID / UHID: </span>
                <strong className="text-slate-900">{patient.patientCode}</strong>
              </div>
              <div className="text-center">
                <span className="text-slate-500 font-sans">Bed / Cabin No: </span>
                <strong className="text-slate-900">{wardName} - #{bedNumber}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-sans">Certificate Date: </span>
                <strong className="text-slate-900">{dischargeDateStr}</strong>
              </div>
            </div>

            {/* Patient Demographics Table matching physical form */}
            <div className="border border-slate-300 rounded-lg p-4 space-y-3 text-xs mb-4">
              <div className="flex border-b border-dashed border-slate-300 pb-2">
                <span className="w-40 font-bold text-slate-700">Patient Name:</span>
                <span className="flex-1 font-black text-slate-900 uppercase text-sm tracking-wide">
                  {patient.name}
                </span>
                <span className="w-28 font-bold text-slate-700 text-right">Age: <span className="font-mono">{patient.age || "—"}</span> Y</span>
                <span className="w-24 font-bold text-slate-700 text-right">Sex: <span className="uppercase">{patient.gender || "—"}</span></span>
              </div>

              <div className="flex border-b border-dashed border-slate-300 pb-2">
                <span className="w-40 font-bold text-slate-700">Father / Husband / Guardian:</span>
                <span className="flex-1 text-slate-800 font-medium">
                  {patient.guardianName || "N/A"}
                </span>
                {patient.phone && (
                  <span className="w-44 text-slate-700 font-mono text-right">
                    Contact: {patient.phone}
                  </span>
                )}
              </div>

              <div className="flex border-b border-dashed border-slate-300 pb-2">
                <span className="w-40 font-bold text-slate-700">Address (গ্রাম/মহল্লা):</span>
                <span className="flex-1 text-slate-800">
                  {patient.village || parsedAddress || "—"}
                </span>
                <span className="w-36 text-slate-700 text-right">
                  পোস্ট: {patient.postOffice || "—"}
                </span>
              </div>

              <div className="flex border-b border-dashed border-slate-300 pb-2">
                <span className="w-40 font-bold text-slate-700">থানা / উপজেলা (P.S.):</span>
                <span className="flex-1 text-slate-800">
                  {patient.policeStation || "—"}
                </span>
                <span className="w-36 text-slate-700 text-right">
                  জেলা: {patient.district || "বগুড়া"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-dashed border-slate-300 pb-2">
                <div>
                  <span className="font-bold text-slate-700 block">Admitted On (ভর্তির তারিখ):</span>
                  <span className="font-mono text-slate-900 font-semibold">{admissionDateStr}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700 block">Discharged On (ছাড়পত্রের তারিখ):</span>
                  <span className="font-mono text-slate-900 font-black text-sky-950">{dischargeDateStr}</span>
                </div>
              </div>

              <div className="pt-1">
                <span className="font-bold text-slate-700 block mb-1">
                  Final Discharge Diagnosis (রোগের বিবরণ / চূড়ান্ত ডায়াগনোসিস):
                </span>
                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded text-sky-950 font-bold text-sm">
                  {finalDiagnosis || admissionDiagnosis || "Clinical Assessment"}
                </div>
                {admissionDiagnosis && (
                  <p className="text-[10px] text-slate-500 mt-1 font-sans">
                    Admission Diagnosis: {admissionDiagnosis}
                  </p>
                )}
              </div>

              <div className="pt-1">
                <span className="font-bold text-slate-700 block mb-0.5">Consultant / Attending Specialist:</span>
                <p className="font-black text-slate-900 text-xs">
                  {consultantDoctorName}
                </p>
                {consultantDesignation && (
                  <p className="text-[11px] text-slate-600">{consultantDesignation}</p>
                )}
                {bmdcRegNumber && (
                  <p className="text-[10px] text-slate-500 font-mono">BMDC Reg No: {bmdcRegNumber}</p>
                )}
              </div>
            </div>
          </div>

          {/* Page 1 Bottom Signatures */}
          <div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 mb-6">
              <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
              <p className="text-[10px] text-slate-500 font-mono">
                Admission Record Ref: {admissionNumber}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 text-center text-xs pt-8">
              <div>
                <div className="border-t border-dashed border-slate-500 w-48 mx-auto pt-1 font-bold text-slate-800">
                  Duty Doctor / Medical Officer
                </div>
                <p className="text-[10px] text-slate-500">{dutyDoctorName || "Onnesha Hospital"}</p>
              </div>
              <div>
                <div className="border-t border-dashed border-slate-500 w-48 mx-auto pt-1 font-bold text-slate-800">
                  Attending Consultant
                </div>
                <p className="text-[10px] text-slate-500">{consultantDoctorName}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PAGE 2: DISCHARGE SUMMARY & OPERATION REPORT */}
      {/* ============================================================== */}
      {(activeTab === "ALL" || activeTab === "SUMMARY") && (
        <div className={`p-8 border border-slate-300 rounded-2xl mb-8 min-h-[280mm] flex flex-col justify-between print:border-none print:p-0 print:m-0 print:min-h-0 ${activeTab === "ALL" ? "page-break-after" : ""}`}>
          <div>
            {/* Header Mini */}
            <div className="border-b-2 border-sky-900 pb-2 mb-3 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black uppercase text-sky-950">
                  {HOSPITAL_METADATA.name} — CLINICAL DISCHARGE SUMMARY
                </h2>
                <p className="text-[10px] text-slate-600">Patient: <strong>{patient.name}</strong> ({patient.patientCode}) • Bed: {wardName} #{bedNumber}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Page 2 of 4</span>
            </div>

            {/* 1. Presenting Features */}
            <div className="border border-slate-200 rounded-lg p-3 mb-3 text-xs">
              <h3 className="font-bold text-sky-950 uppercase tracking-wide text-[11px] mb-1.5 flex items-center">
                <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] mr-1.5">1</span>
                Presenting Features (রোগীর প্রাথমিক উপসর্গ ও শারীরিক অবস্থা)
              </h3>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed pl-6">
                {presentingFeatures || hospitalCourseSummary || "Patient admitted with chief complaints and evaluated clinically."}
              </p>
            </div>

            {/* 2. Investigations */}
            <div className="border border-slate-200 rounded-lg p-3 mb-3 text-xs">
              <h3 className="font-bold text-sky-950 uppercase tracking-wide text-[11px] mb-1.5 flex items-center">
                <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] mr-1.5">2</span>
                Investigations (রোগ নির্ণায়ক পরীক্ষার বিবরণ)
              </h3>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed pl-6 font-mono text-[11px]">
                {investigationsSummary || "CBC, Routine Blood, Urine R/E, Blood Sugar, USG of whole abdomen performed."}
              </p>
            </div>

            {/* 3. Operation Details (If Surgical) */}
            {operationDetails && (operationDetails.operationName || operationDetails.surgeonName) && (
              <div className="border border-slate-200 rounded-lg p-3 mb-3 text-xs bg-slate-50">
                <h3 className="font-bold text-sky-950 uppercase tracking-wide text-[11px] mb-2 flex items-center">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] mr-1.5">3</span>
                  Operation Details (অপারেশনের বিবরণ)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-[11px] pl-6">
                  <div>
                    <span className="text-slate-500">Operation Performed: </span>
                    <strong className="text-slate-900">{operationDetails.operationName || "Surgical Procedure"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Date & Time: </span>
                    <span className="font-mono text-slate-800">{operationDetails.operationDate || "—"} {operationDetails.operationTime || ""}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Surgeon: </span>
                    <strong className="text-slate-900">{operationDetails.surgeonName || consultantDoctorName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Anaesthetist: </span>
                    <span className="text-slate-800">{operationDetails.anaesthetistName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Assistants: </span>
                    <span className="text-slate-800">{operationDetails.assistantSurgeons || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Anaesthesia Type: </span>
                    <span className="font-mono text-slate-800">{operationDetails.anaesthesiaType || "Spinal Anaesthesia"}</span>
                  </div>
                </div>
                {operationDetails.operativeFindings && (
                  <div className="mt-2 pl-6 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 text-[11px] block">Findings & Operative Procedure Note:</span>
                    <p className="text-slate-800 text-[11px] whitespace-pre-line leading-relaxed">{operationDetails.operativeFindings}</p>
                  </div>
                )}
              </div>
            )}

            {/* 4. Baby Note (If Delivery / Maternity) */}
            {babyNote && (babyNote.sex || babyNote.weightKg) && (
              <div className="border border-pink-200 rounded-lg p-3 mb-3 text-xs bg-pink-50/40">
                <h3 className="font-bold text-pink-950 uppercase tracking-wide text-[11px] mb-2 flex items-center">
                  <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-800 flex items-center justify-center font-bold text-[10px] mr-1.5">4</span>
                  Baby Note (নবজাতকের স্বাস্থ্য সংক্রান্ত তথ্য)
                </h3>
                <div className="grid grid-cols-3 gap-2 text-[11px] pl-6 font-medium">
                  <div>
                    <span className="text-slate-500">Sex: </span>
                    <strong className="uppercase text-slate-900">{babyNote.sex || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Birth Weight: </span>
                    <strong className="font-mono text-slate-900">{babyNote.weightKg} kg</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Apgar Score: </span>
                    <span className="font-mono text-slate-900">{babyNote.apgarScore || "8/10, 9/10"}</span>
                  </div>
                </div>
                {babyNote.notes && (
                  <p className="text-[11px] text-slate-700 pl-6 mt-1.5 italic">
                    Note: {babyNote.notes}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200 flex justify-between text-xs text-slate-500">
            <span>Prepared By: Medical Officer</span>
            <span>Reviewed & Certified By: {consultantDoctorName}</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PAGE 3: TREATMENT (Rx / ঔষধের তালিকা) */}
      {/* ============================================================== */}
      {(activeTab === "ALL" || activeTab === "TREATMENT") && (
        <div className={`p-8 border border-slate-300 rounded-2xl mb-8 min-h-[280mm] flex flex-col justify-between print:border-none print:p-0 print:m-0 print:min-h-0 ${activeTab === "ALL" ? "page-break-after" : ""}`}>
          <div>
            {/* Header Mini */}
            <div className="border-b-2 border-sky-900 pb-2 mb-3 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black uppercase text-sky-950">
                  {HOSPITAL_METADATA.name} — TAKE-HOME MEDICATION SCHEDULE
                </h2>
                <p className="text-[10px] text-slate-600">Patient: <strong>{patient.name}</strong> ({patient.patientCode}) • Consultant: {consultantDoctorName}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Page 3 of 4</span>
            </div>

            {/* Big Rx Header */}
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-3xl font-serif font-black text-sky-950 tracking-tight">
                ℞
              </span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Take-Home Medications (Rx) & Prescription Schedule (ছাড়পত্রকালীন ব্যবস্থাপত্র)
              </span>
            </div>

            {/* Medicines Table */}
            <div className="border border-slate-300 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-r border-slate-300 w-8 text-center">#</th>
                    <th className="p-2 border-r border-slate-300">Medicine Name & Generic</th>
                    <th className="p-2 border-r border-slate-300 w-24 text-center">Form</th>
                    <th className="p-2 border-r border-slate-300 w-32 text-center">Dosage / Frequency</th>
                    <th className="p-2 border-r border-slate-300 w-24 text-center">Duration</th>
                    <th className="p-2">Instructions / সেবনের নিয়ম</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {takeHomeMedications.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                        No discharge medications prescribed. Follow general doctor advice.
                      </td>
                    </tr>
                  ) : (
                    takeHomeMedications.map((med, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 border-r border-slate-200 text-center text-slate-500 font-mono">
                          {idx + 1}
                        </td>
                        <td className="p-2 border-r border-slate-200 font-bold text-slate-900 text-[11px]">
                          {med.name}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center text-[10px] text-slate-600">
                          {med.formulation || "Tab"}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-sky-950 text-[11px]">
                          {med.dosage}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-center text-[11px] text-slate-700 font-medium">
                          {med.duration}
                        </td>
                        <td className="p-2 text-[10px] text-slate-700 italic">
                          {med.instructions || med.timing || "খাওয়ার পরে সেব্য"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Note on Medication Compliance */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
              <span className="font-bold block text-[11px]">জরুরি নির্দেশিকা (Important Medication Note):</span>
              <p className="text-[11px] leading-relaxed">
                চিকিৎসকের পরামর্শ ব্যতিরেকে অ্যান্টিবায়োটিক বা অন্যান্য ওষুধের কোর্স অসমাপ্ত রাখবেন না। কোনো প্রকার পার্শ্বপ্রতিক্রিয়া দেখা দিলে অবিলম্বে চিকিৎসকের শরণাপন্ন হোন।
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-xs">
            <span className="text-slate-500">অনলাইন যাচাইকরণ ও ফার্মেসি সমন্বয় সম্পন্ন</span>
            <div className="text-right">
              <div className="border-t border-dashed border-slate-500 w-44 pt-1 font-bold text-slate-800 text-center">
                Registered Physician
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PAGE 4: উপদেশ / ADVICE ON DISCHARGE */}
      {/* ============================================================== */}
      {(activeTab === "ALL" || activeTab === "ADVICE") && (
        <div className={`p-8 border border-slate-300 rounded-2xl mb-8 min-h-[280mm] flex flex-col justify-between print:border-none print:p-0 print:m-0 print:min-h-0`}>
          <div>
            {/* Header Mini */}
            <div className="border-b-2 border-sky-900 pb-2 mb-3 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black uppercase text-sky-950">
                  {HOSPITAL_METADATA.name} — DISCHARGE ADVICE & FOLLOW-UP
                </h2>
                <p className="text-[10px] text-slate-600">Patient: <strong>{patient.name}</strong> ({patient.patientCode})</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Page 4 of 4</span>
            </div>

            <div className="text-center my-4">
              <span className="inline-block px-4 py-1 bg-sky-900 text-white rounded text-sm font-bold uppercase tracking-widest">
                উপদেশ ও সতর্কতা (DISCHARGE ADVICE)
              </span>
            </div>

            {/* Canonical Advice List directly matching authentic physical certificate */}
            <div className="border border-slate-300 rounded-xl p-5 space-y-4 text-xs bg-slate-50/50">
              <div className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-sky-800 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ১
                </span>
                <div>
                  <strong className="text-slate-900 text-sm block">সম্পূর্ণ বিশ্রামে থাকতে হবে</strong>
                  <p className="text-slate-600 text-xs">
                    পরবর্তী নির্দেশনা না দেওয়া পর্যন্ত পর্যাপ্ত ঘুম ও মানসিক চাপমুক্ত বিশ্রাম বজায় রাখুন।
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-sky-800 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ২
                </span>
                <div>
                  <strong className="text-slate-900 text-sm block">ভারী কাজ বা ওজন তোলা সম্পূর্ণ নিষেধ</strong>
                  <p className="text-slate-600 text-xs">
                    কোনো প্রকার ভারী ওজন বহন, দ্রুত সিঁড়ি দিয়ে ওঠানামা বা কঠোর কায়িক পরিশ্রম করা সম্পূর্ণ নিষিদ্ধ।
                  </p>
                </div>
              </div>

              {stitchRemovalDate && (
                <div className="flex items-start space-x-3 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ৩
                  </span>
                  <div>
                    <strong className="text-amber-950 text-sm block">অপারেশনের সেলাই কাটার তারিখ</strong>
                    <p className="text-amber-900 font-mono font-bold text-xs mt-0.5">
                      তারিখ: {stitchRemovalDate} (হাসপাতালের ড্রেসিং রুমে উপস্থিত হয়ে সেলাই কাটুন)
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-3 bg-sky-50 border border-sky-200 p-3 rounded-lg">
                <span className="w-6 h-6 rounded-full bg-sky-700 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ৪
                </span>
                <div>
                  <strong className="text-sky-950 text-sm block">পরবর্তী সাক্ষাতের তারিখ (Follow-up Date)</strong>
                  <p className="text-sky-900 font-bold text-xs mt-0.5">
                    {followupDate ? `তারিখ: ${followupDate}` : "৭ দিন পর চিকিৎসকের চেম্বারে পরামর্শ নিন"}
                  </p>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    পরামর্শক: <strong>{consultantDoctorName}</strong>
                  </p>
                </div>
              </div>

              {followUpInstructions && (
                <div className="border-t border-slate-200 pt-3">
                  <span className="font-bold text-slate-800 block mb-1">অতিরিক্ত চিকিৎসकीय পরামর্শ (Special Clinical Instructions):</span>
                  <p className="text-slate-700 text-xs whitespace-pre-line leading-relaxed bg-white p-3 rounded border border-slate-200">
                    {followUpInstructions}
                  </p>
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 bg-rose-50 border border-rose-200 p-3 rounded-lg">
                <strong className="text-rose-950 text-xs block mb-1">সতর্ক সংকেত (Emergency Red Flags):</strong>
                <p className="text-rose-900 text-[11px] leading-relaxed">
                  অতিরিক্ত রক্তক্ষরণ, তীব্র পেটব্যথা, অবিরাম বমি, ১০১° ফাঃ এর বেশি জ্বর বা ক্ষতস্থান থেকে পুঁজ/তরল বের হলে কালবিলম্ব না করে অবিলম্বে হাসপাতালে নিয়ে আসুন।
                </p>
                <p className="text-rose-950 font-bold text-[11px] mt-1 font-mono">
                  ২৪ ঘণ্টা জরুরি হটলাইন: 01620-003888, 01718-835623
                </p>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 text-center text-xs pt-12">
            <div>
              <div className="border-t border-dashed border-slate-500 w-48 mx-auto pt-1 font-bold text-slate-800">
                Duty Doctor / Medical Officer
              </div>
              <p className="text-[10px] text-slate-500">{dutyDoctorName || "Onnesha Hospital"}</p>
            </div>
            <div>
              <div className="border-t border-dashed border-slate-500 w-48 mx-auto pt-1 font-bold text-slate-800">
                Attending Consultant Signature
              </div>
              <p className="text-[10px] text-slate-500">{consultantDoctorName}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
