"use client";

import React, { useState, useEffect } from "react";
import {
  Scissors,
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  Plus,
  Loader2,
  RefreshCw,
  AlertCircle,
  Activity,
} from "lucide-react";
import { OTBookingRecord, OTRoomRecord } from "@/types/beds-ot";
import { DoctorRecord } from "@/types/appointments";
import {
  getOTBookingsAction,
  getOTRoomsAction,
  bookOTAction,
  updateOTBookingStatusAction,
} from "@/lib/ot/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function OperationTheaterPage() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<OTBookingRecord[]>([]);
  const [rooms, setRooms] = useState<OTRoomRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Booking Form State
  const [formProcedure, setFormProcedure] = useState("");
  const [formRoomId, setFormRoomId] = useState("");
  const [formSurgeonId, setFormSurgeonId] = useState("");
  const [formAnesthesia, setFormAnesthesia] = useState("GENERAL");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("11:30");
  const [formOtCharge, setFormOtCharge] = useState(5000);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [bRes, rRes, dRes] = await Promise.all([
        getOTBookingsAction(),
        getOTRoomsAction(),
        getDoctorsAction(),
      ]);

      if (bRes.success && bRes.data) setBookings(bRes.data.bookings);
      if (rRes.success && rRes.data) {
        setRooms(rRes.data.rooms);
        if (rRes.data.rooms.length > 0 && !formRoomId) {
          setFormRoomId(rRes.data.rooms[0].id);
        }
      }
      if (dRes.success && dRes.data) {
        setDoctors(dRes.data.doctors);
        if (dRes.data.doctors.length > 0 && !formSurgeonId) {
          setFormSurgeonId(dRes.data.doctors[0].id);
        }
      }
    } catch {
      setErrorMsg("Failed to load OT roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [bRes, rRes, dRes] = await Promise.all([
          getOTBookingsAction(),
          getOTRoomsAction(),
          getDoctorsAction(),
        ]);

        if (isMounted) {
          if (bRes.success && bRes.data) {
            setBookings(bRes.data.bookings);
          } else {
            setErrorMsg(bRes.error || "Failed to load OT bookings");
          }

          if (rRes.success && rRes.data) {
            setRooms(rRes.data.rooms);
            if (rRes.data.rooms.length > 0 && !formRoomId) {
              setFormRoomId(rRes.data.rooms[0].id);
            }
          }

          if (dRes.success && dRes.data) {
            setDoctors(dRes.data.doctors);
            if (dRes.data.doctors.length > 0 && !formSurgeonId) {
              setFormSurgeonId(dRes.data.doctors[0].id);
            }
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Failed to load OT roster");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [formRoomId, formSurgeonId]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProcedure.trim()) {
      alert("Procedure name is required");
      return;
    }

    setActionLoading(true);
    try {
      const startDateTime = `${formDate}T${formStartTime}:00.000Z`;
      const endDateTime = `${formDate}T${formEndTime}:00.000Z`;

      const res = await bookOTAction({
        visitId: "00000000-0000-0000-0000-000000000000", // Emergency/Elective visit link
        otRoomId: formRoomId,
        procedureName: formProcedure,
        leadSurgeonId: formSurgeonId,
        anesthesiaType: formAnesthesia,
        scheduledStart: startDateTime,
        scheduledEnd: endDateTime,
        otCharge: Number(formOtCharge),
      });

      if (res.success) {
        setShowBookingModal(false);
        setFormProcedure("");
        await loadData();
      } else {
        alert(res.error || "Failed to schedule surgical procedure");
      }
    } catch {
      alert("Network error scheduling surgery");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (
    bookingId: string,
    status: "SCHEDULED" | "IN_SURGERY" | "COMPLETED" | "CANCELLED"
  ) => {
    setActionLoading(true);
    try {
      const res = await updateOTBookingStatusAction({ bookingId, status });
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to update surgical status");
      }
    } catch {
      alert("Error updating OT status");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh OT roster"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowBookingModal(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Book Surgery / OT Slot
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* OT ROOMS STATUS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex justify-between items-center"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {room.room_number} {room.is_major_ot ? "• Major OT" : "• Minor OT"}
              </span>
              <h4 className="font-extrabold text-slate-900 text-sm mt-0.5">{room.room_name}</h4>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                room.status === "AVAILABLE"
                  ? "bg-emerald-100 text-emerald-800"
                  : room.status === "IN_SURGERY"
                  ? "bg-rose-100 text-rose-800 animate-pulse"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {room.status}
            </span>
          </div>
        ))}
      </div>

      {/* SURGICAL BOOKINGS GRID */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 flex justify-center items-center">
          <Loader2 className="w-6 h-6 animate-spin mr-2 text-sky-600" />
          Loading surgical schedules and rosters...
        </div>
      ) : bookings.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
          No surgical procedures currently scheduled in the OT roster.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bookings.map((b) => {
            const isCompleted = b.status === "COMPLETED";
            const isInSurgery = b.status === "IN_SURGERY";
            const isCancelled = b.status === "CANCELLED";

            return (
              <div
                key={b.id}
                className={`bg-white rounded-2xl border p-6 shadow-xs space-y-4 ${
                  isInSurgery
                    ? "border-rose-300 ring-2 ring-rose-500/10"
                    : isCompleted
                    ? "border-slate-200 opacity-80"
                    : "border-slate-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                    {b.ot_room?.room_name || "OT Suite"} ({b.ot_room?.room_number || "Room"})
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      isInSurgery
                        ? "bg-rose-100 text-rose-800 animate-pulse"
                        : isCompleted
                        ? "bg-slate-100 text-slate-700"
                        : isCancelled
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {b.status}
                  </span>
                </div>

                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {b.procedure_name}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Patient:{" "}
                    <strong>
                      {b.patient?.full_name || "Registered Patient"} ({b.patient?.patient_code || "OH-PT"})
                    </strong>
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-700">
                  <p>
                    <strong>Lead Surgeon:</strong> {b.lead_surgeon?.full_name || "Assigned Surgeon"} (
                    {b.lead_surgeon?.specialization || "Surgery"})
                  </p>
                  <p>
                    <strong>Anesthesia:</strong> {b.anesthesia_type}
                  </p>
                  <p className="flex items-center text-sky-900 font-semibold pt-1">
                    <Clock className="w-3.5 h-3.5 mr-1 text-sky-600" />
                    {new Date(b.scheduled_start).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    ({new Date(b.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {new Date(b.scheduled_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                  </p>
                  <p className="text-slate-500 font-medium">
                    OT Tariff: <strong>{formatCurrencyBDT(b.ot_charge)}</strong>
                  </p>
                </div>

                {!isCompleted && !isCancelled && (
                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 text-xs">
                    {b.status === "SCHEDULED" && (
                      <button
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus(b.id, "IN_SURGERY")}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center"
                      >
                        <Activity className="w-3.5 h-3.5 mr-1" />
                        Start Surgery
                      </button>
                    )}
                    {isInSurgery && (
                      <button
                        disabled={actionLoading}
                        onClick={() => handleUpdateStatus(b.id, "COMPLETED")}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Mark Completed (Post-Op)
                      </button>
                    )}
                    <button
                      disabled={actionLoading}
                      onClick={() => handleUpdateStatus(b.id, "CANCELLED")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BOOK OT MODAL */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Schedule Surgical Procedure</h3>
            <p className="text-slate-500 mb-4">
              Allocate sterile theater room, lead surgeon, and anesthesia protocol.
            </p>

            <form onSubmit={handleCreateBooking} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Procedure Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Laparoscopic Cholecystectomy / Appendectomy"
                  value={formProcedure}
                  onChange={(e) => setFormProcedure(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">OT Room *</label>
                  <select
                    value={formRoomId}
                    onChange={(e) => setFormRoomId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_name} ({r.room_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Lead Surgeon *</label>
                  <select
                    value={formSurgeonId}
                    onChange={(e) => setFormSurgeonId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} ({d.specialization})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Anesthesia Type</label>
                  <select
                    value={formAnesthesia}
                    onChange={(e) => setFormAnesthesia(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    <option value="GENERAL">General Anesthesia (GA)</option>
                    <option value="SPINAL">Spinal Anesthesia (SA)</option>
                    <option value="EPIDURAL">Epidural</option>
                    <option value="LOCAL">Local Anesthesia (LA)</option>
                    <option value="SEDATION">MAC / Sedation</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">OT Charge (BDT)</label>
                  <input
                    type="number"
                    value={formOtCharge}
                    onChange={(e) => setFormOtCharge(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm OT Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
