"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Calendar,
  MapPin,
  AlertCircle,
  RotateCcw,
  X,
  Clock,
  Phone,
  UserX,
  CheckCircle2,
  Filter,
} from "lucide-react";
import {
  getPublicDoctorsAction,
  getPublicDepartmentsAction,
  PublicDoctor,
  PublicDepartment,
} from "@/lib/public/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import { HOSPITAL_METADATA } from "@/config/hospital";

function getDoctorInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const meaningful = parts[0].toLowerCase().replace(/\./g, "").startsWith("dr")
    ? parts.slice(1)
    : parts;
  if (meaningful.length === 0) return parts[0].slice(0, 2).toUpperCase();
  return meaningful.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "DR";
}

function normalizeSlug(str: string): string {
  return str.toLowerCase().trim().replace(/[\s_]+/g, "-");
}

function DoctorsLoadingSkeleton() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Semantic Header with h1 for Static Export & Screen Readers */}
        <header className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100/80 text-sky-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
            <span>Verified Consultants &amp; Specialists</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Specialist Consultants &amp; Doctors
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Find the right medical specialist, review OPD chamber visiting hours, and book your outpatient serial token online.
          </p>
        </header>

        {/* Filter Skeleton */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 mb-8 flex flex-col md:flex-row gap-4 justify-between items-center animate-pulse">
          <div className="w-full md:w-96 h-11 bg-slate-100 rounded-lg" />
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="h-11 w-28 bg-slate-100 rounded-lg" />
            <div className="h-11 w-32 bg-slate-100 rounded-lg" />
            <div className="h-11 w-28 bg-slate-100 rounded-lg" />
            <div className="h-11 w-24 bg-slate-100 rounded-lg" />
          </div>
        </div>

        {/* Doctor Grid Skeleton */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse mb-8"
          aria-busy="true"
          aria-label="Loading specialist consultants"
        >
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
                    <div className="h-5 bg-slate-200 rounded w-40" />
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
      </div>
    </div>
  );
}

