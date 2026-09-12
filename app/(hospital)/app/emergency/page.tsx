"use client";

import React, { useState } from "react";
import {
  Radio,
  AlertOctagon,
  Phone,
  Clock,
  HeartPulse,
  Activity,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";

export default function EmergencyTriagePage() {
  const [emergencyCases, setEmergencyCases] = useState([
    {
      id: "em-1",
      code: "EM-901",
      name: "Unknown Male (RTA / Trauma)",
      age: "Approx 30 Y",
      severity: "RED",
      condition: "Road accident severe head laceration, low BP (80/50)",
      time: "10 mins ago",
      assignedDoctor: "Dr. On-Duty Trauma Surgeon",
    },
    {
      id: "em-2",
      code: "EM-902",
      name: "Mrs. Shahanara Begum",
      age: "62 Y",
      severity: "RED",
      condition: "Severe retrosternal chest pain with profuse sweating (Suspected Acute MI)",
      time: "25 mins ago",
      assignedDoctor: "Dr. Tanvir Ahmed (Cardiology)",
    },
    {
      id: "em-3",
      code: "EM-903",
      name: "Md. Tanvir Hossain",
      age: "24 Y",
      severity: "YELLOW",
      condition: "Acute severe right iliac fossa pain (Suspected Appendicitis)",
      time: "40 mins ago",
      assignedDoctor: "Emergency Medical Officer",
    },
  ]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-red-600 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider bg-red-700/80 px-2 py-0.5 rounded">
            24/7 Red-Zone Trauma Console
          </span>
          <h1 className="text-2xl font-black mt-1">
            Emergency Department & Critical Triage
          </h1>
          <p className="text-xs text-red-100 mt-0.5">
            Immediate resuscitation priority tagging (Red / Yellow / Green) and emergency OT standby alerts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-white text-red-700 font-black text-xs px-3 py-2 rounded-xl flex items-center shadow-xs">
            <Radio className="w-4 h-4 mr-1.5 animate-ping text-red-600" />
            Ambulance Hotline: {MOCK_ORGANIZATION.ambulanceHotline}
          </div>
        </div>
      </div>

      {/* Triage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <span className="text-xs font-bold text-red-800 uppercase flex items-center">
            <AlertOctagon className="w-4 h-4 mr-1 text-red-600" />
            RED ZONE (Resuscitation / Immediate)
          </span>
          <div className="text-2xl font-black text-red-700 mt-1">2 Active Patients</div>
          <span className="text-[10px] text-red-600 font-medium">Immediate doctor intervention required</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-xs font-bold text-amber-800 uppercase flex items-center">
            <Clock className="w-4 h-4 mr-1 text-amber-600" />
            YELLOW ZONE (Urgent / 30 Mins)
          </span>
          <div className="text-2xl font-black text-amber-700 mt-1">1 Patient</div>
          <span className="text-[10px] text-amber-600 font-medium">Under observation & investigations</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <span className="text-xs font-bold text-emerald-800 uppercase flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
            GREEN ZONE (Minor / Non-urgent)
          </span>
          <div className="text-2xl font-black text-emerald-700 mt-1">0 Patients</div>
          <span className="text-[10px] text-emerald-600 font-medium">Triage queue clear</span>
        </div>
      </div>

      {/* Emergency Active Cases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-4">
          Active Emergency Triage Cases in Casualty
        </h3>

        <div className="space-y-3">
          {emergencyCases.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                c.severity === "RED"
                  ? "bg-red-50/50 border-red-300 ring-2 ring-red-500/10"
                  : "bg-amber-50/50 border-amber-300"
              }`}
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                    {c.code}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      c.severity === "RED"
                        ? "bg-red-600 text-white animate-pulse"
                        : "bg-amber-500 text-white"
                    }`}
                  >
                    Priority: {c.severity}
                  </span>
                  <span className="text-[11px] text-slate-500">{c.time}</span>
                </div>

                <h4 className="font-bold text-sm text-slate-900 mt-1">{c.name}</h4>
                <p className="text-xs text-slate-700 font-medium mt-0.5">
                  <strong>Condition:</strong> {c.condition}
                </p>
                <p className="text-[11px] text-sky-800 font-semibold mt-1">
                  Attending Specialist: {c.assignedDoctor}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => alert(`Transferred ${c.name} directly to ICU Complex.`)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
                >
                  Transfer to ICU
                </button>
                <button
                  onClick={() => alert(`Emergency surgical alert dispatched to OT Team.`)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition"
                >
                  Rush to OT
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
