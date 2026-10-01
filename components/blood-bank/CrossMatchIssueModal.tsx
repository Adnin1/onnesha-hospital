"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { issueBloodBagAction, BloodBagItem } from "@/lib/blood-bank/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface CrossMatchIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBags: BloodBagItem[];
  preselectedBag?: BloodBagItem | null;
  onSuccess: () => void;
}

export function CrossMatchIssueModal({
  isOpen,
  onClose,
  availableBags,
  preselectedBag,
  onSuccess,
}: CrossMatchIssueModalProps) {
  const [selectedBagId, setSelectedBagId] = useState<string>(
    preselectedBag?.id || availableBags[0]?.id || ""
  );
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);

  const [majorMatch, setMajorMatch] = useState<"compatible" | "incompatible">("compatible");
  const [minorMatch, setMinorMatch] = useState<"compatible" | "incompatible">("compatible");
  const [technologistVerified, setTechnologistVerified] = useState<boolean>(true);

  const [loadingPatients, setLoadingPatients] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function fetchPatients() {
      setLoadingPatients(true);
      try {
        const res = await searchPatientsAction({ query: patientSearch, pageSize: 20 });
        if (isMounted && res.success && res.data?.patients) {
          setPatients(res.data.patients);
        }
      } catch {
        // fallback
      } finally {
        if (isMounted) setLoadingPatients(false);
      }
    }
    const timer = setTimeout(() => {
      void fetchPatients();
    }, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, patientSearch]);

  if (!isOpen) return null;

  const activeBag = availableBags.find((b) => b.id === selectedBagId) || availableBags[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে গ্রহীতা রোগী নির্বাচন করুন (Select Patient)।");
      return;
    }
    if (!selectedBagId) {
      setErrorMsg("অনুগ্রহ করে রক্তের ব্যাগ নির্বাচন করুন।");
      return;
    }
    if (majorMatch !== "compatible" || minorMatch !== "compatible") {
      setErrorMsg("ক্রস-ম্যাচ ইনকম্প্যাটিবল হলে রক্ত প্রদান নিষিদ্ধ (Cross-match Incompatible).");
      return;
    }
    if (!technologistVerified) {
      setErrorMsg("ল্যাব টেকনোলজিস্টের ক্রস-ম্যাচ ভেরিফিকেশন সম্মতি আবশ্যক।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await issueBloodBagAction({
      bag_id: selectedBagId,
      patient_id: selectedPatient.id,
      patient_name: selectedPatient.full_name,
      cross_match_result: "compatible",
    });

    setSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.error || "রক্তের ব্যাগ ইস্যু করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-700 to-red-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <ShieldCheck className="h-6 w-6 text-red-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">রক্ত ক্রস-ম্যাচ ও ইস্যু (Cross-Match & Issue Bag)</h2>
              <p className="text-xs text-red-200">
                নিরাপদ রক্ত সঞ্চালনের জন্য বাধ্যতামূলক ডাবল ক্রস-ম্যাচ ও ছাড়পত্র
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-red-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Blood Bag Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              রক্তের ব্যাগ নির্বাচন করুন (Select Blood Unit) <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedBagId}
              onChange={(e) => setSelectedBagId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 font-medium"
            >
              {availableBags.map((bag) => (
                <option key={bag.id} value={bag.id}>
                  {bag.bag_number} — Group: {bag.blood_group} ({bag.component_type.toUpperCase()}) • Exp: {bag.expiry_date}
                </option>
              ))}
            </select>
            {activeBag && (
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Storage: {activeBag.storage_location || "Central Blood Bank"}
              </p>
            )}
          </div>

          {/* Patient Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              গ্রহীতা রোগী (Recipient Patient) <span className="text-rose-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                  <p className="text-xs font-mono text-slate-500">
                    ID: {selectedPatient.patient_code} • Phone: {selectedPatient.phone} • Blood Group: {selectedPatient.blood_group || "N/A"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold"
                >
                  পরিবর্তন করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="রোগীর নাম বা মোবাইল বা আইডি দিয়ে খুঁজুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
                />
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {loadingPatients ? (
                    <div className="p-2.5 text-center text-xs text-slate-400">খোঁজা হচ্ছে...</div>
                  ) : patients.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-slate-400">কোন রোগী পাওয়া যায়নি</div>
                  ) : (
                    patients.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setSelectedPatient(pat)}
                        className="w-full p-2.5 text-left hover:bg-red-50/50 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-slate-900">{pat.full_name}</span>
                        <span className="font-mono text-slate-500">
                          {pat.patient_code} ({pat.blood_group || "Grp Unknown"})
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cross Match Verification */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              ল্যাবরেটরি ক্রস-ম্যাচিং রেজাল্ট (Cross-Match Compatibility)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Major Cross-match (Donor RBCs + Patient Serum)
                </label>
                <select
                  value={majorMatch}
                  onChange={(e) => setMajorMatch(e.target.value as "compatible" | "incompatible")}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-bold text-emerald-700"
                >
                  <option value="compatible">COMPATIBLE (সঙ্গতিপূর্ণ)</option>
                  <option value="incompatible">INCOMPATIBLE (অসঙ্গতিপূর্ণ)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Minor Cross-match (Patient RBCs + Donor Plasma)
                </label>
                <select
                  value={minorMatch}
                  onChange={(e) => setMinorMatch(e.target.value as "compatible" | "incompatible")}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-bold text-emerald-700"
                >
                  <option value="compatible">COMPATIBLE (সঙ্গতিপূর্ণ)</option>
                  <option value="incompatible">INCOMPATIBLE (অসঙ্গতিপূর্ণ)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800">টেকনোলজিস্ট প্রত্যয়ন ও ডিজিটাল রিলিজ</p>
                <p className="text-[10px] text-slate-500">অ্যাগ্রুটিনেশন বা হেমোলাইসিস অনুপস্থিত মর্মে নিশ্চিত হওয়া গেলো</p>
              </div>
              <input
                type="checkbox"
                checked={technologistVerified}
                onChange={(e) => setTechnologistVerified(e.target.checked)}
                className="h-5 w-5 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ইস্যু হচ্ছে...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  ব্যাগ প্রদান নিশ্চিত করুন (Issue Blood Unit)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
