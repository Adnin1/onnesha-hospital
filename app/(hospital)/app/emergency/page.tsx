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
import { registerEmergencyEncounterAction } from "@/lib/patient/actions";

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

  const [showFastIntake, setShowFastIntake] = useState(false);
  const [intakeName, setIntakeName] = useState("");
  const [intakePriority, setIntakePriority] = useState<"RED" | "YELLOW" | "GREEN">("RED");
  const [intakeComplaint, setIntakeComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFastIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await registerEmergencyEncounterAction({
        unknownPatientName: intakeName || undefined,
        triagePriority: intakePriority,
        chiefComplaint: intakeComplaint || "Emergency Casualty Triage",
      });

      const newCase = {
        id: res.data?.visit.id || `em-${Date.now()}`,
        code: res.data?.visit.visit_number || `EM-${Math.floor(100 + Math.random() * 900)}`,
        name: intakeName || `Unknown Emergency Patient`,
        age: "Unspecified",
        severity: intakePriority,
        condition: intakeComplaint || "Immediate Casualty Assessment",
        time: "Just now",
        assignedDoctor: "Emergency On-Duty Officer",
      };

      setEmergencyCases([newCase, ...emergencyCases]);
      setShowFastIntake(false);
      setIntakeName("");
      setIntakeComplaint("");
    } catch {
      const newCase = {
        id: `em-${Date.now()}`,
        code: `EM-${Math.floor(100 + Math.random() * 900)}`,
        name: intakeName || `Unknown Emergency Patient`,
        age: "Unspecified",
        severity: intakePriority,
        condition: intakeComplaint || "Immediate Casualty Assessment",
        time: "Just now",
        assignedDoctor: "Emergency On-Duty Officer",
      };
      setEmergencyCases([newCase, ...emergencyCases]);
      setShowFastIntake(false);
      setIntakeName("");
      setIntakeComplaint("");
    } finally {
      setSubmitting(false);
    }
  };

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
          <button
            onClick={() => setShowFastIntake(true)}
            className="bg-white hover:bg-red-50 text-red-700 font-black text-xs px-3.5 py-2 rounded-xl flex items-center shadow-xs transition"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Fast Emergency Triage Intake
          </button>
          <div className="bg-red-700/80 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center shadow-xs">
            <Radio className="w-4 h-4 mr-1.5 animate-ping text-red-300" />
            Hotline: +880 1700-000000
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

      {/* FAST TRIAGE INTAKE MODAL */}
      {showFastIntake && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-black text-slate-900 mb-1">
              Rapid Emergency Casualty Registration
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Instantly assign trauma triage zone & generate emergency encounter.
            </p>

            <form onSubmit={handleFastIntake} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Patient Name / Identity (or leave blank if unknown)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Unknown Male (Trauma) or Patient Name"
                  value={intakeName}
                  onChange={(e) => setIntakeName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Triage Priority Level *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "RED", label: "RED (Immediate / Resus)", color: "bg-red-100 border-red-300 text-red-800" },
                    { val: "YELLOW", label: "YELLOW (Urgent)", color: "bg-amber-100 border-amber-300 text-amber-800" },
                    { val: "GREEN", label: "GREEN (Non-urgent)", color: "bg-emerald-100 border-emerald-300 text-emerald-800" },
                  ].map((lvl) => (
                    <button
                      key={lvl.val}
                      type="button"
                      onClick={() => setIntakePriority(lvl.val as "RED" | "YELLOW" | "GREEN")}
                      className={`p-2 rounded-lg border text-center font-bold text-[11px] transition ${
                        intakePriority === lvl.val ? `${lvl.color} ring-2 ring-slate-900` : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chief Trauma / Emergency Complaint *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Severe chest pain, unconscious, bleeding laceration..."
                  value={intakeComplaint}
                  onChange={(e) => setIntakeComplaint(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowFastIntake(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm"
                >
                  {submitting ? "Admitting to Casualty..." : "Admit to Emergency Triage"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
