"use client";

import React, { useState } from "react";
import { HeartPulse, Bed, Activity, UserPlus, AlertTriangle } from "lucide-react";

export default function CriticalCarePage() {
  const [selectedUnit, setSelectedUnit] = useState<string>("ICU");
  const [patientSearch, setPatientSearch] = useState<string>("");

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
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
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
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
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
            <p className="text-2xl font-bold text-slate-900 mt-1">4 / 10 Beds</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <Bed className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ventilator Support</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">2 Active</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Bed</th>
                <th className="px-4 py-3">Patient Code</th>
                <th className="px-4 py-3">Diagnosis</th>
                <th className="px-4 py-3">Vitals (BP / HR / SpO2)</th>
                <th className="px-4 py-3">Ventilator</th>
                <th className="px-4 py-3">GCS Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-semibold text-slate-900">Bed 01</td>
                <td className="px-4 py-3">P-202609-00108</td>
                <td className="px-4 py-3">Severe Sepsis</td>
                <td className="px-4 py-3 font-mono text-xs">110/70 • 88 bpm • 96%</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-rose-100 text-rose-800 rounded">Active</span></td>
                <td className="px-4 py-3 font-bold">12 / 15</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-rose-600 hover:text-rose-800 font-medium">Record Vitals</button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-semibold text-slate-900">Bed 02</td>
                <td className="px-4 py-3">P-202609-00142</td>
                <td className="px-4 py-3">Post-Op CABG Observation</td>
                <td className="px-4 py-3 font-mono text-xs">125/80 • 74 bpm • 98%</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">None</span></td>
                <td className="px-4 py-3 font-bold">15 / 15</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-rose-600 hover:text-rose-800 font-medium">Record Vitals</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
