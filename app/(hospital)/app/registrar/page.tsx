"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Award,
  Plus,
  QrCode,
  Loader2,
  Printer,
  CheckCircle2,
  Edit3,
  Trash2,
  Search,
  FileCheck,
  Activity,
  AlertCircle,
  FileText,
  Calendar,
} from "lucide-react";
import {
  getMedicalCertificatesAction,
  deleteMedicalCertificateAction,
  MedicalCertificate,
} from "@/lib/registrar/actions";
import { IssueCertificateModal } from "@/components/registrar/IssueCertificateModal";
import { PrintCertificateModal } from "@/components/registrar/PrintCertificateModal";
import { EditCertificateModal } from "@/components/registrar/EditCertificateModal";

export default function RegistrarCertificatesPage() {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedCertForPrint, setSelectedCertForPrint] = useState<MedicalCertificate | null>(null);
  const [selectedCertForEdit, setSelectedCertForEdit] = useState<MedicalCertificate | null>(null);
  const [selectedCertForDelete, setSelectedCertForDelete] = useState<MedicalCertificate | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Filtered certificates by search
  const filteredCertificates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return certificates;
    return certificates.filter((c) => {
      const matchCertNo = c.certificate_number.toLowerCase().includes(q);
      const matchPatientName = c.patients?.full_name?.toLowerCase().includes(q);
      const matchPatientCode = c.patients?.patient_code?.toLowerCase().includes(q);
      const matchDiagnosis = String(c.content_payload?.diagnosis || "").toLowerCase().includes(q);
      return matchCertNo || matchPatientName || matchPatientCode || matchDiagnosis;
    });
  }, [certificates, searchQuery]);

  // Aggregate metrics
  const stats = useMemo(() => {
    const total = certificates.length;
    const active = certificates.filter((c) => !c.is_void).length;
    const fitnessAndSick = certificates.filter(
      (c) =>
        c.certificate_type === "medical_fitness" ||
        c.certificate_type === "sick_leave" ||
        c.certificate_type === "fitness_to_work"
    ).length;
    const voided = certificates.filter((c) => c.is_void).length;
    return { total, active, fitnessAndSick, voided };
  }, [certificates]);

  async function handleDeleteConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCertForDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteMedicalCertificateAction({
        certificateId: selectedCertForDelete.id,
        reason: deleteReason.trim() || "Voided & Deleted by authorized staff",
      });

      if (res.success) {
        setCertificates((prev) => prev.filter((c) => c.id !== selectedCertForDelete.id));
        showSuccess(`সনদপত্র ${selectedCertForDelete.certificate_number} সফলভাবে বাতিল ও মুছে ফেলা হয়েছে।`);
        setSelectedCertForDelete(null);
        setDeleteReason("");
      } else {
        setErrorMsg(res.error || "সনদপত্র মুছে ফেলতে ব্যর্থ হয়েছে।");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error deleting certificate");
    } finally {
      setIsDeleting(false);
    }
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

      {/* Header with 3D Depth */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl shadow-xl border border-slate-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold border border-amber-500/30 mb-2">
            <Award className="h-3.5 w-3.5" />
            <span>অফিসিয়াল সনদপত্র রেজিস্ট্রি (Anti-Tamper Medical Registrar)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
            International Standard Medical Certificates
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            BMDC Ethics Compliant • Cryptographic SHA-256 Hashes • Complete Bed Rest & Duty Resumption Tracking
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsIssueModalOpen(true)}
            className="btn-3d btn-3d-emerald px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            + নতুন সনদপত্র ইস্যু করুন (Issue Certificate)
          </button>
        </div>
      </div>

      {/* 4 KPI 3D Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-3d p-4 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">মোট সনদপত্র</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shadow-2xs">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <span className="text-[11px] text-slate-400">টি নিবন্ধিত</span>
          </div>
          <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        <div className="stat-card-3d p-4 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">সুস্থতা ও ছুটি সনদ</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shadow-2xs">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.fitnessAndSick}</span>
            <span className="text-[11px] text-amber-600 font-semibold">Fitness & Sick Leave</span>
          </div>
          <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${stats.total > 0 ? (stats.fitnessAndSick / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card-3d p-4 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">যাচাইকৃত সক্রিয়</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shadow-2xs">
              <FileCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{stats.active}</span>
            <span className="text-[11px] text-emerald-600 font-semibold">Verified Active</span>
          </div>
          <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${stats.total > 0 ? (stats.active / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card-3d p-4 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">বাতিলকৃত রেকর্ড</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shadow-2xs">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600">{stats.voided}</span>
            <span className="text-[11px] text-rose-500 font-semibold">Voided</span>
          </div>
          <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full"
              style={{ width: `${stats.total > 0 ? (stats.voided / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="card-3d p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "ALL", label: "সব সনদপত্র (ALL)" },
              { id: "medical_fitness", label: "Medical Fitness" },
              { id: "sick_leave", label: "Sick Leave" },
              { id: "fitness_to_work", label: "Resume Duty" },
              { id: "treatment", label: "Treatment" },
              { id: "overseas_clearance", label: "Overseas" },
              { id: "discharge", label: "Discharge" },
              { id: "birth", label: "Birth" },
              { id: "death", label: "Death" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  selectedType === t.id
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="সনদ নং, রোগী বা ডায়াগনোসিস খুঁজুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Issued Certificates Table */}
      <div className="card-3d overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-600" />
            সনদপত্র তালিকা ({filteredCertificates.length} Records)
          </h2>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1 font-mono">
            <QrCode className="h-3.5 w-3.5 text-slate-700" /> Anti-Tamper SHA-256 Ledger
          </span>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100/70 text-xs uppercase text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Certificate Number</th>
                <th className="px-4 py-3">Type & Purpose</th>
                <th className="px-4 py-3">Patient Code & Name</th>
                <th className="px-4 py-3">Clinical Diagnosis</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500" />
                    <p className="mt-2 text-xs">Loading certificate registry...</p>
                  </td>
                </tr>
              ) : filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <Award className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      কোন সনদপত্র পাওয়া যায়নি ({selectedType})
                    </p>
                    <p className="text-xs text-slate-400">
                      নতুন সনদপত্র তৈরি করতে উপরের &ldquo;+ নতুন সনদপত্র ইস্যু করুন&rdquo; বাটনে ক্লিক করুন।
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCertificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-slate-900 block">
                        {cert.certificate_number}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {cert.qr_verification_hash.slice(0, 16)}...
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-[11px] bg-amber-50 text-amber-900 border border-amber-200 rounded font-bold capitalize block w-fit">
                        {cert.certificate_type.replace(/_/g, " ")}
                      </span>
                      {cert.content_payload?.purpose && (
                        <span className="text-[10px] text-slate-500 block mt-0.5 line-clamp-1">
                          {cert.content_payload.purpose}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 text-xs">
                        {cert.patients?.full_name || "N/A"}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {cert.patients?.patient_code || "N/A"} • {cert.patients?.gender || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-slate-800 font-medium block max-w-xs line-clamp-1">
                        {cert.content_payload?.diagnosis || "Clinically Examined"}
                      </span>
                      {cert.content_payload?.rest_days_count && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold mt-0.5">
                          <Calendar className="h-3 w-3" /> {cert.content_payload.rest_days_count} Days Rest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                      {cert.issue_date}
                    </td>
                    <td className="px-4 py-3">
                      {cert.is_void ? (
                        <span className="px-2 py-0.5 text-[10px] bg-rose-100 text-rose-800 rounded font-bold">
                          Voided
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-bold">
                          Verified Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedCertForPrint(cert)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          title="সনদপত্র প্রিভিউ ও প্রিন্ট করুন"
                        >
                          <Printer className="h-3.5 w-3.5 text-amber-700" />
                          প্রিন্ট
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCertForEdit(cert)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          title="সনদপত্র এডিট করুন"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-sky-600" />
                          এডিট
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCertForDelete(cert);
                            setDeleteReason("");
                          }}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="সনদপত্র মুছে ফেলুন / বাতিল করুন"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete / Void Confirmation Modal */}
      {selectedCertForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                <h3 className="text-sm font-bold">সনদপত্র মুছে ফেলা / বাতিল নিশ্চিতকরণ</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCertForDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white"
              >
                <Plus className="h-5 w-5 transform rotate-45" />
              </button>
            </div>
            <form onSubmit={handleDeleteConfirm} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 leading-relaxed">
                আপনি কি নিশ্চিত যে সনদপত্র{" "}
                <strong className="font-mono">{selectedCertForDelete.certificate_number}</strong> মুছে ফেলতে
                বা বাতিল করতে চান? এটি রেজিস্ট্রি থেকে বাতিল করা হবে এবং অডিট ট্রেইলে সংরক্ষিত হবে।
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  বাতিলের কারণ (Justification Reason) *
                </label>
                <textarea
                  rows={2}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Issued with incorrect clinical dates / Clerical error..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedCertForDelete(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  নিশ্চিত মুছুন (Confirm Delete)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Edit Certificate Modal */}
      <EditCertificateModal
        isOpen={!!selectedCertForEdit}
        onClose={() => setSelectedCertForEdit(null)}
        certificate={selectedCertForEdit}
        onSuccess={(updatedCert) => {
          setCertificates((prev) => prev.map((c) => (c.id === updatedCert.id ? updatedCert : c)));
          showSuccess("অফিসিয়াল সার্টিফিকেট সফলভাবে সংশোধন ও আপডেট করা হয়েছে।");
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
