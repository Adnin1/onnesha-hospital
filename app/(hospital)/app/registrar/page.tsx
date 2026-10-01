"use client";

import React, { useState, useEffect } from "react";
import { Award, Plus, QrCode, Loader2, Printer, CheckCircle2 } from "lucide-react";
import {
  getMedicalCertificatesAction,
  MedicalCertificate,
} from "@/lib/registrar/actions";
import { IssueCertificateModal } from "@/components/registrar/IssueCertificateModal";
import { PrintCertificateModal } from "@/components/registrar/PrintCertificateModal";

export default function RegistrarCertificatesPage() {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedCertForPrint, setSelectedCertForPrint] = useState<MedicalCertificate | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
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
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedType]);

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
            <Award className="h-7 w-7 text-amber-600" />
            Medical Records Registrar & Anti-Tamper Certificates
          </h1>
          <p className="text-sm text-slate-500">
            Immutable Document Numbering, Cryptographic QR Verification & Formal Hospital Certificates
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsIssueModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          + Issue New Certificate
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        {["ALL", "birth", "death", "medical_fitness", "discharge", "overseas_clearance"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Issued Official Certificates ({certificates.length} Records)
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
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500" />
                    <p className="mt-2 text-xs">Loading certificate registry...</p>
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <Award className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No medical certificates issued for {selectedType}.</p>
                    <p className="text-xs text-slate-400">Click &ldquo;+ Issue New Certificate&rdquo; above to issue a formal document.</p>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCertForPrint(cert)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        title="সনদপত্র প্রিভিউ ও প্রিন্ট করুন"
                      >
                        <Printer className="h-3.5 w-3.5 text-amber-600" />
                        প্রিন্ট / ভিউ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Certificate Modal */}
      <IssueCertificateModal
        key={selectedType}
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        defaultCertType={selectedType}
        onSuccess={(newCert) => {
          setCertificates((prev) => [newCert, ...prev]);
          showSuccess("অফিসিয়াল সার্টিফিকেট সফলভাবে ইস্যু করা হয়েছে।");
        }}
      />

      {/* Print Certificate Modal */}
      <PrintCertificateModal
        isOpen={!!selectedCertForPrint}
        onClose={() => setSelectedCertForPrint(null)}
        certificate={selectedCertForPrint}
      />
    </div>
  );
}
