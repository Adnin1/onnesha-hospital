"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  MapPin,
  Calendar,
  CalendarDays,
  X,
  UserPlus,
  Plus,
} from "lucide-react";
import { DoctorRecord, DoctorScheduleRecord } from "@/types/appointments";
import {
  getDoctorsAction,
  getDoctorSchedulesAction,
  createDoctorAction,
  createDoctorScheduleAction,
} from "@/lib/appointments/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function DoctorsAdminPage() {
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorRecord | null>(null);
  const [schedules, setSchedules] = useState<DoctorScheduleRecord[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Add Doctor Form State
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [docName, setDocName] = useState("");
  const [docSpec, setDocSpec] = useState("");
  const [docBmdc, setDocBmdc] = useState("");
  const [docFee, setDocFee] = useState("");
  const [docRoom, setDocRoom] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);

  // Add Schedule Form State
  const [showAddSchedModal, setShowAddSchedModal] = useState(false);
  const [schedDay, setSchedDay] = useState("0");
  const [schedStart, setSchedStart] = useState("09:00");
  const [schedEnd, setSchedEnd] = useState("13:00");
  const [schedMax, setSchedMax] = useState("30");
  const [savingSched, setSavingSched] = useState(false);

  const refreshDoctors = async () => {
    setLoading(true);
    const res = await getDoctorsAction();
    if (res.success && res.data?.doctors) {
      setDoctors(res.data.doctors);
    }
    setLoading(false);
  };

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() || !docSpec.trim() || !docBmdc.trim() || !docFee || !docRoom.trim()) return;

    setSavingDoc(true);
    try {
      const res = await createDoctorAction({
        fullName: docName.trim(),
        specialization: docSpec.trim(),
        bmdcRegNumber: docBmdc.trim(),
        consultationFee: parseFloat(docFee),
        roomNumber: docRoom.trim(),
      });

      if (res.success) {
        setDocName("");
        setDocSpec("");
        setDocBmdc("");
        setDocFee("");
        setDocRoom("");
        setShowAddDoctorModal(false);
        await refreshDoctors();
      } else {
        alert("Failed to create doctor: " + (res.error || "Unknown error"));
      }
    } catch {
      alert("Network error creating doctor");
    } finally {
      setSavingDoc(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) return;

    setSavingSched(true);
    try {
      const res = await createDoctorScheduleAction({
        doctorId: selectedDoctor.id,
        dayOfWeek: parseInt(schedDay),
        startTime: schedStart,
        endTime: schedEnd,
        maxPatients: parseInt(schedMax) || 30,
        roomNumber: selectedDoctor.room_number,
        isPublished: true,
      });

      if (res.success) {
        setShowAddSchedModal(false);
        const schedRes = await getDoctorSchedulesAction(selectedDoctor.id);
        if (schedRes.success && schedRes.data?.schedules) {
          setSchedules(schedRes.data.schedules);
        }
      } else {
        alert("Failed to publish schedule: " + (res.error || "Unknown error"));
      }
    } catch {
      alert("Network error publishing schedule");
    } finally {
      setSavingSched(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function loadDoctors() {
      setLoading(true);
      const res = await getDoctorsAction();
      if (mounted && res.success && res.data?.doctors) {
        setDoctors(res.data.doctors);
      }
      if (mounted) setLoading(false);
    }
    loadDoctors();
    return () => {
      mounted = false;
    };
  }, []);

  const handleOpenSchedules = async (doc: DoctorRecord) => {
    setSelectedDoctor(doc);
    setScheduleLoading(true);
    const res = await getDoctorSchedulesAction(doc.id);
    if (res.success && res.data?.schedules) {
      setSchedules(res.data.schedules);
    } else {
      setSchedules([]);
    }
    setScheduleLoading(false);
  };

  const filteredDoctors = doctors.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return (
      doc.full_name.toLowerCase().includes(q) ||
      doc.specialization.toLowerCase().includes(q) ||
      doc.bmdc_reg_number.toLowerCase().includes(q) ||
      (doc.department_name && doc.department_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Clinical Roster & Faculty
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Doctors & OPD Chamber Schedules
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime specialist registry, BMDC registration credentials, room allocations, and weekly chamber visiting schedules.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search doctor, spec, BMDC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <button
            onClick={() => setShowAddDoctorModal(true)}
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs flex items-center shrink-0 shadow-xs"
          >
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Doctor
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-2xl border border-slate-200" />
          ))}
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <CalendarDays className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">No active doctors found</p>
          <p className="text-xs mt-1">Doctors registered in your hospital organization will appear here.</p>
        </div>
      ) : (
        /* Doctor Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:border-sky-300 transition"
            >
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-200 text-sky-800 font-bold flex items-center justify-center text-base">
                    {doc.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-sky-700 uppercase bg-sky-50 px-2 py-0.5 rounded">
                      {doc.department_name || "Specialist"}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{doc.full_name}</h3>
                  </div>
                </div>

                <div className="text-xs space-y-1 text-slate-600 py-2 border-t border-slate-100">
                  <p><strong>Designation:</strong> {doc.designation}</p>
                  <p className="text-[11px] text-slate-500">{doc.degrees}</p>
                  <p><strong>BMDC Reg:</strong> {doc.bmdc_reg_number}</p>
                  <p className="flex items-center text-slate-800 font-medium">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-sky-600" />
                    Chamber: {doc.room_number || "Unassigned"}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 mt-3 flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">OPD Fee</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {formatCurrencyBDT(doc.opd_fee)}
                  </span>
                </div>
                <button
                  onClick={() => handleOpenSchedules(doc)}
                  className="inline-flex items-center text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  View Visiting Hours
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Modal */}
      {selectedDoctor && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Visiting Hours & Slots</h2>
                <p className="text-xs text-slate-500">{selectedDoctor.full_name} ({selectedDoctor.room_number})</p>
              </div>
              <button
                onClick={() => setSelectedDoctor(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4">
              {scheduleLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading visiting schedule...</div>
              ) : schedules.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <Calendar className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No recurring visiting hours set for this doctor.
                </div>
              ) : (
                <div className="space-y-2">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800 uppercase">{s.day_of_week}</span>
                        <p className="text-slate-500 mt-0.5">
                          {s.start_time} - {s.end_time} ({s.avg_consultation_minutes} mins/consultation)
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Max Tokens</span>
                        <span className="font-bold text-sky-700">{s.max_tokens} Patients</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={() => setShowAddSchedModal(true)}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" /> Add / Publish Schedule
              </button>
              <button
                onClick={() => setSelectedDoctor(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Doctor Modal */}
      {showAddDoctorModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Add Specialist Doctor</h2>
              <button onClick={() => setShowAddDoctorModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDoctor} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Mahin Khan"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Specialization</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cardiology"
                    value={docSpec}
                    onChange={(e) => setDocSpec(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">BMDC Reg No.</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A-12345"
                    value={docBmdc}
                    onChange={(e) => setDocBmdc(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">OPD Fee (BDT)</label>
                  <input
                    type="number"
                    required
                    value={docFee}
                    onChange={(e) => setDocFee(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Room / Chamber</label>
                  <input
                    type="text"
                    value={docRoom}
                    onChange={(e) => setDocRoom(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDoc}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs disabled:opacity-50"
                >
                  {savingDoc ? "Saving..." : "Save Doctor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {showAddSchedModal && selectedDoctor && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Publish Schedule</h2>
              <button onClick={() => setShowAddSchedModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Day of Week</label>
                <select
                  value={schedDay}
                  onChange={(e) => setSchedDay(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={schedStart}
                    onChange={(e) => setSchedStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={schedEnd}
                    onChange={(e) => setSchedEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Max Patients / Tokens Limit</label>
                <input
                  type="number"
                  required
                  value={schedMax}
                  onChange={(e) => setSchedMax(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddSchedModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSched}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs disabled:opacity-50"
                >
                  {savingSched ? "Publishing..." : "Publish Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

