"use client";

import React, { useState } from "react";
import { X, Activity, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { recordCriticalCareObservationAction, CriticalCareAdmission } from "@/lib/critical-care/actions";

interface CriticalCareVitalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  admission: CriticalCareAdmission | null;
  onSuccess: () => void;
}

export function CriticalCareVitalsModal({
  isOpen,
  onClose,
  admission,
  onSuccess,
}: CriticalCareVitalsModalProps) {
  const [systolic, setSystolic] = useState<number>(120);
  const [diastolic, setDiastolic] = useState<number>(80);
  const [heartRate, setHeartRate] = useState<number>(82);
  const [spo2, setSpo2] = useState<number>(97);
  const [fio2, setFio2] = useState<number>(40);
  const [gcs, setGcs] = useState<number>(12);
  const [clinicalNotes, setClinicalNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !admission) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!admission) return;

    setSubmitting(true);
    setErrorMsg(null);

    const res = await recordCriticalCareObservationAction({
      admission_id: admission.id,
      systolic_bp: systolic,
      diastolic_bp: diastolic,
      heart_rate: heartRate,
      spo2,
      fio2,
      gcs_score: gcs,
      clinical_notes: clinicalNotes.trim(),
    });

    setSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.error || "ভাইটালস রেকর্ড করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-rose-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-rose-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">আইসিইউ ভাইটালস রেকর্ড (Record ICU Vitals)</h2>
              <p className="text-xs text-slate-300">
                বেড: <span className="font-mono text-rose-300 font-bold">{admission.bed_number}</span> • রোগী: {admission.patients?.full_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Blood Pressure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Systolic BP (mmHg)
              </label>
              <input
                type="number"
                min="40"
                max="260"
                value={systolic}
                onChange={(e) => setSystolic(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Diastolic BP (mmHg)
              </label>
              <input
                type="number"
                min="20"
                max="180"
                value={diastolic}
                onChange={(e) => setDiastolic(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
          </div>

          {/* Heart Rate & SpO2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                হার্ট রেট / Pulse (bpm)
              </label>
              <input
                type="number"
                min="30"
                max="240"
                value={heartRate}
                onChange={(e) => setHeartRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SpO2 (%) — অক্সিজেন মাত্রা
              </label>
              <input
                type="number"
                min="50"
                max="100"
                value={spo2}
                onChange={(e) => setSpo2(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
          </div>

          {/* FiO2 & GCS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                FiO2 (%) ভেন্টিলেটর O2
              </label>
              <input
                type="number"
                min="21"
                max="100"
                value={fio2}
                onChange={(e) => setFio2(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GCS Score (৩ - ১৫ স্কেল)
              </label>
              <input
                type="number"
                min="3"
                max="15"
                value={gcs}
                onChange={(e) => setGcs(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
          </div>

          {/* Clinical Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ক্লিনিক্যাল পর্যবেক্ষণ নোট (Clinical Observation Notes)
            </label>
            <textarea
              rows={3}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="ইনোট্রপ সাপোর্ট, ভেন্টিলেটর মোড (e.g. SIMV, CPAP), পিউপিল রিফ্লেক্স, ইউরিন আউটপুট ইত্যাদি..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
            />
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
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  রেকর্ড হচ্ছে...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  ভাইটালস সংরক্ষণ করুন
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
