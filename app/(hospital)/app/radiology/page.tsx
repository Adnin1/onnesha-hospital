"use client";

import React, { useState, useEffect } from "react";
import { Scan, Plus, Loader2, CheckCircle2, FileText } from "lucide-react";
import {
  getRadiologyStudiesAction,
  RadiologyStudy,
} from "@/lib/radiology/actions";
import { OrderImagingModal } from "@/components/radiology/OrderImagingModal";
import { RadiologyReportModal } from "@/components/radiology/RadiologyReportModal";

export default function RadiologyPage() {
  const [selectedModality, setSelectedModality] = useState<string>("ALL");
  const [studies, setStudies] = useState<RadiologyStudy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedStudyForReport, setSelectedStudyForReport] = useState<RadiologyStudy | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setErrorMsg(null);
      const res = await getRadiologyStudiesAction(selectedModality);
      if (!isMounted) return;
      if (res.success && res.data) {
        setStudies(res.data);
      } else {
        setErrorMsg(res.error || "Failed to load radiology studies.");
      }
      setLoading(false);
    }
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedModality, refreshKey]);

  function showSuccess(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Scan className="h-7 w-7 text-indigo-600" />
            Radiology & Medical Imaging Console
          </h1>
          <p className="text-sm text-slate-500">
            DICOM/PACS-Ready Modality Worklist, Technician Review & Radiologist Approval Center
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOrderModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Order Imaging Study
        </button>
      </div>

      {/* Modality Filter Pills */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        {["ALL", "XRAY", "CT", "MRI", "USG", "ECG", "ECHO"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSelectedModality(m)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
              selectedModality === m
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {m === "ALL" ? "All Modalities" : m}
          </button>
        ))}
      </div>

      {/* Studies Worklist */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Imaging Studies & Pending Verification ({studies.length})
          </h2>
          <span className="text-xs font-medium text-slate-500">Modality Worklist Active</span>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Study Name</th>
                <th className="px-4 py-3">Patient Code</th>
                <th className="px-4 py-3">Patient Name</th>
                <th className="px-4 py-3">Modality</th>
                <th className="px-4 py-3">Clinical Indication</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled Time</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                    <p className="mt-2 text-xs">Loading modality worklist...</p>
                  </td>
                </tr>
              ) : studies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Scan className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No radiology studies found for {selectedModality}.</p>
                    <p className="text-xs text-slate-400">Click &ldquo;Order Imaging Study&rdquo; above to schedule an examination.</p>
                  </td>
                </tr>
              ) : (
                studies.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900 text-xs">{std.study_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{std.patients?.patient_code || "N/A"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 text-xs">{std.patients?.full_name || "N/A"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold">
                        {std.radiology_modalities?.modality_code || "RAD"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">{std.clinical_indication || "Routine evaluation"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded font-medium capitalize ${
                        std.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : std.status === "completed"
                          ? "bg-sky-100 text-sky-800"
                          : std.status === "in_progress"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {std.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(std.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedStudyForReport(std)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        title="ফাইন্ডিংস দেখুন ও রিপোর্ট অনুমোদন করুন"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        রিপোর্ট
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Imaging Modal */}
      <OrderImagingModal
        key={selectedModality}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        defaultModality={selectedModality}
        onSuccess={(newStudy) => {
          setStudies((prev) => [newStudy, ...prev]);
          showSuccess("ইমেজিং পরীক্ষা সফলভাবে শিডিউল করা হয়েছে।");
        }}
      />

      {/* Radiology Report Modal */}
      <RadiologyReportModal
        isOpen={!!selectedStudyForReport}
        onClose={() => setSelectedStudyForReport(null)}
        study={selectedStudyForReport}
        onSuccess={() => {
          showSuccess("রেডিওলজি রিপোর্ট কনসালট্যান্ট কর্তৃক অনুমোদিত হয়েছে।");
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
