"use client";

import React, { useState } from "react";
import { Award, Plus, QrCode } from "lucide-react";

export default function RegistrarCertificatesPage() {
  const [selectedType, setSelectedType] = useState<string>("ALL");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Award className="h-7 w-7 text-amber-600" />
            Medical Records Registrar & Anti-Tamper Certificates
          </h1>
          <p className="text-sm text-slate-500">
            Immutable Document Numbering, Cryptographic QR Verification & Formal Hospital Certificates
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Issue New Certificate
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        {["ALL", "birth", "death", "medical_fitness", "discharge", "overseas_clearance"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg uppercase tracking-wider transition-colors whitespace-nowrap ${
              selectedType === t
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Issued Certificates Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Issued Official Certificates
          </h2>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <QrCode className="h-3.5 w-3.5 text-slate-600" /> Tamper-Proof Cryptographic Hashes
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Certificate Number</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">CERT-2026-00101</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-bold">Medical Fitness</span></td>
                <td className="px-4 py-3">P-202609-00108</td>
                <td className="px-4 py-3 text-xs text-slate-500">2026-09-26</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium">Verified Active</span></td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  <button type="button" className="text-xs text-amber-600 hover:text-amber-800 font-medium">Print PDF</button>
                  <button type="button" className="text-xs text-slate-500 hover:text-slate-700">QR Info</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
