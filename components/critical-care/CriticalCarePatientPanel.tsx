"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  HeartPulse,
  Activity,
  AlertTriangle,
  User,
  LogOut,
  ArrowRightLeft,
  FileText,
  Clock,
  ShieldAlert,
  CheckCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  CriticalCareAdmission,
  CriticalCareAlert,
  getCriticalCareAlertsAction,
  updateCriticalCareAlertStatusAction,
} from "@/lib/critical-care/actions";

interface CriticalCarePatientPanelProps {
  admission: CriticalCareAdmission | null;
  isOpen: boolean;
  onClose: () => void;
  onRecordVitals: (adm: CriticalCareAdmission) => void;
  onTransfer: (adm: CriticalCareAdmission) => void;
  onDischarge: (adm: CriticalCareAdmission) => void;
  onAlertUpdated?: () => void;
}

export function CriticalCarePatientPanel({
  admission,
  isOpen,
  onClose,
  onRecordVitals,
  onTransfer,
  onDischarge,
  onAlertUpdated,
}: CriticalCarePatientPanelProps) {
  const [alerts, setAlerts] = useState<CriticalCareAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !admission) return;
    let isMounted = true;

    async function loadAlerts() {
      setLoadingAlerts(true);
      const res = await getCriticalCareAlertsAction(admission?.id);
      if (isMounted && res.success) {
        setAlerts(res.data);
      }
      if (isMounted) setLoadingAlerts(false);
    }

    void loadAlerts();
    return () => {
      isMounted = false;
    };
  }, [isOpen, admission]);

  if (!isOpen || !admission) return null;

  async function handleAlertTransition(
    alertId: string,
    nextStatus: "ACKNOWLEDGED" | "REVIEWED" | "RESOLVED"
  ) {
    setActionLoading(alertId);
    const res = await updateCriticalCareAlertStatusAction(alertId, nextStatus);
    setActionLoading(null);
    if (res.success) {
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: nextStatus } : a))
      );
      if (onAlertUpdated) onAlertUpdated();
    }
  }

  const vitals = admission.latest_vitals;
  const isSpo2Critical = vitals?.spo2 !== undefined && vitals.spo2 < 90;
  const isGcsCritical = vitals?.gcs !== undefined && vitals.gcs < 8;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="p-6 bg-gradient-to-r from-rose-900 via-rose-800 to-slate-900 text-white sticky top-0 z-10">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold text-xs uppercase tracking-wider">
                  {admission.bed_number}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-rose-100 font-medium">
                  {admission.critical_care_units?.unit_type || "ICU"} Complex
                </span>
                {admission.ventilator_required && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                    VENTILATOR ACTIVE
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-2">
                {admission.patients?.full_name || "Patient Record"}
              </h2>
              <p className="text-xs text-rose-200 font-mono">
                OH-ID: {admission.patients?.patient_code || "N/A"} • Gender: {admission.patients?.gender || "N/A"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-rose-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Admission Information Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="h-4 w-4 text-rose-600" />
              ভর্তি ও ক্লিনিক্যাল বিবরণ (Admission Details)
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">ভর্তির সময়:</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3 text-slate-400" />
                  {new Date(admission.admission_time).toLocaleString("bn-BD", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">দায়িত্বরত চিকিৎসক:</span>
                <span className="font-semibold text-slate-900 mt-0.5 block">
                  {admission.admitting_doctor_id || "আইসিইউ ইন-চার্জ"}
                </span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">প্রাথমিক রোগ নির্ণয় (Diagnosis):</span>
              <p className="text-xs font-medium text-slate-800 bg-white p-2 rounded-lg border border-slate-200 mt-1">
                {admission.initial_diagnosis}
              </p>
            </div>
          </div>

          {/* Real-time Physiological Vitals Card */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse className="h-4 w-4 text-rose-600" />
                সর্বশেষ ভাইটালস (Latest Physiological Parameters)
              </h3>
              <button
                type="button"
                onClick={() => onRecordVitals(admission)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                <Activity className="h-3.5 w-3.5" />
                + নতুন রেকর্ড
              </button>
            </div>

            {vitals ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className={`p-2.5 rounded-xl border ${isSpo2Critical ? "bg-rose-50 border-rose-300" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">SpO2 (অক্সিজেন)</span>
                  <span className={`text-lg font-bold font-mono ${isSpo2Critical ? "text-rose-600" : "text-emerald-600"}`}>
                    {vitals.spo2 ?? "--"}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border bg-slate-50 border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">হার্ট রেট (Pulse)</span>
                  <span className="text-lg font-bold font-mono text-slate-900">
                    {vitals.heart_rate ?? "--"} <span className="text-[10px] font-normal text-slate-500">bpm</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border bg-slate-50 border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">রক্তচাপ (BP)</span>
                  <span className="text-lg font-bold font-mono text-slate-900">
                    {vitals.bp || "--/--"}
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isGcsCritical ? "bg-rose-50 border-rose-300" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">GCS স্কোর</span>
                  <span className={`text-lg font-bold font-mono ${isGcsCritical ? "text-rose-600" : "text-slate-900"}`}>
                    {vitals.gcs ?? "--"}/15
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                এখনও কোনো ভাইটালস রেকর্ড করা হয়নি। উপরে &ldquo;+ নতুন রেকর্ড&rdquo; বাটনে ক্লিক করুন।
              </div>
            )}
          </div>

          {/* Clinical Alerts Lifecycle Section */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                ক্লিনিক্যাল ট্রায়াজ অ্যালার্ট লাইফসাইকেল (Alert Lifecycle)
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                {alerts.length} অ্যালার্ট
              </span>
            </div>

            {loadingAlerts ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> লোড হচ্ছে...
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-3 text-center text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                বর্তমানে কোনো সক্রিয় ক্রিটিক্যাল অ্যালার্ট নেই (Vitals Stable)
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      alt.status === "TRIGGERED"
                        ? "bg-rose-50 border-rose-200"
                        : alt.status === "ACKNOWLEDGED"
                        ? "bg-amber-50 border-amber-200"
                        : alt.status === "REVIEWED"
                        ? "bg-sky-50 border-sky-200"
                        : "bg-emerald-50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span className="text-slate-900">{alt.message}</span>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] rounded-full font-bold uppercase tracking-wider bg-white shadow-xs">
                        {alt.status}
                      </span>
                    </div>

                    {/* Alert Action Buttons according to lifecycle */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {alt.status === "TRIGGERED" && (
                        <button
                          type="button"
                          disabled={actionLoading === alt.id}
                          onClick={() => handleAlertTransition(alt.id, "ACKNOWLEDGED")}
                          className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          {actionLoading === alt.id ? "স্বীকৃতি হচ্ছে..." : "স্বীকৃতি দিন (Acknowledge)"}
                        </button>
                      )}
                      {alt.status === "ACKNOWLEDGED" && (
                        <button
                          type="button"
                          disabled={actionLoading === alt.id}
                          onClick={() => handleAlertTransition(alt.id, "REVIEWED")}
                          className="px-2.5 py-1 text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          {actionLoading === alt.id ? "আপডেট হচ্ছে..." : "ডাক্তার রিভিউ (Review)"}
                        </button>
                      )}
                      {alt.status === "REVIEWED" && (
                        <button
                          type="button"
                          disabled={actionLoading === alt.id}
                          onClick={() => handleAlertTransition(alt.id, "RESOLVED")}
                          className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          {actionLoading === alt.id ? "সমাধান হচ্ছে..." : "সমাধান সম্পন্ন (Resolve)"}
                        </button>
                      )}
                      {alt.status === "RESOLVED" && (
                        <span className="text-[11px] text-emerald-700 font-medium">
                          ✓ অ্যালার্ট নিষ্পত্তি হয়েছে
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-3 sticky bottom-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onTransfer(admission)}
              className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="h-4 w-4 text-sky-600" />
              ওয়ার্ডে স্থানান্তর (Transfer)
            </button>
            <button
              type="button"
              onClick={() => onDischarge(admission)}
              className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-rose-600" />
              আইসিইউ ছাড়পত্র (Discharge)
            </button>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/app/patients?id=${admission.patient_id}`}
              className="flex-1 py-2 px-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
            >
              <FileText className="h-4 w-4" />
              সম্পূর্ণ ক্লিনিক্যাল চার্ট (Open Chart)
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
