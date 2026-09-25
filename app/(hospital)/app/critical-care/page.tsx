"use client";

import React, { useState, useEffect } from "react";
import { HeartPulse, Bed, Activity, UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import {
  getCriticalCareAdmissionsAction,
  CriticalCareAdmission,
} from "@/lib/critical-care/actions";

export default function CriticalCarePage() {
  const [selectedUnit, setSelectedUnit] = useState<string>("ICU");
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [admissions, setAdmissions] = useState<CriticalCareAdmission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      const res = await getCriticalCareAdmissionsAction(selectedUnit);
      if (!isMounted) return;
      if (res.success && res.data) {
        setAdmissions(res.data);
      } else {
        setErrorMsg(res.error || "Failed to load critical care admissions.");
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [selectedUnit]);

  const filteredAdmissions = admissions.filter((adm) => {
    if (!patientSearch.trim()) return true;
    const term = patientSearch.toLowerCase();
    const pCode = adm.patients?.patient_code?.toLowerCase() || "";
    const pName = adm.patients?.full_name?.toLowerCase() || "";
    const bNum = adm.bed_number?.toLowerCase() || "";
    return pCode.includes(term) || pName.includes(term) || bNum.includes(term);
  });

  const activeAdmissions = admissions.filter((a) => a.status === "admitted");
  const activeVentilators = activeAdmissions.filter((a) => a.ventilator_required).length;

  return (
    <div className="space-y-6">
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          Critical Care Admission
        </button>
      </div>

      {/* Unit Selector Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        {["ICU", "ICCU", "CCU", "SICU", "MICU", "PICU"].map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => setSelectedUnit(unit)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
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
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Occupancy</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {activeAdmissions.length} Active Patients
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <Bed className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ventilator Support</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {activeVentilators} Active
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Activity className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Triage Alerts</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">0 Critical Alerts</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Patient Bed Matrix & Vitals */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            {selectedUnit} Active Patients & Observation Records
          </h2>
          <input
            type="text"
            placeholder="Search patient by ID or Bed..."
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
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
                <th className="px-4 py-3">Admission Time</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-rose-500" />
                    <p className="mt-2 text-xs">Loading critical care unit records...</p>
                  </td>
                </tr>
              ) : filteredAdmissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <HeartPulse className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No active {selectedUnit} admissions found.</p>
                    <p className="text-xs text-slate-400">Admit a patient from emergency casualty or ward to see live monitoring records.</p>
                  </td>
                </tr>
              ) : (
                filteredAdmissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{adm.bed_number}</td>
                    <td className="px-4 py-3 font-mono text-xs">{adm.patients?.patient_code || "N/A"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{adm.patients?.full_name || "Anonymous Patient"}</td>
                    <td className="px-4 py-3 text-xs">{adm.initial_diagnosis}</td>
                    <td className="px-4 py-3">
                      {adm.ventilator_required ? (
                        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">Room Air</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(adm.admission_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-medium capitalize">
                        {adm.status}
                      </span>
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
