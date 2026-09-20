"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  MessageSquare,
  Volume2,
  CheckCircle2,
  X,
  Users,
  RefreshCw,
} from "lucide-react";
import { DoctorRecord, WaitingQueueRecord } from "@/types/appointments";
import { PatientMaster } from "@/types/clinical";
import {
  getDoctorsAction,
  getLiveWaitingQueueAction,
  bookAppointmentAction,
  updateQueueStatusAction,
} from "@/lib/appointments/actions";
import { searchPatientsAction } from "@/lib/patient/actions";

export default function AppointmentsQueuePage() {
  const [queue, setQueue] = useState<WaitingQueueRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Walk-in modal state
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [modalDoctorId, setModalDoctorId] = useState<string>("");
  const [modalPatientId, setModalPatientId] = useState<string>("");
  const [modalNotes, setModalNotes] = useState("");
  const [smsAlertToast, setSmsAlertToast] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function initData() {
      setLoading(true);
      const [docRes, patRes, qRes] = await Promise.all([
        getDoctorsAction(),
        searchPatientsAction({ pageSize: 50 }),
        getLiveWaitingQueueAction(selectedDoctorId || undefined),
      ]);

      if (mounted) {
        if (docRes.success && docRes.data?.doctors) {
          setDoctors(docRes.data.doctors);
          if (!selectedDoctorId && docRes.data.doctors.length > 0) {
            setModalDoctorId(docRes.data.doctors[0].id);
          }
        }
        if (patRes.success && patRes.data?.patients) {
          setPatients(patRes.data.patients);
          if (patRes.data.patients.length > 0) {
            setModalPatientId(patRes.data.patients[0].id);
          }
        }
        if (qRes.success && qRes.data?.queue) {
          setQueue(qRes.data.queue);
        }
        setLoading(false);
      }
    }
    initData();
    return () => {
      mounted = false;
    };
  }, [selectedDoctorId, refreshIndex]);

  const handleGenerateWalkInToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalDoctorId || !modalPatientId) {
      alert("Please select both a doctor and a registered patient.");
      return;
    }

    setSubmitting(true);
    const res = await bookAppointmentAction({
      doctorId: modalDoctorId,
      patientId: modalPatientId,
      source: "WALKIN",
      notes: modalNotes || undefined,
    });

    setSubmitting(false);

    if (!res.success) {
      alert(res.error || "Failed to book appointment and generate token.");
      return;
    }

    const tokenNo = res.data?.tokenNumber;
    const doc = doctors.find((d) => d.id === modalDoctorId);
    const pat = patients.find((p) => p.id === modalPatientId);

    setIsWalkInModalOpen(false);
    setModalNotes("");
    setRefreshIndex((prev) => prev + 1);

    if (pat && doc) {
      setSmsAlertToast(
        `SMS Sent to ${pat.phone}: "Onnesha Hospital: Token #${tokenNo} assigned for ${doc.full_name} (${doc.room_number}). Please wait in OPD lobby."`
      );
      setTimeout(() => setSmsAlertToast(""), 6000);
    }
  };

  const handleStatusChange = async (
    queueId: string,
    newStatus: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED"
  ) => {
    const res = await updateQueueStatusAction({
      queueId,
      status: newStatus,
    });

    if (res.success) {
      setQueue((prev) =>
        prev
          .map((q) => (q.id === queueId ? { ...q, queue_status: newStatus } : q))
          .filter((q) => !["COMPLETED", "SKIPPED"].includes(q.queue_status))
      );
    } else {
      alert(res.error || "Failed to update queue status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Reception & Chamber Queue Management
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Appointments & Walk-In Token Allocator
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Concurrency-safe token numbering for walk-in OPD patients and realtime doctor chamber dispatch.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setRefreshIndex((p) => p + 1)}
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
            title="Refresh Queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsWalkInModalOpen(true)}
            className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Issue Walk-In Token
          </button>
        </div>
      </div>

      {/* SMS Simulation Toast */}
      {smsAlertToast && (
        <div className="p-4 bg-sky-50 border border-sky-300 text-sky-950 rounded-2xl text-xs flex items-center space-x-2 animate-bounce">
          <MessageSquare className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="font-medium">{smsAlertToast}</span>
        </div>
      )}

      {/* Filter Doctor Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-700">Filter by Doctor:</span>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="p-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-800"
          >
            <option value="">All Doctors & Chambers</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name} ({d.department_name || "General"})
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Active Queue: <strong>{queue.length}</strong> patients waiting
        </span>
      </div>

      {/* Main Queue Management Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Live Waiting Queue
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading active queue...</div>
        ) : queue.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">Queue is currently clear</p>
            <p className="text-xs mt-0.5">Click &quot;Issue Walk-In Token&quot; to assign the next patient serial.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Token #</th>
                  <th className="py-3 px-4">Patient Name & Code</th>
                  <th className="py-3 px-4">Doctor</th>
                  <th className="py-3 px-4">Chamber</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Queue Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-mono font-black text-sm text-sky-900">
                      #{item.token_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{item.patient_name}</div>
                      <div className="text-[10px] text-slate-400">{item.patient_code} • {item.patient_phone}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{item.doctor_name}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-600">
                      {item.room_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.queue_status === "IN_ROOM"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.queue_status === "CALLED"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {item.queue_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleStatusChange(item.id, "CALLED")}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition inline-flex items-center"
                      >
                        <Volume2 className="w-3 h-3 mr-1" />
                        Call
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, "IN_ROOM")}
                        className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold transition"
                      >
                        In Chamber
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, "COMPLETED")}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition inline-flex items-center"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Done
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, "SKIPPED")}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition"
                      >
                        Skip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* WALK-IN TOKEN MODAL */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Issue Walk-In OPD Token
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Direct serial generator for reception desk patients.
                </p>
              </div>
              <button
                onClick={() => setIsWalkInModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateWalkInToken} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Consulting Doctor *
                </label>
                <select
                  value={modalDoctorId}
                  onChange={(e) => setModalDoctorId(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                  required
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.department_name || "General"}) - {d.room_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Registered Patient *
                </label>
                <select
                  value={modalPatientId}
                  onChange={(e) => setModalPatientId(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                  required
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient_code} - {p.full_name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chief Complaint / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fever for 3 days, acute headache"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsWalkInModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm"
                >
                  {submitting ? "Allocating Token..." : "Issue Token & Send SMS"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

