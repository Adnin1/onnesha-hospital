"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  MapPin,
  Calendar,
  CalendarDays,
  X,
} from "lucide-react";
import { DoctorRecord, DoctorScheduleRecord } from "@/types/appointments";
import { getDoctorsAction, getDoctorSchedulesAction } from "@/lib/appointments/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function DoctorsAdminPage() {
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorRecord | null>(null);
  const [schedules, setSchedules] = useState<DoctorScheduleRecord[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

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

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search doctor, spec, BMDC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
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
                    Chamber: {doc.room_number || "Chamber 101"}
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

            <div className="pt-4 border-t border-slate-100 text-right">
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
    </div>
  );
}

