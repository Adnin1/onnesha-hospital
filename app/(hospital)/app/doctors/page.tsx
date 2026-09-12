"use client";

import React, { useState } from "react";
import {
  Stethoscope,
  Plus,
  Search,
  DollarSign,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { MOCK_DOCTORS, MOCK_DEPARTMENTS } from "@/lib/mock-data";
import { Doctor } from "@/types";
import { formatCurrencyBDT } from "@/lib/utils";

export default function DoctorsAdminPage() {
  const [doctors, setDoctors] = useState<Doctor[]>(MOCK_DOCTORS);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDoctors = doctors.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return (
      doc.full_name.toLowerCase().includes(q) ||
      doc.specialization.toLowerCase().includes(q) ||
      doc.bmdc_reg_number.toLowerCase().includes(q)
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
            Manage specialist designations, BMDC registration, chamber room assignments, and consultation fee structures.
          </p>
        </div>
      </div>

      {/* Doctor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredDoctors.map((doc) => (
          <div
            key={doc.id}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-200 text-sky-800 font-bold flex items-center justify-center text-base">
                  {doc.full_name.split(" ").slice(1, 3).map((n) => n[0]).join("")}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-sky-700 uppercase bg-sky-50 px-2 py-0.5 rounded">
                    {doc.department_name}
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
                  {doc.room_number}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 mt-3 flex justify-between items-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Consultation Fee</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {formatCurrencyBDT(doc.opd_fee)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Hospital Commission</span>
                <span className="font-bold text-slate-700 text-xs">
                  {doc.commission_rate}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
