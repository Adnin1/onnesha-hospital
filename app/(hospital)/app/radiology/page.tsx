"use client";

import React, { useState, useEffect } from "react";
import { Scan, Plus, Loader2 } from "lucide-react";
import {
  getRadiologyStudiesAction,
  RadiologyStudy,
} from "@/lib/radiology/actions";

export default function RadiologyPage() {
  const [selectedModality, setSelectedModality] = useState<string>("ALL");
  const [studies, setStudies] = useState<RadiologyStudy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
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
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [selectedModality]);

  return (
    <div className="space-y-6">
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
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
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Imaging Studies & Pending Verification
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
                <th className="px-4 py-3">Modality</th>
                <th className="px-4 py-3">Clinical Indication</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                    <p className="mt-2 text-xs">Loading modality studies...</p>
                  </td>
                </tr>
              ) : studies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Scan className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No imaging studies scheduled for {selectedModality}.</p>
                    <p className="text-xs text-slate-400">New imaging study requisitions from OPD or IPD will display here in real time.</p>
                  </td>
                </tr>
              ) : (
                studies.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{std.study_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{std.patients?.patient_code || "N/A"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded font-bold">
                        {std.radiology_modalities?.modality_code || "IMAGE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{std.clinical_indication || "Routine evaluation"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded capitalize">
                        {std.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(std.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
