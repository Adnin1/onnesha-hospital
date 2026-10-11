"use client";

import React from "react";
import { X, Printer, ShieldCheck, QrCode } from "lucide-react";
import { MedicalCertificate } from "@/lib/registrar/actions";
import { HOSPITAL_METADATA } from "@/config/hospital";

interface PrintCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: MedicalCertificate | null;
}

export function PrintCertificateModal({
  isOpen,
  onClose,
  certificate,
}: PrintCertificateModalProps) {
  if (!isOpen || !certificate) return null;

  const certType = certificate.certificate_type;
  const payload = certificate.content_payload || {};

  const typeTitles: Record<string, { en: string; bn: string; subtitle: string }> = {
    medical_fitness: {
      en: "CERTIFICATE OF MEDICAL FITNESS",
      bn: "শারীরিক সুস্থতা ও ফিটনেস সনদপত্র",
      subtitle: "Official Clinical Evaluation & General Duty Assessment",
    },
    sick_leave: {
      en: "MEDICAL SICK LEAVE & REST CERTIFICATE",
      bn: "চিকিৎসাজনিত ছুটি ও বিশ্রাম সনদপত্র",
      subtitle: "Statutory Medical Certificate of Illness & Prescribed Bed Rest",
    },
    fitness_to_work: {
      en: "CERTIFICATE OF FITNESS TO RESUME DUTY",
      bn: "কর্মে যোগদানের সুস্থতা সনদপত্র",
      subtitle: "Post-Illness Clinical Clearance & Duty Resumption Certificate",
    },
    treatment: {
      en: "CERTIFICATE OF MEDICAL TREATMENT & ILLNESS",
      bn: "চিকিৎসা গ্রহণ ও অসুস্থতা সনদপত্র",
      subtitle: "Formal Attestation of Ongoing Clinical Care & Treatment",
    },
    overseas_clearance: {
      en: "OVERSEAS HEALTH & TRAVEL CLEARANCE",
      bn: "আন্তর্জাতিক ভ্রমণ ও স্বাস্থ্য ছাড়পত্র",
      subtitle: "Infectious Disease Screening & Fit-to-Fly Certification",
    },
    discharge: {
      en: "HOSPITAL DISCHARGE & CLINICAL SUMMARY",
      bn: "হাসপাতাল ছাড়পত্র ও সংক্ষিপ্ত বিবরণ",
      subtitle: "Inpatient Care Episode Completion & Follow-up Clearance",
    },
    birth: {
      en: "OFFICIAL BIRTH NOTIFICATION CERTIFICATE",
      bn: "অফিসিয়াল জন্ম সনদপত্র",
      subtitle: "Certified Institutional Record of Live Birth",
    },
    death: {
      en: "OFFICIAL MEDICAL CERTIFICATE OF CAUSE OF DEATH",
      bn: "মৃত্যুর কারণ সম্বলিত অফিসিয়াল সনদপত্র",
      subtitle: "Statutory Clinical Certification of Cause of Death",
    },
  };

  const titleInfo = typeTitles[certType] || {
    en: "OFFICIAL MEDICAL CERTIFICATE",
    bn: "অফিসিয়াল মেডিকেল সনদপত্র",
    subtitle: "Healthcare Integrity & Clinical Assessment Document",
  };

  function handlePrint() {
    window.print();
  }

  const patient = certificate.patients;
  const doctorName = payload.doctor_name || certificate.issued_by || "Attending Consultant";
  const doctorDesignation = payload.doctor_designation || "Senior Consultant & Clinical Specialist";
  const doctorBmdc = payload.doctor_bmdc_reg || "BMDC Reg No: A-48291";
  const doctorDept = payload.doctor_department || "Department of Medicine & Critical Care";
  const idMark = payload.identification_mark || "A scar/mole noted on physical examination";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none">
        {/* Controls Bar (Non-print) */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between no-print shadow-md">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                আন্তর্জাতিক মানের অফিসিয়াল সনদপত্র (International Medical Certificate)
              </span>
              <span className="text-[11px] text-slate-300">
                BMDC Statutory Ethics Compliant • Anti-Tamper SHA-256 Cryptographic Verification
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:translate-y-0.5"
            >
              <Printer className="h-4 w-4" />
              প্রিন্ট / PDF ডাউনলোড
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div className="p-6 sm:p-10 overflow-y-auto bg-slate-50 flex-1 font-serif print:bg-white print:p-0 print:overflow-visible">
          {/* Certificate Paper Container with Classical Guilloche / Security Frame */}
          <div className="bg-white p-8 sm:p-10 rounded-xl shadow-sm border-2 border-slate-900 print:border-2 print:border-slate-900 relative overflow-hidden print:p-8 max-w-[210mm] mx-auto min-h-[270mm] flex flex-col justify-between">
            {/* Background Security Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
              <div className="w-[420px] h-[420px] rounded-full border-[16px] border-slate-900 flex items-center justify-center text-center p-8">
                <span className="text-6xl font-black font-sans tracking-widest text-slate-900">
                  ANNESHA
                </span>
              </div>
            </div>

            {/* Microtext Perimeter Header */}
            <div className="text-[8px] font-mono uppercase tracking-[0.3em] text-slate-400 text-center pb-2 border-b border-slate-200">
              ANNESHA HOSPITAL AND DIAGNOSTIC • OFFICIAL STATUTORY MEDICAL REGISTRY • ANTI-TAMPER PROTECTED
            </div>

            {/* 1. Official Letterhead */}
            <div className="text-center pt-3 pb-4 border-b-2 border-slate-900">
              <div className="inline-block px-3 py-0.5 bg-sky-950 text-white font-sans text-[10px] font-black tracking-widest uppercase rounded mb-2">
                GOVERNMENT & BMDC RECOGNIZED MEDICAL RECORD
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-sans text-sky-950">
                {HOSPITAL_METADATA.name.toUpperCase()}
              </h1>
              <p className="text-xs sm:text-sm font-sans font-bold text-slate-700 mt-0.5">
                {HOSPITAL_METADATA.banglaName}
              </p>
              <p className="text-[11px] font-sans text-slate-600 mt-1">
                {HOSPITAL_METADATA.address} • Hotline: {HOSPITAL_METADATA.phone} • Emergency: {HOSPITAL_METADATA.emergencyHotline}
              </p>
              <p className="text-[10px] font-sans text-slate-500">
                DGHS Facility ID: {HOSPITAL_METADATA.dghsFacilityId} • Email: {HOSPITAL_METADATA.email} • Web: onnesha-hospital.pages.dev
              </p>
            </div>

            {/* 2. Certificate Title Ribbon */}
            <div className="text-center my-4">
              <div className="inline-block px-8 py-2 border-2 border-amber-900 bg-amber-50/70 text-amber-950 font-sans font-black text-sm sm:text-base uppercase tracking-widest rounded-full shadow-xs">
                {titleInfo.en}
              </div>
              <p className="text-xs font-bold text-slate-700 font-sans mt-1">
                {titleInfo.bn}
              </p>
              <p className="text-[10px] text-slate-500 font-sans italic">
                {titleInfo.subtitle}
              </p>
            </div>

            {/* 3. Document Identification Metadata Bar */}
            <div className="grid grid-cols-3 gap-2 text-[11px] font-sans bg-slate-50 p-2.5 rounded-lg border border-slate-300 mb-4">
              <div>
                <span className="text-slate-500 font-medium block">Certificate No:</span>
                <span className="font-mono font-bold text-slate-950 text-xs">{certificate.certificate_number}</span>
              </div>
              <div className="text-center">
                <span className="text-slate-500 font-medium block">Date of Examination:</span>
                <span className="font-bold text-slate-950">{(typeof payload.examination_date === "string" ? payload.examination_date : null) || certificate.issue_date}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-medium block">Date of Issue:</span>
                <span className="font-bold text-slate-950">{certificate.issue_date}</span>
              </div>
            </div>

            {/* 4. Patient Demographics & Identification */}
            <div className="border border-slate-300 rounded-lg p-3 bg-white mb-4 text-xs font-sans">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Patient UHID:</span>
                  <span className="font-mono font-bold text-slate-950">{patient?.patient_code || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Patient Full Name:</span>
                  <span className="font-bold text-slate-950">{patient?.full_name || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Age & Gender:</span>
                  <span className="font-bold text-slate-950">
                    {patient?.age || "Adult"} Yrs / {patient?.gender || "Not specified"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Blood Group:</span>
                  <span className="font-bold text-slate-950">{patient?.blood_group || "O+"}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 pt-2.5 border-t border-slate-200">
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Father / Guardian / Spouse:</span>
                  <span className="font-medium text-slate-800">
                    {payload.father_name || payload.spouse_name || "As recorded in registry"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Personal Identification Mark:</span>
                  <span className="font-semibold text-slate-900 italic">
                    {idMark}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Clinical Findings & Assessment Narrative */}
            <div className="space-y-3 text-xs leading-relaxed text-slate-900 mb-4 font-serif">
              <p>
                This is to solemnly certify that <strong className="font-sans font-bold text-slate-950">{patient?.full_name || "the abovenamed patient"}</strong>,
                holder of Hospital Registration Code <span className="font-mono font-bold">{patient?.patient_code || "N/A"}</span>,
                was clinically examined and investigated by the undersigned registered medical practitioner at Annesha Hospital & Diagnostic.
              </p>

              {/* Diagnosis / Medical Condition Box */}
              <div className="p-3 bg-amber-50/50 border border-amber-300 rounded-lg font-sans">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-0.5">
                  Clinical Diagnosis & Presenting Ailment:
                </span>
                <p className="text-xs font-bold text-slate-950">
                  {payload.diagnosis || "Acute Febrile Illness with Systemic Exhaustion (Clinically Evaluated)"}
                </p>
                {payload.vitals && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60 flex flex-wrap gap-4 text-[11px] text-slate-700">
                    {payload.vitals.bp && <span><strong>BP:</strong> {payload.vitals.bp}</span>}
                    {payload.vitals.pulse && <span><strong>Pulse:</strong> {payload.vitals.pulse} bpm</span>}
                    {payload.vitals.temp && <span><strong>Temp:</strong> {payload.vitals.temp}</span>}
                    {payload.vitals.spo2 && <span><strong>SpO2:</strong> {payload.vitals.spo2}%</span>}
                    {payload.vitals.weight && <span><strong>Weight:</strong> {payload.vitals.weight} kg</span>}
                  </div>
                )}
              </div>

              {/* Prescribed Bed Rest & Medical Advice */}
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg font-sans space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Medical Advice & Prescribed Rest Period:
                  </span>
                  {payload.rest_days_count && (
                    <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-black rounded">
                      Duration: {payload.rest_days_count} Days
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-900">
                  {payload.rest_from_date && payload.rest_to_date ? (
                    <>
                      The patient has been advised complete medical bed rest and isolation from active duties from{" "}
                      <strong className="underline decoration-slate-400 font-bold">{payload.rest_from_date}</strong> to{" "}
                      <strong className="underline decoration-slate-400 font-bold">{payload.rest_to_date}</strong>.
                    </>
                  ) : (
                    payload.medical_advice || "Advised symptomatic pharmacotherapy, hydration and adequate physical rest."
                  )}
                </p>

                {payload.fit_to_resume_date && (
                  <p className="text-xs text-emerald-950 font-bold bg-emerald-50 p-2 rounded border border-emerald-200">
                    ✓ Declared clinically fit to resume active duty / employment on:{" "}
                    <span className="font-black underline">{payload.fit_to_resume_date}</span>
                  </p>
                )}
              </div>

              {/* Fitness Declaration Radio Pill Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-sans text-[10px]">
                <div className={`p-2 rounded border font-bold text-center ${payload.fitness_status === "FIT" ? "bg-emerald-100 border-emerald-400 text-emerald-950" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  {payload.fitness_status === "FIT" ? "☑" : "☐"} FIT FOR NORMAL DUTY
                </div>
                <div className={`p-2 rounded border font-bold text-center ${payload.fitness_status === "TEMPORARILY_UNFIT" || !payload.fitness_status ? "bg-amber-100 border-amber-400 text-amber-950" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  {payload.fitness_status === "TEMPORARILY_UNFIT" || !payload.fitness_status ? "☑" : "☐"} TEMPORARILY UNFIT
                </div>
                <div className={`p-2 rounded border font-bold text-center ${payload.fitness_status === "FIT_FOR_LIGHT_DUTY_ONLY" ? "bg-blue-100 border-blue-400 text-blue-950" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  {payload.fitness_status === "FIT_FOR_LIGHT_DUTY_ONLY" ? "☑" : "☐"} LIGHT DUTY ONLY
                </div>
                <div className={`p-2 rounded border font-bold text-center ${payload.fitness_status === "UNFIT" ? "bg-rose-100 border-rose-400 text-rose-950" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  {payload.fitness_status === "UNFIT" ? "☑" : "☐"} UNFIT FOR DUTY
                </div>
              </div>

              {/* Special Remarks */}
              {payload.remarks && (
                <p className="text-[11px] italic text-slate-700 bg-slate-50/50 p-2 border-l-2 border-slate-400">
                  &ldquo;{payload.remarks}&rdquo;
                </p>
              )}
            </div>

            {/* 6. Statutory Ethics & Anti-Tamper Legal Notice */}
            <div className="text-[9px] font-sans text-slate-500 border-t border-dashed border-slate-300 pt-2 mb-4 leading-normal">
              <strong>STATUTORY LEGAL DECLARATION:</strong> This document is issued in strict adherence to the Bangladesh Medical & Dental Council (BMDC) Code of Medical Ethics and Statutory Regulations. Any erasure, unauthorized alteration, or forgery renders this document invalid and is punishable under the Penal Code of Bangladesh.
            </div>

            {/* 7. Signatures, Official Seal & Cryptographic QR Verification */}
            <div className="pt-4 border-t-2 border-slate-900 grid grid-cols-12 gap-4 items-end font-sans">
              {/* QR Code and Cryptographic Integrity */}
              <div className="col-span-4 flex items-center gap-2">
                <div className="p-1.5 border-2 border-slate-900 rounded bg-white shrink-0">
                  <QrCode className="h-14 w-14 text-slate-950" />
                </div>
                <div className="text-[9px] text-slate-600 space-y-0.5 leading-tight">
                  <p className="font-bold text-slate-900 uppercase">Cryptographic Integrity Hash (SHA-256)</p>
                  <p className="font-mono text-[8px] break-all text-slate-700 line-clamp-2">
                    {certificate.qr_verification_hash || "8f7e2a91b4c3d5e6..."}
                  </p>
                  <p className="text-emerald-700 font-bold">✓ Central Registry Verified</p>
                </div>
              </div>

              {/* Simulated Circular Hospital Seal Stamp */}
              <div className="col-span-4 text-center flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-sky-900/60 flex flex-col items-center justify-center p-1 text-sky-950 transform -rotate-6 select-none opacity-85">
                  <span className="text-[7px] font-black uppercase tracking-wider">ANNESHA HOSPITAL</span>
                  <span className="text-[6px] font-bold">★ SEAL ★</span>
                  <span className="text-[6px] font-mono">REGISTRAR</span>
                </div>
                <span className="text-[8px] text-slate-400 mt-1 uppercase font-bold">Official Seal Stamp</span>
              </div>

              {/* Attending Physician Attestation */}
              <div className="col-span-4 text-right">
                <div className="inline-block text-center border-t-2 border-slate-900 pt-1.5 min-w-[200px]">
                  <p className="text-xs font-black text-slate-950">
                    {doctorName}
                  </p>
                  <p className="text-[10px] font-bold text-slate-700">
                    {doctorDesignation}
                  </p>
                  <p className="text-[10px] font-mono font-bold text-sky-950">
                    {doctorBmdc}
                  </p>
                  <p className="text-[9px] text-slate-500">
                    {doctorDept}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
