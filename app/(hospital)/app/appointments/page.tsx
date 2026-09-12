"use client";

import React, { useState } from "react";
import {
  CalendarClock,
  Plus,
  Phone,
  Clock,
  Search,
  CheckCircle2,
  Volume2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import {
  MOCK_WAITING_QUEUE,
  MOCK_DOCTORS,
  MOCK_PATIENTS,
} from "@/lib/mock-data";
import { WaitingQueueItem } from "@/types";

export default function AppointmentsQueuePage() {
  const [queue, setQueue] = useState<WaitingQueueItem[]>(MOCK_WAITING_QUEUE);
  const [selectedDoctorId, setSelectedDoctorId] = useState(MOCK_DOCTORS[0].id);
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [walkInPatientName, setWalkInPatientName] = useState("");
  const [walkInPatientPhone, setWalkInPatientPhone] = useState("");
  const [smsAlertToast, setSmsAlertToast] = useState("");

  const selectedDoctor =
    MOCK_DOCTORS.find((d) => d.id === selectedDoctorId) || MOCK_DOCTORS[0];

  const handleGenerateWalkInToken = (e: React.FormEvent) => {
    e.preventDefault();
    const prefix = selectedDoctor.doctor_code.replace("DOC-", "T");
    const tokenNo = `${prefix}-${Math.floor(Math.random() * 80) + 20}`;

    const newQueueItem: WaitingQueueItem = {
      id: `q-${Date.now()}`,
      organization_id: "a0000000-0000-0000-0000-000000000001",
      doctor_id: selectedDoctor.id,
      doctor_name: selectedDoctor.full_name,
      room_number: selectedDoctor.room_number,
      appointment_id: `apt-${Date.now()}`,
      patient_name: walkInPatientName,
      token_number: tokenNo,
      status: "waiting",
    };

    setQueue([...queue, newQueueItem]);
    setIsWalkInModalOpen(false);
    setWalkInPatientName("");
    setWalkInPatientPhone("");

    setSmsAlertToast(
      `SMS Sent to ${walkInPatientPhone}: "Onnesha Hospital: Token ${tokenNo} assigned for ${selectedDoctor.full_name}. Please wait in lobby."`
    );
    setTimeout(() => setSmsAlertToast(""), 5000);
  };

  const handleStatusChange = (
    id: string,
    newStatus: "waiting" | "calling" | "serving" | "done" | "skipped"
  ) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: newStatus } : q))
    );
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
            Instant token generation for walk-in OPD patients and realtime doctor chamber dispatch.
          </p>
        </div>

        <button
          onClick={() => setIsWalkInModalOpen(true)}
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Issue Walk-In Token
        </button>
      </div>

      {/* SMS Simulation Toast */}
      {smsAlertToast && (
        <div className="p-4 bg-sky-50 border border-sky-300 text-sky-950 rounded-2xl text-xs flex items-center space-x-2 animate-bounce">
          <MessageSquare className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="font-medium">{smsAlertToast}</span>
        </div>
      )}

      {/* Main Queue Management Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Active Patients in Waiting Queue (Total: {queue.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
              <tr>
                <th className="py-3 px-4">Token #</th>
                <th className="py-3 px-4">Patient Name</th>
                <th className="py-3 px-4">Doctor & Specialty</th>
                <th className="py-3 px-4">Chamber</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Queue Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="py-3.5 px-4 font-mono font-black text-sm text-sky-900">
                    {item.token_number}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {item.patient_name}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{item.doctor_name}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-600">
                    {item.room_number}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.status === "serving"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "calling"
                          ? "bg-amber-100 text-amber-800"
                          : item.status === "done"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-1">
                    <button
                      onClick={() => handleStatusChange(item.id, "calling")}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold transition"
                    >
                      Call
                    </button>
                    <button
                      onClick={() => handleStatusChange(item.id, "serving")}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition"
                    >
                      Serving
                    </button>
                    <button
                      onClick={() => handleStatusChange(item.id, "done")}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[10px] font-bold transition"
                    >
                      Done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* WALK-IN TOKEN MODAL */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">
              Issue Walk-In OPD Token
            </h3>
            <p className="text-slate-500 mb-4">
              Direct serial generator for reception desk patients.
            </p>

            <form onSubmit={handleGenerateWalkInToken} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Consulting Doctor *
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                >
                  {MOCK_DOCTORS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.department_name}) - {d.room_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Salma Begum"
                  value={walkInPatientName}
                  onChange={(e) => setWalkInPatientName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Contact Phone Number (For SMS Token) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="01XXXXXXXXX"
                  value={walkInPatientPhone}
                  onChange={(e) => setWalkInPatientPhone(e.target.value)}
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
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Print Token & Dispatch SMS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
