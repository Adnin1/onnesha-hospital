"use client";

import React, { useState } from "react";
import { Scan, Plus, CheckCircle, FileText } from "lucide-react";

export default function RadiologyPage() {
  const [selectedModality, setSelectedModality] = useState<string>("ALL");

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
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
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
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Study ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Modality</th>
                <th className="px-4 py-3">Study Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Report</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">RAD-2026-0041</td>
                <td className="px-4 py-3">P-202609-00108</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded font-bold">XRAY</span></td>
                <td className="px-4 py-3">Chest PA View (Digital)</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded">Approved</span></td>
                <td className="px-4 py-3 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle className="h-3.5 w-3.5" /> Ready
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> View Report
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">RAD-2026-0042</td>
                <td className="px-4 py-3">P-202609-00115</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded font-bold">USG</span></td>
                <td className="px-4 py-3">Whole Abdomen Ultra-Sonogram</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded">In Progress</span></td>
                <td className="px-4 py-3 text-xs text-slate-400 font-medium">Pending Review</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Enter Findings</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