function DoctorsDirectoryContent() {
  const searchParams = useSearchParams();

  // Read URL query parameters for deep linking
  const deptParam = searchParams.get("department") || searchParams.get("dept");
  const queryParam = searchParams.get("search") || searchParams.get("q");
  const doctorDeepLinkParam = searchParams.get("doctor");

  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [departments, setDepartments] = useState<PublicDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");

  // Sync state with URL params on mount or when searchParams change
  useEffect(() => {
    if (deptParam) {
      setSelectedDept(deptParam.trim());
    }
    if (queryParam) {
      setSearchQuery(queryParam.trim());
    }
  }, [deptParam, queryParam]);

  // Load public doctor and department data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docRes, deptRes] = await Promise.all([
        getPublicDoctorsAction(),
        getPublicDepartmentsAction(),
      ]);

      if (docRes.success) {
        setDoctors(docRes.doctors);
      } else {
        setError(docRes.error || "Unable to load consultant directory. Please check your connection.");
      }

      if (deptRes.success) {
        setDepartments(deptRes.departments);
      }
    } catch (err: unknown) {
      console.error("[DoctorsDirectoryPage loadData exception]", err);
      setError("An unexpected error occurred while loading doctor directory. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filtered doctors list
  const filteredDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const targetDept = selectedDept.toLowerCase().trim();

    return doctors.filter((doc) => {
      // 1. Search Query filter (checks full_name, specialization, degrees, department, designation, room)
      const matchesSearch =
        !q ||
        doc.full_name.toLowerCase().includes(q) ||
        doc.specialization.toLowerCase().includes(q) ||
        doc.degrees.toLowerCase().includes(q) ||
        doc.department_name.toLowerCase().includes(q) ||
        (doc.designation && doc.designation.toLowerCase().includes(q)) ||
        (doc.room_number && doc.room_number.toLowerCase().includes(q));

      // 2. Department filter
      let matchesDept = true;
      if (targetDept !== "all") {
        const docDeptSlug = (doc.department_slug || "").toLowerCase();
        const docDeptName = doc.department_name.toLowerCase();
        const normTarget = normalizeSlug(targetDept);

        matchesDept =
          docDeptSlug === targetDept ||
          docDeptSlug === normTarget ||
          docDeptName === targetDept ||
          normalizeSlug(docDeptName) === normTarget ||
          docDeptSlug.includes(normTarget) ||
          normTarget.includes(docDeptSlug);
      }

      return matchesSearch && matchesDept;
    });
  }, [doctors, searchQuery, selectedDept]);

  // Check if a doctor matching the doctor query parameter is found
  const highlightedDoctorId = useMemo(() => {
    if (!doctorDeepLinkParam) return null;
    const match = doctors.find((d) => d.id === doctorDeepLinkParam);
    return match ? match.id : null;
  }, [doctors, doctorDeepLinkParam]);

  // Clear all active filters
  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedDept("all");
  };

  // Get department display name for currently selected filter
  const currentDeptDisplayName = useMemo(() => {
    if (selectedDept === "all") return "All Departments";
    const found = departments.find(
      (d) =>
        d.slug.toLowerCase() === selectedDept.toLowerCase() ||
        normalizeSlug(d.slug) === normalizeSlug(selectedDept) ||
        d.name.toLowerCase() === selectedDept.toLowerCase()
    );
    return found ? found.name : selectedDept;
  }, [selectedDept, departments]);

  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100/80 text-sky-800 text-xs font-semibold uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
            <span>Verified Consultants &amp; Specialists</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Specialist Consultants &amp; Doctors
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Find the right medical specialist, review OPD chamber visiting hours, and book your outpatient serial token online.
          </p>
        </header>

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 mb-8 flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" aria-hidden="true" />
            <input
              type="text"
              aria-label="Search doctor by name, specialty, or degree"
              placeholder="Search doctor by name, specialty, or degree..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50 text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search input"
                className="absolute right-2.5 top-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Department Filter Pills */}
          <div
            className="flex flex-wrap gap-2 w-full md:w-auto min-h-[44px] items-center"
            role="toolbar"
            aria-label="Department filters"
          >
            <button
              type="button"
              onClick={() => setSelectedDept("all")}
              aria-pressed={selectedDept === "all"}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                selectedDept === "all"
                  ? "bg-sky-700 text-white shadow-2xs font-semibold"
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
            {departments.map((dept) => {
              const isActive =
                selectedDept.toLowerCase() === dept.slug.toLowerCase() ||
                normalizeSlug(selectedDept) === normalizeSlug(dept.slug) ||
                selectedDept.toLowerCase() === dept.name.toLowerCase();

              return (
                <button
                  type="button"
                  key={dept.id}
                  onClick={() => setSelectedDept(dept.slug)}
                  aria-pressed={isActive}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition min-h-[44px] flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isActive
                      ? "bg-sky-700 text-white shadow-2xs font-semibold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {dept.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Counter & Active Filter Badge */}
        {!loading && !error && (
          <div className="flex flex-wrap justify-between items-center mb-6 text-xs text-slate-600 gap-2">
            <div>
              Showing{" "}
              <strong className="text-slate-900 font-semibold">
                {filteredDoctors.length}
              </strong>{" "}
              specialist{filteredDoctors.length === 1 ? "" : "s"}
              {selectedDept !== "all" && (
                <span>
                  {" "}
                  in <strong className="text-sky-700">{currentDeptDisplayName}</strong>
                </span>
              )}
              {searchQuery && (
                <span>
                  {" "}
                  matching &quot;<strong className="text-slate-800">{searchQuery}</strong>&quot;
                </span>
              )}
            </div>

            {(selectedDept !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline min-h-[44px] px-2.5 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Reset all filters
              </button>
            )}
          </div>
        )}

        {/* 1. Loading Skeleton */}
        {loading && (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse mb-8"
            aria-busy="true"
            aria-label="Loading specialist consultants"
          >
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

        {/* 2. API Error / Retry State */}
        {!loading && error && (
          <div
            role="alert"
            className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
          >
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-sm text-amber-900">
                  Unable to load consultant directory
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">{error}</p>
                <p className="text-xs text-amber-700 mt-2">
                  For immediate assistance or today&apos;s duty doctor schedule, call reception:{" "}
                  <a
                    href={`tel:${HOSPITAL_METADATA.phone}`}
                    className="font-bold underline hover:text-amber-900"
                  >
                    {HOSPITAL_METADATA.phone}
                  </a>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition shrink-0 min-h-[44px] shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Retry Connection
            </button>
          </div>
        )}

        {/* 3. Global Empty State: No doctors returned from API */}
        {!loading && !error && doctors.length === 0 && (
          <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 mb-8">
            <UserX className="w-12 h-12 text-slate-300 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-800">
              Consultant Directory Being Updated
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Doctor visiting rosters are currently being updated by the hospital administration. Please check back shortly or call our reception desk.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={`tel:${HOSPITAL_METADATA.phone}`}
                className="inline-flex items-center px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold min-h-[44px] shadow-2xs transition"
              >
                <Phone className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Call Reception ({HOSPITAL_METADATA.phone})
              </a>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold min-h-[44px] transition"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Refresh Directory
              </button>
            </div>
          </div>
        )}

        {/* 4. Filter / Search Zero Matches State */}
        {!loading && !error && doctors.length > 0 && filteredDoctors.length === 0 && (
          <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 mb-8">
            <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-800">
              No Doctors Match Your Filters
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {searchQuery && selectedDept !== "all" ? (
                <>
                  No doctors found matching &quot;{searchQuery}&quot; in {currentDeptDisplayName}.
                </>
              ) : searchQuery ? (
                <>No doctors found matching &quot;{searchQuery}&quot;.</>
              ) : (
                <>No doctors found in {currentDeptDisplayName}.</>
              )}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold min-h-[44px] shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Clear Filters &amp; View All Doctors
              </button>
            </div>
          </div>
        )}

        {/* 5. Doctor Grid: Active results */}
        {!loading && !error && filteredDoctors.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map((doc) => {
              const isDeepLinked = doc.id === highlightedDoctorId;

              return (
                <div
                  key={doc.id}
                  id={`doctor-${doc.id}`}
                  className={`bg-white rounded-2xl border shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between ${
                    isDeepLinked
                      ? "border-sky-500 ring-2 ring-sky-500/50 bg-sky-50/20"
                      : "border-slate-200"
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start space-x-4 mb-4">
                      <div
                        className="w-16 h-16 rounded-2xl bg-sky-100 border-2 border-sky-200 flex items-center justify-center font-bold text-sky-800 text-xl shrink-0 shadow-2xs"
                        aria-hidden="true"
                      >
                        {getDoctorInitials(doc.full_name)}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                          {doc.department_name}
                        </span>
                        <h2 className="font-bold text-slate-900 text-base mt-1 leading-snug">
                          {doc.full_name}
                        </h2>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          {doc.specialization}
                        </p>
                        {doc.designation && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {doc.designation}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 py-3 border-y border-slate-100">
                      <p className="text-[11px] text-slate-500 font-normal">
                        <strong className="text-slate-700 font-semibold">Degrees:</strong>{" "}
                        {doc.degrees}
                      </p>
                      <p className="flex items-center text-[11px] text-slate-700 font-medium mt-1">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-sky-600 shrink-0" aria-hidden="true" />
                        <span>Chamber: {doc.room_number || "OPD Chamber"}</span>
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
                        <span className="text-[11px] text-slate-500 block flex items-center justify-end">
                          <Clock className="w-3 h-3 mr-1 text-slate-400" aria-hidden="true" />
                          Visiting Hours
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {doc.visiting_hours_text || "Schedule on request"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                    <Link
                      href={`/appointment?doctor=${doc.id}`}
                      aria-label={`Book appointment serial with ${doc.full_name}`}
                      className="grow flex items-center justify-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs py-2.5 min-h-[44px] rounded-lg shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <Calendar className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                      Book Serial Online
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DoctorsDirectoryPage() {
  return (
    <Suspense fallback={<DoctorsLoadingSkeleton />}>
      <DoctorsDirectoryContent />
    </Suspense>
  );
}
