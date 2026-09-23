"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Calendar, MapPin, AlertCircle } from "lucide-react";
import {
  getPublicDoctorsAction,
  getPublicDepartmentsAction,
  PublicDoctor,
  PublicDepartment,
} from "@/lib/public/actions";
import { formatCurrencyBDT } from "@/lib/utils";

function getDoctorInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const meaningful = parts[0].toLowerCase().replace(/\./g, "").startsWith("dr") ? parts.slice(1) : parts;
  if (meaningful.length === 0) return parts[0].slice(0, 2).toUpperCase();
  return meaningful.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "DR";
}

export default function DoctorsDirectoryPage() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [departments, setDepartments] = useState<PublicDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const [docRes, deptRes] = await Promise.all([
        getPublicDoctorsAction(),
        getPublicDepartmentsAction(),
      ]);

      if (isMounted) {
        if (docRes.success) {
          setDoctors(docRes.doctors);
        } else {
          setError(docRes.error || "Unable to load consultant directory");
        }

        if (deptRes.success) {
          setDepartments(deptRes.departments);
        }
        setLoading(false);
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredDoctors = doctors.filter((doc) => {
    const matchesSearch =
      doc.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.degrees.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.department_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept =
      selectedDept === "all" ||
      doc.department_slug === selectedDept ||
      doc.department_name.toLowerCase() === selectedDept.toLowerCase();

    return matchesSearch && matchesDept;
  });

  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Specialist Consultants & Doctors
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Find the right specialist, view chamber visiting hours, and book your OPD serial token online.
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 mb-8 flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input
              type="text"
              aria-label="Search doctor by name, specialty, or degree"
              placeholder="Search doctor by name, specialty, or degree..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
            />
          </div>

          {/* Department Filter Pills */}
          <div className="flex flex-wrap gap-2 w-full md:w-auto min-h-[44px]">
            <button
              type="button"
              onClick={() => setSelectedDept("all")}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                selectedDept === "all"
                  ? "bg-sky-700 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All Departments
            </button>
            {departments.length === 0 && loading && (
              <>
                <div className="h-[44px] w-28 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-[44px] w-32 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-[44px] w-24 bg-slate-100 rounded-lg animate-pulse" />
              </>
            )}
            {departments.slice(0, 8).map((dept) => (
              <button
                type="button"
                key={dept.id}
                onClick={() => setSelectedDept(dept.slug)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium transition min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  selectedDept === dept.slug
                    ? "bg-sky-700 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse mb-8" aria-busy="true" aria-label="Loading specialist consultants">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-slate-200 p-6 min-h-[360px] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start space-x-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-200 shrink-0" />
                    <div className="space-y-2 grow">
                      <div className="h-4 bg-slate-200 rounded w-20" />
                      <div className="h-5 bg-slate-200 rounded w-36" />
                      <div className="h-3.5 bg-slate-200 rounded w-28" />
                    </div>
                  </div>
                  <div className="space-y-2 py-3 border-y border-slate-100">
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-4/5" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-10 bg-slate-200 rounded-lg mt-4" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center space-x-2 mb-8">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Doctor Grid */}
        {!loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDoctors.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-6">
                    <div className="flex items-start space-x-4 mb-4">
                      <div className="w-16 h-16 rounded-2xl bg-sky-100 border-2 border-sky-200 flex items-center justify-center font-bold text-sky-800 text-xl shrink-0 shadow-2xs">
                        {getDoctorInitials(doc.full_name)}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                          {doc.department_name}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-1">
                          {doc.full_name}
                        </h3>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          {doc.specialization}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 py-3 border-y border-slate-100">
                      <p className="text-[11px] text-slate-500 font-normal">
                        <strong className="text-slate-700">Degrees:</strong> {doc.degrees}
                      </p>
                      {doc.bmdc_reg_number && (
                        <p className="text-[11px] text-slate-500 font-normal">
                          <strong className="text-slate-700">BMDC Reg No:</strong> {doc.bmdc_reg_number}
                        </p>
                      )}
                      <p className="flex items-center text-[11px] text-slate-700 font-medium mt-1">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-sky-600" />
                        Chamber: {doc.room_number}
                      </p>
                    </div>

                    <div className="mt-4 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Consultation Fee</span>
                        <span className="text-base font-bold text-emerald-700">
                          {formatCurrencyBDT(doc.opd_fee)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-slate-500 block">Visiting Hours</span>
                        <span className="text-xs font-semibold text-slate-800">
                          {doc.visiting_hours_text || "Schedule on request"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                    <Link
                      href={`/appointment?doctor=${doc.id}`}
                      className="grow flex items-center justify-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs py-2.5 min-h-[44px] rounded-lg shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <Calendar className="w-3.5 h-3.5 mr-1.5" />
                      Book Serial Online
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {filteredDoctors.length === 0 && (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-500 text-sm">No doctors match your search query.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
