"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  AlertOctagon,
  Clock,
  UserPlus,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { registerEmergencyEncounterAction, getEmergencyCasesAction } from "@/lib/patient/actions";

interface EmergencyCaseItem {
  id: string;
  code: string;
  name: string;
  age: string;
  severity: "RED" | "YELLOW" | "GREEN";
  condition: string;
  time: string;
  assignedDoctor: string;
}

export default function EmergencyTriagePage() {
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFastIntake, setShowFastIntake] = useState(false);
  const [intakeName, setIntakeName] = useState("");
  const [intakePriority, setIntakePriority] = useState<"RED" | "YELLOW" | "GREEN">("RED");
  const [intakeComplaint, setIntakeComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchEmergencyRecords = useCallback(async () => {
    try {
      const res = await getEmergencyCasesAction();
      if (res.success && res.data) {
        interface RawEmergencyVisit {
          id: string;
          visit_number: string;
          chief_complaint?: string;
          triage_priority?: string;
          admitted_at?: string;
          created_at: string;
          doctor_id?: string;
          patients?: {
            full_name?: string;
            age_years?: number;
          };
        }
        const mapped: EmergencyCaseItem[] = (res.data as unknown as RawEmergencyVisit[]).map((v) => ({
          id: v.id,
          code: v.visit_number,
          name: v.patients?.full_name || "Unknown Patient",
          age: v.patients?.age_years ? `${v.patients.age_years} Y` : "Unspecified",
          severity: (v.triage_priority as "RED" | "YELLOW" | "GREEN") || "RED",
          condition: v.chief_complaint || "Casualty Admission",
          time: new Date(v.admitted_at || v.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          assignedDoctor: v.doctor_id ? "Specialist Assigned" : "Emergency On-Duty Officer",
        }));
        return { success: true, cases: mapped };
      } else {
        return { success: false, error: res.error || "Failed to load live emergency cases." };
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Error connecting to emergency records." };
    }
  }, []);

  const loadLiveCases = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await fetchEmergencyRecords();
    if (result.success && result.cases) {
      setEmergencyCases(result.cases);
    } else if (result.error) {
      setErrorMessage(result.error);
    }
    setLoading(false);
  }, [fetchEmergencyRecords]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const result = await fetchEmergencyRecords();
      if (isMounted) {
        if (result.success && result.cases) {
          setEmergencyCases(result.cases);
        } else if (result.error) {
          setErrorMessage(result.error);
        }
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchEmergencyRecords]);

  const handleFastIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const res = await registerEmergencyEncounterAction({
      unknownPatientName: intakeName || undefined,
      triagePriority: intakePriority,
      chiefComplaint: intakeComplaint || "Emergency Casualty Triage",
    });

    if (res.success && res.data) {
      setShowFastIntake(false);
      setIntakeName("");
      setIntakeComplaint("");
      await loadLiveCases();
    } else {
      alert(res.error || "Emergency registration failed. Please verify database sequence.");
    }
    setSubmitting(false);
  };

  const redCount = emergencyCases.filter((c) => c.severity === "RED").length;
  const yellowCount = emergencyCases.filter((c) => c.severity === "YELLOW").length;
  const greenCount = emergencyCases.filter((c) => c.severity === "GREEN").length;


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
          <div className="text-2xl font-black text-red-700 mt-1">{redCount} Active Patients</div>
          <span className="text-[10px] text-red-600 font-medium">Immediate doctor intervention required</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-xs font-bold text-amber-800 uppercase flex items-center">
            <Clock className="w-4 h-4 mr-1 text-amber-600" />
            YELLOW ZONE (Urgent / 30 Mins)
          </span>
          <div className="text-2xl font-black text-amber-700 mt-1">{yellowCount} Patients</div>
          <span className="text-[10px] text-amber-600 font-medium">Under observation & investigations</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <span className="text-xs font-bold text-emerald-800 uppercase flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
            GREEN ZONE (Minor / Non-urgent)
          </span>
          <div className="text-2xl font-black text-emerald-700 mt-1">{greenCount} Patients</div>
          <span className="text-[10px] text-emerald-600 font-medium">Triage queue clear</span>
        </div>
      </div>

      {/* Emergency Active Cases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Active Emergency Triage Cases in Casualty
          </h3>
          <button
            onClick={loadLiveCases}
            disabled={loading}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium">
            Loading real-time emergency records from database...
          </div>
        ) : emergencyCases.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl">
            No active emergency triage patients in casualty at this moment.
          </div>
        ) : (
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
        )}
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
