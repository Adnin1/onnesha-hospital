"use client";

import React, { useState, useEffect } from "react";
import {
  HeartPulse,
  Bed,
  Activity,
  UserPlus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Stethoscope,
  LogOut,
  ArrowRightLeft,
} from "lucide-react";
import {
  getCriticalCareAdmissionsAction,
  dischargeCriticalCareAdmissionAction,
  getCriticalCareAlertsAction,
  CriticalCareAdmission,
  CriticalCareAlert,
} from "@/lib/critical-care/actions";
import { CriticalCareAdmissionModal } from "@/components/critical-care/CriticalCareAdmissionModal";
import { CriticalCareVitalsModal } from "@/components/critical-care/CriticalCareVitalsModal";
import { CriticalCarePatientPanel } from "@/components/critical-care/CriticalCarePatientPanel";

export default function CriticalCarePage() {
  const [selectedUnit, setSelectedUnit] = useState<string>("ICU");
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [admissions, setAdmissions] = useState<CriticalCareAdmission[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<CriticalCareAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals & Drawers
  const [isAdmissionModalOpen, setIsAdmissionModalOpen] = useState(false);
  const [vitalsModalAdmission, setVitalsModalAdmission] = useState<CriticalCareAdmission | null>(null);
  const [selectedPatientAdmission, setSelectedPatientAdmission] = useState<CriticalCareAdmission | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [resAdmissions, resAlerts] = await Promise.all([
          getCriticalCareAdmissionsAction(selectedUnit),
          getCriticalCareAlertsAction(),
        ]);

        if (!isMounted) return;
        if (resAdmissions.success && resAdmissions.data) {
          setAdmissions(resAdmissions.data);
        } else {
          setErrorMsg(resAdmissions.error || "Failed to load critical care admissions.");
        }

        if (resAlerts.success) {
          setActiveAlerts(resAlerts.data.filter((a) => a.status === "TRIGGERED" || a.status === "ACKNOWLEDGED"));
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        console.error("[critical-care fetchData] error:", err);
        setErrorMsg("Network error loading critical care data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedUnit, refreshKey]);

  function showSuccess(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  async function handleDischargeOrTransfer(
    adm: CriticalCareAdmission,
    newStatus: "transferred" | "discharged"
  ) {
    const label = newStatus === "transferred" ? "জেনারেল ওয়ার্ডে স্থানান্তর (Step-down)" : "ছাড়পত্র (Discharge)";
    if (!window.confirm(`আপনি কি নিশ্চিত যে রোগী ${adm.patients?.full_name || ""} কে ${label} করতে চান? (বেড স্ট্যাটাস ক্লিনিক্যাল ক্লিনিং-এ স্থানান্তরিত হবে)`)) {
      return;
    }
    const res = await dischargeCriticalCareAdmissionAction({
      admissionId: adm.id,
      status: newStatus,
      destination: newStatus === "transferred" ? "General Medical Ward" : "Home",
    });
    if (res.success) {
      showSuccess(`রোগীর ${label} সফলভাবে সম্পন্ন হয়েছে। বেড ক্লিনিং প্রক্রিয়ায় পাঠানো হয়েছে।`);
      setSelectedPatientAdmission(null);
      setRefreshKey((k) => k + 1);
    } else {
      setErrorMsg(res.error || "স্ট্যাটাস পরিবর্তন করতে ব্যর্থ হয়েছে।");
    }
  }

  const filteredAdmissions = admissions.filter((adm) => {
    if (!patientSearch.trim()) return true;
    const term = patientSearch.toLowerCase();
    const pCode = adm.patients?.patient_code?.toLowerCase() || "";
    const pName = adm.patients?.full_name?.toLowerCase() || "";
    const bNum = adm.bed_number?.toLowerCase() || "";
    return pCode.includes(term) || pName.includes(term) || bNum.includes(term);
  });

  const activeAdmissions = admissions.filter((a) => a.status === "admitted" || a.status === "ACTIVE");
  const activeVentilators = activeAdmissions.filter((a) => a.ventilator_required).length;

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
            <HeartPulse className="h-7 w-7 text-rose-600" />
            Critical Care Command Center
          </h1>
          <p className="text-sm text-slate-500">
            Unified High-Dependency & Critical Care Unit Management (ICU / ICCU / CCU / SICU / MICU / PICU)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdmissionModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          + Critical Care Admission
        </button>
      </div>

      {/* Unit Selector Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        {["ICU", "ICCU", "CCU", "SICU", "MICU", "PICU"].map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => setSelectedUnit(unit)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
              selectedUnit === unit
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {unit} Unit
          </button>
        ))}
      </div>

      {/* Critical Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Occupancy</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {activeAdmissions.length} Active Patients
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <Bed className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ventilator Support</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {activeVentilators} Active
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Activity className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Triage Alerts</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">
              {activeAlerts.length} Critical Alerts
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Patient Bed Matrix & Vitals */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            {selectedUnit} Active Patients & Observation Records
          </h2>
          <input
            type="text"
            placeholder="Search patient by ID, Name or Bed..."
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
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
                <th className="px-4 py-3">Bed</th>
                <th className="px-4 py-3">Patient Code</th>
                <th className="px-4 py-3">Patient Name</th>
                <th className="px-4 py-3">Diagnosis</th>
                <th className="px-4 py-3">Ventilator</th>
                <th className="px-4 py-3">Latest Vitals</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-rose-500" />
                    <p className="mt-2 text-xs">Loading critical care unit records...</p>
                  </td>
                </tr>
              ) : filteredAdmissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <div className="text-center max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                        <HeartPulse className="h-6 w-6" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800">
                        No active {selectedUnit} admissions
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Currently there are no admitted patients in the {selectedUnit} complex. All configured beds are vacant and ready for admission.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsAdmissionModalOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
                      >
                        <UserPlus className="h-4 w-4" />
                        + Critical Care Admission
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAdmissions.map((adm) => (
                  <tr
                    key={adm.id}
                    onClick={() => setSelectedPatientAdmission(adm)}
                    className="hover:bg-rose-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{adm.bed_number}</td>
                    <td className="px-4 py-3 font-mono text-xs">{adm.patients?.patient_code || "N/A"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{adm.patients?.full_name || "Anonymous Patient"}</td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">{adm.initial_diagnosis}</td>
                    <td className="px-4 py-3">
                      {adm.ventilator_required ? (
                        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">Active Vent</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">Room Air</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {adm.latest_vitals ? (
                        <span className="font-mono text-[11px] text-slate-700">
                          SpO2: <span className="font-bold text-rose-600">{adm.latest_vitals.spo2}%</span> | BP: {adm.latest_vitals.bp} | GCS: {adm.latest_vitals.gcs}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Not recorded</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded font-medium capitalize ${
                        adm.status === "admitted" || adm.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {adm.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {adm.status === "admitted" || adm.status === "ACTIVE" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVitalsModalAdmission(adm)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                            title="ভাইটালস ও GCS পর্যবেক্ষণ রেকর্ড করুন"
                          >
                            <Stethoscope className="h-3.5 w-3.5" />
                            ভাইটালস
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDischargeOrTransfer(adm, "transferred")}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="জেনারেল ওয়ার্ডে স্থানান্তর"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            ট্রান্সফার
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDischargeOrTransfer(adm, "discharged")}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="আইসিইউ ছাড়পত্র"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            ছাড়পত্র
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">সম্পন্ন</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Critical Care Admission Modal */}
      <CriticalCareAdmissionModal
        key={selectedUnit}
        isOpen={isAdmissionModalOpen}
        onClose={() => setIsAdmissionModalOpen(false)}
        defaultUnitType={selectedUnit}
        onSuccess={(newAdmission) => {
          setAdmissions((prev) => [newAdmission, ...prev]);
          showSuccess("রোগী সফলভাবে ক্রিটিক্যাল কেয়ার ইউনিটে ভর্তি করা হয়েছে।");
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Critical Care Vitals Recording Modal */}
      <CriticalCareVitalsModal
        isOpen={!!vitalsModalAdmission}
        onClose={() => setVitalsModalAdmission(null)}
        admission={vitalsModalAdmission}
        onSuccess={() => {
          showSuccess("ভাইটালস সফলভাবে রেকর্ড করা হয়েছে।");
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Critical Care Patient Slide-Over Panel */}
      <CriticalCarePatientPanel
        isOpen={!!selectedPatientAdmission}
        admission={selectedPatientAdmission}
        onClose={() => setSelectedPatientAdmission(null)}
        onRecordVitals={(adm) => setVitalsModalAdmission(adm)}
        onTransfer={(adm) => void handleDischargeOrTransfer(adm, "transferred")}
        onDischarge={(adm) => void handleDischargeOrTransfer(adm, "discharged")}
        onAlertUpdated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
