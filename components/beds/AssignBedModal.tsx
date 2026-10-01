"use client";

import React, { useState, useEffect } from "react";
import { X, UserPlus, Search, Check, Loader2 } from "lucide-react";
import { BedRecord, CabinRecord } from "@/types/beds-ot";
import { PatientMaster } from "@/types/clinical";
import { searchPatientsAction } from "@/lib/patient/actions";
import { assignBedAction } from "@/lib/ipd/bed-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedBed?: BedRecord | null;
  selectedCabin?: CabinRecord | null;
  onAssigned: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function AssignBedModal({
  isOpen,
  onClose,
  selectedBed,
  selectedCabin,
  onAssigned,
  onToast,
}: Props) {
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [dailyRate, setDailyRate] = useState(
    String(selectedBed?.bed_type?.daily_rate || selectedCabin?.daily_rate || 500)
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchPatients() {
      setLoadingPatients(true);
      const res = await searchPatientsAction({ query: searchQuery, pageSize: 30 });
      if (active && res.success && res.data?.patients) {
        setPatients(res.data.patients);
        if (res.data.patients.length > 0 && !selectedPatientId) {
          setSelectedPatientId(res.data.patients[0].id);
        }
      }
      if (active) setLoadingPatients(false);
    }
    const timer = setTimeout(fetchPatients, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedPatientId]);

  if (!isOpen) return null;

  const targetTitle = selectedBed
    ? `বেড: ${selectedBed.bed_number} (${selectedBed.ward?.name || "Ward"})`
    : selectedCabin
    ? `কেবিন: ${selectedCabin.cabin_number}`
    : "বেড বরাদ্দ";

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      onToast("অনুগ্রহ করে একজন রোগী নির্বাচন করুন", "error");
      return;
    }
    setSubmitting(true);
    const fakeVisitId = `vst-${Date.now()}`;
    const res = await assignBedAction({
      visitId: fakeVisitId,
      patientId: selectedPatientId,
      bedId: selectedBed?.id,
      cabinId: selectedCabin?.id,
      dailyCharge: Number(dailyRate) || 500,
    });
    setSubmitting(false);

    if (res.success) {
      onToast("রোগীর জন্য সফলভাবে বেড বরাদ্দ সম্পন্ন হয়েছে।", "success");
      onAssigned();
      onClose();
    } else {
      onToast(res.error || "বেড বরাদ্দ ব্যর্থ হয়েছে", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <UserPlus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                রোগী বেড বরাদ্দকরণ (Bed Allocation)
              </h2>
              <p className="text-xs text-slate-500 font-medium">{targetTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleAssign} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Patient Search */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              রোগী নির্বাচন করুন (Select Patient) *
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="রোগীর নাম বা OH-ID বা মোবাইল দিয়ে খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {loadingPatients ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>লোড হচ্ছে...</span>
                </div>
              ) : patients.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  কোনো রোগী পাওয়া যায়নি।
                </div>
              ) : (
                patients.map((pat) => (
                  <div
                    key={pat.id}
                    onClick={() => setSelectedPatientId(pat.id)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition text-xs ${
                      selectedPatientId === pat.id
                        ? "bg-emerald-50 text-emerald-900 font-bold"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{pat.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {pat.patient_code} • {pat.gender} • {pat.phone}
                      </p>
                    </div>
                    {selectedPatientId === pat.id && (
                      <Check className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Daily Charge */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              দৈনিক ভাড়া (Daily Charge ৳) *
            </label>
            <input
              type="number"
              min="0"
              required
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedPatientId}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? "বরাদ্দ হচ্ছে..." : "বেড বরাদ্দ সম্পন্ন করুন"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
