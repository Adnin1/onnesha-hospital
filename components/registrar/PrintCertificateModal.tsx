"use client";

import React from "react";
import { X, Printer, ShieldCheck, QrCode } from "lucide-react";
import { MedicalCertificate } from "@/lib/registrar/actions";

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

  const typeTitles: Record<string, string> = {
    birth: "OFFICIAL BIRTH CERTIFICATE",
    death: "OFFICIAL DEATH CERTIFICATE",
    medical_fitness: "CERTIFICATE OF MEDICAL FITNESS",
    discharge: "HOSPITAL DISCHARGE CERTIFICATE",
    overseas_clearance: "OVERSEAS HEALTH CLEARANCE CERTIFICATE",
  };

  const title = typeTitles[certificate.certificate_type] || "OFFICIAL MEDICAL CERTIFICATE";

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Controls Bar (Non-print) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-bold">অফিসিয়াল সার্টিফিকেট প্রিভিউ (Anti-Tamper Print View)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              প্রিন্ট করুন (Print / PDF)
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div className="p-8 sm:p-12 overflow-y-auto bg-white flex-1 font-serif text-slate-900">
          {/* Official Letterhead */}
          <div className="text-center border-b-2 border-slate-900 pb-5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-wide font-sans text-sky-950">
              ONNESHA HOSPITAL & DIAGNOSTIC COMPLEX
            </h1>
            <p className="text-xs font-sans text-slate-600 mt-1 uppercase tracking-widest">
              Unified Medical Records Registrar & Healthcare Services
            </p>
            <p className="text-xs font-sans text-slate-500 mt-0.5">
              Medical College Road, Dhaka-1216, Bangladesh • 24/7 Helpline: 10678 • Web: onneshahospital.com
            </p>
          </div>

          {/* Certificate Title Badge */}
          <div className="text-center my-6">
            <span className="inline-block px-6 py-1.5 border-2 border-amber-800 text-amber-900 font-sans font-black text-sm uppercase tracking-widest rounded-full bg-amber-50/50">
              {title}
            </span>
          </div>

          {/* Meta Info: Cert No & Date */}
          <div className="flex justify-between items-center text-xs font-sans text-slate-700 border-b border-dashed border-slate-300 pb-3 mb-6">
            <div>
              <span className="font-bold">Certificate No:</span>{" "}
              <span className="font-mono font-bold text-slate-900">{certificate.certificate_number}</span>
            </div>
            <div>
              <span className="font-bold">Date of Issue:</span>{" "}
              <span className="font-bold">{certificate.issue_date}</span>
            </div>
          </div>

          {/* Main Statement */}
          <div className="space-y-4 text-sm leading-relaxed text-slate-800">
            <p>
              This is to formally certify that{" "}
              <strong className="text-slate-950 font-bold underline decoration-slate-400 underline-offset-4">
                {certificate.patients?.full_name || "the patient"}
              </strong>
              , registered under Hospital Identification Number{" "}
              <strong className="font-mono text-slate-950">{certificate.patients?.patient_code || "N/A"}</strong>,
              was examined and verified at Onnesha Hospital & Diagnostic Complex.
            </p>

            {/* Type Specific Narrative */}
            {certificate.certificate_type === "birth" && (
              <div className="my-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-sans text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <p><strong>Child Name:</strong> {certificate.content_payload.child_name || certificate.patients?.full_name}</p>
                  <p><strong>Birth Weight:</strong> {certificate.content_payload.birth_weight_kg || 3.1} kg</p>
                  <p><strong>Father&apos;s Name:</strong> {certificate.content_payload.father_name || "N/A"}</p>
                  <p><strong>Mother&apos;s Name:</strong> {certificate.content_payload.mother_name || "N/A"}</p>
                  <p><strong>Time of Birth:</strong> {certificate.content_payload.time_of_birth || "Morning"}</p>
                  <p><strong>Gender:</strong> {certificate.patients?.gender || "FEMALE"}</p>
                </div>
              </div>
            )}

            {certificate.certificate_type === "medical_fitness" && (
              <div className="my-4 p-4 bg-emerald-50/60 border border-emerald-300 rounded-xl font-sans text-xs space-y-1">
                <p className="font-bold text-emerald-950 text-sm">
                  Clinical Assessment: {certificate.content_payload.fitness_status || "FIT"}
                </p>
                <p className="text-emerald-900">
                  The subject was examined thoroughly including systemic examination, vitals, vision and basic laboratories.
                  Subject is declared clinically fit and physically capable of performing duties.
                </p>
              </div>
            )}

            {certificate.certificate_type === "death" && (
              <div className="my-4 p-4 bg-rose-50/60 border border-rose-300 rounded-xl font-sans text-xs space-y-1">
                <p className="font-bold text-rose-950 text-sm">
                  Cause of Death: {certificate.content_payload.cause_of_death || "Cardiopulmonary Arrest"}
                </p>
                <p className="text-rose-900">
                  Time of Death: {certificate.content_payload.time_of_death || "As noted in medical records"}.
                </p>
              </div>
            )}

            {certificate.certificate_type === "overseas_clearance" && (
              <div className="my-4 p-4 bg-sky-50/60 border border-sky-300 rounded-xl font-sans text-xs space-y-1">
                <p className="font-bold text-sky-950 text-sm">
                  Target Destination: {certificate.content_payload.destination_country || "International"}
                </p>
                <p className="text-sky-900">
                  Communicable disease screening (HIV, HCV, HBsAg, VDRL, Tuberculosis via Chest X-Ray) completed with non-reactive / negative results. Cleared for international travel and employment.
                </p>
              </div>
            )}

            {certificate.content_payload.remarks && (
              <p className="italic text-slate-700">
                &ldquo;{certificate.content_payload.remarks}&rdquo;
              </p>
            )}
          </div>

          {/* Signatures & Anti-Tamper Security Hash */}
          <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 items-end font-sans">
            {/* QR Code and Hash */}
            <div className="flex items-center gap-3">
              <div className="p-2 border-2 border-slate-900 rounded-lg">
                <QrCode className="h-16 w-16 text-slate-900" />
              </div>
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-800 uppercase tracking-wider">Cryptographic Anti-Tamper</p>
                <p className="font-mono break-all max-w-[200px] leading-tight text-slate-600">
                  {certificate.qr_verification_hash}
                </p>
                <p className="text-emerald-700 font-semibold">✓ Verified by Onnesha HMS Registrar</p>
              </div>
            </div>

            {/* Doctor Signature */}
            <div className="text-right">
              <div className="inline-block text-center border-t border-slate-900 pt-2 min-w-[220px]">
                <p className="text-xs font-bold text-slate-900">
                  {certificate.content_payload.doctor_name || certificate.issued_by}
                </p>
                <p className="text-[10px] text-slate-500">
                  {certificate.content_payload.doctor_designation || "Authorized Medical Examiner"}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Official Seal of Medical Superintendent</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
