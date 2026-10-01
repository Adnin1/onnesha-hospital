"use client";

import React, { useState } from "react";
import { X, Printer, ShieldCheck, CheckCircle2, Loader2, Scan } from "lucide-react";
import { approveRadiologyReportAction, RadiologyStudy } from "@/lib/radiology/actions";

interface RadiologyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  study: RadiologyStudy | null;
  onSuccess: () => void;
}

export function RadiologyReportModal({
  isOpen,
  onClose,
  study,
  onSuccess,
}: RadiologyReportModalProps) {
  const [findings, setFindings] = useState<string>(study?.findings || "");
  const [impression, setImpression] = useState<string>(study?.impression || "");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !study) return null;

  async function handleApprove() {
    if (!study) return;
    if (!findings.trim()) {
      setErrorMsg("অনুগ্রহ করে রেডিওলজি ফাইন্ডিংস (Findings) লিখুন।");
      return;
    }
    if (!impression.trim()) {
      setErrorMsg("অনুগ্রহ করে ডায়াগনস্টিক ইম্প্রেশন (Impression) লিখুন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await approveRadiologyReportAction({
      study_id: study.id,
      findings: findings.trim(),
      impression: impression.trim(),
    });

    setSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.error || "রিপোর্ট অনুমোদন করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header Bar */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-indigo-400" />
            <span className="text-sm font-bold">রেডিওলজি রিপোর্ট ও কনসালট্যান্ট অনুমোদন (PACS Report Console)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> প্রিন্ট
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* Hospital Header for Print */}
          <div className="border-b pb-4 text-center">
            <h1 className="text-xl font-black text-slate-900 tracking-wide font-sans">
              ONNESHA HOSPITAL & DIAGNOSTIC COMPLEX
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">
              Department of Radiology & Medical Imaging
            </p>
          </div>

          {/* Patient and Study Meta */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <p>
                <span className="text-slate-500 font-medium">Patient Name:</span>{" "}
                <strong className="text-slate-900 font-bold">{study.patients?.full_name}</strong>
              </p>
              <p className="mt-1">
                <span className="text-slate-500 font-medium">Patient ID:</span>{" "}
                <strong className="font-mono text-slate-900">{study.patients?.patient_code}</strong>
              </p>
              <p className="mt-1">
                <span className="text-slate-500 font-medium">Gender:</span>{" "}
                <span className="font-semibold">{study.patients?.gender || "MALE"}</span>
              </p>
            </div>
            <div>
              <p>
                <span className="text-slate-500 font-medium">Study:</span>{" "}
                <strong className="text-indigo-950 font-bold">{study.study_name}</strong>
              </p>
              <p className="mt-1">
                <span className="text-slate-500 font-medium">Modality:</span>{" "}
                <span className="font-bold text-indigo-700">{study.radiology_modalities?.modality_code}</span>
              </p>
              <p className="mt-1">
                <span className="text-slate-500 font-medium">Status:</span>{" "}
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold capitalize">
                  {study.status}
                </span>
              </p>
            </div>
          </div>

          {study.clinical_indication && (
            <div className="text-xs">
              <span className="font-bold text-slate-700">Clinical Indication: </span>
              <span className="text-slate-600">{study.clinical_indication}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Findings */}
          <div>
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
              রেডিওলজিক্যাল ফাইন্ডিংস (Radiological Findings)
            </label>
            <textarea
              rows={4}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Detailed radiological observations, measurements, parenchymal density, bone cortex..."
              className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 leading-relaxed"
            />
          </div>

          {/* Impression */}
          <div>
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
              চূড়ান্ত সিদ্ধান্ত / ইম্প্রেশন (Diagnostic Impression)
            </label>
            <textarea
              rows={2}
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              placeholder="e.g. Normal 12-lead ECG / Bilateral bronchopneumonia / Grade-1 fatty liver..."
              className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
            />
          </div>

          {/* Doctor Signature Block */}
          <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              <span>DICOM PACS Verified Digital Signature</span>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900">Dr. M. A. Karim, MBBS, MD (Radiology)</p>
              <p className="text-[11px] text-slate-500">Consultant Radiologist & Imaging Specialist</p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            বন্ধ করুন (Close)
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleApprove()}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                অনুমোদন হচ্ছে...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                রিপোর্ট অনুমোদন করুন (Approve Report)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
