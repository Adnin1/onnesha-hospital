"use client";

import React, { useState } from "react";
import {
  Scissors,
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  Plus,
} from "lucide-react";

export default function OperationTheaterPage() {
  const [otBookings, setOtBookings] = useState([
    {
      id: "ot-1",
      room: "OT Suite 01 (Modular Laparoscopic)",
      patient: "Mrs. Nasrin Akhter (OH-000102)",
      procedure: "Laparoscopic Cholecystectomy (Gallbladder Removal)",
      leadSurgeon: "Prof. Dr. M. A. Rahman",
      anesthetist: "Dr. Anesthesia Specialist",
      scheduledDate: "13 Sep 2026",
      time: "09:00 AM - 11:30 AM",
      status: "Scheduled (Pre-op Ready)",
    },
    {
      id: "ot-2",
      room: "OT Suite 02 (Orthopedic & Trauma)",
      patient: "Md. Rafiqul Islam (OH-000101)",
      procedure: "Open Reduction & Internal Fixation (ORIF)",
      leadSurgeon: "Dr. Orthopedic Consultant",
      anesthetist: "Dr. Anesthesia Specialist",
      scheduledDate: "13 Sep 2026",
      time: "12:00 PM - 02:30 PM",
      status: "Scheduled",
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Surgical Complex & Laparoscopy
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Operation Theater (OT) Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Surgical rosters, anesthesia clearance checklists, surgeon assignments, and sterile room allocations.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {otBookings.map((b) => (
          <div
            key={b.id}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4"
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                {b.room}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                {b.status}
              </span>
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {b.procedure}
              </h3>
              <p className="text-xs text-slate-600 font-medium mt-1">
                Patient: <strong>{b.patient}</strong>
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-700">
              <p>
                <strong>Lead Surgeon:</strong> {b.leadSurgeon}
              </p>
              <p>
                <strong>Anesthetist:</strong> {b.anesthetist}
              </p>
              <p className="flex items-center text-sky-900 font-semibold pt-1">
                <Clock className="w-3.5 h-3.5 mr-1 text-sky-600" />
                {b.scheduledDate} ({b.time})
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={() => alert(`Pre-operative check verified for ${b.patient}`)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition"
              >
                Pre-Op Checklist
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
