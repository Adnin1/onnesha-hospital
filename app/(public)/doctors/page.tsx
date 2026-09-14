"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Calendar, Phone, MapPin, Loader2, AlertCircle } from "lucide-react";
import {
  getPublicDoctorsAction,
  getPublicDepartmentsAction,
  PublicDoctor,
  PublicDepartment,
} from "@/lib/public/actions";
import { formatCurrencyBDT } from "@/lib/utils";

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
              placeholder="Search doctor by name, specialty, or degree..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
            />
          </div>

          {/* Department Filter Pills */}
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => setSelectedDept("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedDept === "all"
                  ? "bg-sky-700 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All Departments
            </button>
            {departments.slice(0, 8).map((dept) => (
              <button
                key={dept.id}
                onClick={() => setSelectedDept(dept.slug)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
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
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-2" />
            <p className="text-xs">Loading specialist consultants...</p>
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
                        {doc.full_name
                          .split(" ")
                          .slice(1, 3)
                          .map((n) => n[0])
                          .join("")}
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
                      <p className="text-[11px] text-slate-500 font-normal">
                        <strong className="text-slate-700">BMDC Reg No:</strong> {doc.bmdc_reg_number}
                      </p>
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
                          05:00 PM - 08:30 PM
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                    <Link
                      href={`/appointment?doctor=${doc.id}`}
                      className="grow flex items-center justify-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs py-2.5 rounded-lg shadow-2xs transition"
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
