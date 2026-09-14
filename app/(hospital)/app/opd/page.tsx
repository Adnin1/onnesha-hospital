"use client";

import React, { useState, useEffect } from "react";
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
  Loader2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { WaitingQueueRecord } from "@/types/appointments";
import { getLiveWaitingQueueAction, updateQueueStatusAction } from "@/lib/appointments/actions";
import { recordVitalsAction, createClinicalNoteAction } from "@/lib/patient/actions";

export default function OPDConsultationPage() {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<WaitingQueueRecord[]>([]);
  const [activeQueueItem, setActiveQueueItem] = useState<WaitingQueueRecord | null>(null);

  // Vitals State
  const [bp, setBp] = useState("120/80");
  const [pulse, setPulse] = useState("76");
  const [temp, setTemp] = useState("98.4");
  const [weight, setWeight] = useState("70");
  const [notes, setNotes] = useState("Patient presented for routine outpatient clinical evaluation.");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getLiveWaitingQueueAction();
      if (res.success && res.data) {
        setQueue(res.data.queue);
        if (res.data.queue.length > 0 && !activeQueueItem) {
          setActiveQueueItem(res.data.queue[0]);
        }
      } else {
        setErrorMsg(res.error || "Failed to load OPD queue");
      }
    } catch {
      setErrorMsg("Network error loading waiting queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await getLiveWaitingQueueAction();
        if (isMounted) {
          if (res.success && res.data) {
            setQueue(res.data.queue);
            if (res.data.queue.length > 0 && !activeQueueItem) {
              setActiveQueueItem(res.data.queue[0]);
            }
          } else {
            setErrorMsg(res.error || "Failed to load OPD queue");
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Network error loading waiting queue");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [activeQueueItem]);

  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQueueItem) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const [sys, dia] = bp.split("/").map((n) => parseInt(n.trim()));
      const pulseVal = parseInt(pulse) || undefined;
      const tempVal = parseFloat(temp) || undefined;
      const tempC = tempVal ? (tempVal > 50 ? Math.round(((tempVal - 32) * 5) / 9 * 10) / 10 : tempVal) : undefined;
      const weightVal = parseFloat(weight) || undefined;

      const res = await recordVitalsAction({
        visitId: activeQueueItem.visit_id || activeQueueItem.id,
        systolicBp: sys || undefined,
        diastolicBp: dia || undefined,
        pulseRate: pulseVal,
        temperatureC: tempC,
        weightKg: weightVal,
      });

      if (res.success) {
        if (notes.trim()) {
          await createClinicalNoteAction({
            patientId: activeQueueItem.patient?.id || activeQueueItem.id,
            visitId: activeQueueItem.visit_id || activeQueueItem.id,
            noteContent: notes.trim(),
            noteType: "PROGRESS",
          });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        alert(res.error || "Failed to record vitals");
      }
    } catch {
      alert("Error saving vitals to database");
    } finally {
      setSaving(false);
    }
  };

  const handleCallIn = async (item: WaitingQueueRecord) => {
    setActiveQueueItem(item);
    try {
      await updateQueueStatusAction({
        queueId: item.id,
        status: "IN_ROOM",
      });
      await loadQueue();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Clinical Examination & Vitals Recording
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Outpatient (OPD) Consultation Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time chamber queue, electronic vitals capture, and instant Patient 360 link.
          </p>
        </div>

        <button
          onClick={loadQueue}
          className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition flex items-center text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Chamber Queue
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Main Grid: Queue on Left, Vitals on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Waiting Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center justify-between">
              <span>Today&apos;s Live Queue ({queue.length})</span>
              <span className="text-sky-600 lowercase font-normal">Real-time</span>
            </h3>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs flex justify-center items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2 text-sky-600" />
                Loading OPD queue...
              </div>
            ) : queue.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No patients waiting in chamber queue right now.
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((item) => {
                  const isSelected = activeQueueItem?.id === item.id;
                  const isConsulting = item.status === "IN_CONSULTATION";

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleCallIn(item)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex justify-between items-center ${
                        isSelected
                          ? "bg-sky-50/70 border-sky-300 ring-2 ring-sky-500/20"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-xs">
                          {item.token_number}
                        </span>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900">
                            {item.patient?.full_name || "Registered Patient"}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {item.patient?.patient_code} • Ph: {item.patient?.phone}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isConsulting
                              ? "bg-rose-100 text-rose-800 animate-pulse"
                              : item.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.status}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Room {item.doctor?.room_number || "101"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Vitals Recording Console (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-rose-500" />
                Patient Vital Signs & Triage Observations
              </h3>
              {activeQueueItem?.patient && (
                <Link
                  href={`/app/patients?id=${activeQueueItem.patient.id || ""}`}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 underline"
                >
                  View Patient 360 →
                </Link>
              )}
            </div>

            {activeQueueItem ? (
              <div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl mb-4 text-xs flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Active In Chamber:</span>
                    <h4 className="font-extrabold text-slate-900 text-sm">
                      {activeQueueItem.patient?.full_name} ({activeQueueItem.patient?.patient_code})
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Serial Token</span>
                    <p className="font-mono font-black text-sky-600 text-base">#{activeQueueItem.token_number}</p>
                  </div>
                </div>

                {saved && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold mb-4 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Vital signs captured and committed to patient medical history!</span>
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
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                    ></textarea>
                  </div>

                  <div className="pt-2 flex justify-end space-x-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition flex items-center"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                      Save Vitals to EMR
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                Select a patient from the queue to start consultation and capture vitals.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
