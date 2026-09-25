"use client";

import React, { useState, useEffect } from "react";
import { Award, Plus, QrCode, Loader2 } from "lucide-react";
import {
  getMedicalCertificatesAction,
  MedicalCertificate,
} from "@/lib/registrar/actions";

export default function RegistrarCertificatesPage() {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      const res = await getMedicalCertificatesAction(selectedType);
      if (!isMounted) return;
      if (res.success && res.data) {
        setCertificates(res.data);
      } else {
        setErrorMsg(res.error || "Failed to load medical certificates.");
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [selectedType]);

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
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
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
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
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

        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Certificate Number</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Patient Code</th>
                <th className="px-4 py-3">Patient Name</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500" />
                    <p className="mt-2 text-xs">Loading certificate registry...</p>
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Award className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No medical certificates issued for {selectedType}.</p>
                    <p className="text-xs text-slate-400">Certificates issued to patients will be listed here with cryptographic verification keys.</p>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{cert.certificate_number}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium capitalize">
                        {cert.certificate_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{cert.patients?.patient_code || "N/A"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{cert.patients?.full_name || "N/A"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{cert.issue_date}</td>
                    <td className="px-4 py-3">
                      {cert.is_void ? (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded font-medium">Voided</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium">Verified Active</span>
                      )}
                    </td>
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
