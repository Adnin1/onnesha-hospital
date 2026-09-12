"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  User,
  Heart,
  FileText,
  CheckCircle2,
  AlertCircle,
  Thermometer,
  Scale,
  Gauge,
} from "lucide-react";
import { MOCK_WAITING_QUEUE, MOCK_PATIENTS } from "@/lib/mock-data";

export default function OPDConsultationPage() {
  const [activeQueueItem, setActiveQueueItem] = useState(MOCK_WAITING_QUEUE[0]);
  const [bp, setBp] = useState("130/85");
  const [pulse, setPulse] = useState("76");
  const [temp, setTemp] = useState("98.4");
  const [weight, setWeight] = useState("72");
  const [notes, setNotes] = useState("Patient reports persistent weakness and morning dizziness.");
  const [saved, setSaved] = useState(false);

  const handleSaveVitals = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Outpatient Clinical Care
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            OPD Doctor Consultation Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active chamber triage, vital signs entry (BP, Pulse, SpO2, Weight), and digital prescription writing.
          </p>
        </div>

        <Link
          href="/app/prescriptions"
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-2xs transition"
        >
          <FileText className="w-4 h-4 mr-1.5" />
          Open Digital Rx Pad
        </Link>
      </div>

      {/* Main Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Current Active Patient Details (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <span className="text-xs font-bold uppercase text-slate-500">
                Patient in Chamber
              </span>
              <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                Token: {activeQueueItem.token_number}
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900">
              {activeQueueItem.patient_name}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Consulting: {activeQueueItem.doctor_name} ({activeQueueItem.room_number})
            </p>

            <div className="mt-4 p-3 bg-sky-50 rounded-xl border border-sky-100 text-xs text-sky-900 space-y-1">
              <p><strong>Primary Contact:</strong> 01711-223344</p>
              <p><strong>Age / Gender:</strong> 44 Y / MALE</p>
              <p><strong>Blood Group:</strong> B+ (Positive)</p>
            </div>
          </div>
        </div>

        {/* Right: Vitals Recording Console (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-rose-500" />
              Patient Vital Signs & Triage Observations
            </h3>

            {saved && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold mb-4 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Vital signs captured and saved to patient record!</span>
              </div>
            )}

            <form onSubmit={handleSaveVitals} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">
                    Blood Pressure
                  </span>
                  <input
                    type="text"
                    value={bp}
                    onChange={(e) => setBp(e.target.value)}
                    placeholder="120/80"
                    className="w-full font-mono font-bold text-slate-900 bg-transparent focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">mmHg</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">
                    Pulse Rate
                  </span>
                  <input
                    type="text"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    placeholder="72"
                    className="w-full font-mono font-bold text-slate-900 bg-transparent focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">bpm</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">
                    Body Temp
                  </span>
                  <input
                    type="text"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder="98.4"
                    className="w-full font-mono font-bold text-slate-900 bg-transparent focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">°F</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">
                    Weight
                  </span>
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="70"
                    className="w-full font-mono font-bold text-slate-900 bg-transparent focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">kg</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Clinical Examination Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50"
                ></textarea>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition"
                >
                  Save Vitals to EMR
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
