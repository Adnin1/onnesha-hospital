/**
 * FeaturedDoctorsWidget — Client Island for Featured Doctors Section
 * Isolated client component for homepage doctor listing.
 * Has proper loading/error/empty states. No patient PII.
 */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { getPublicDoctorsAction, PublicDoctor } from "@/lib/public/actions";
import { formatCurrencyBDT } from "@/lib/utils";

type LoadState = "loading" | "success" | "error" | "empty";

function getDoctorInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const meaningful = parts[0].toLowerCase().replace(/\./g, "").startsWith("dr") ? parts.slice(1) : parts;
  if (meaningful.length === 0) return parts[0].slice(0, 2).toUpperCase();
  return meaningful.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "DR";
}

export function FeaturedDoctorsWidget() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await getPublicDoctorsAction();
        if (!mounted) return;
        if (res.success && res.doctors && res.doctors.length > 0) {
          setDoctors(res.doctors);
          setLoadState("success");
        } else if (res.success) {
          setLoadState("empty");
        } else {
          setLoadState("error");
        }
      } catch {
        if (mounted) setLoadState("error");
      }
    }

    void load();
    return () => { mounted = false; };
  }, []);

  return (
    <section className="py-16 bg-slate-50 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
          <div>
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Experienced Consultants
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Meet Our Senior Doctors
            </h2>
          </div>
          <Link
            href="/doctors"
            className="inline-flex items-center text-xs font-semibold text-sky-700 hover:text-sky-800 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:border-sky-300 transition shadow-2xs"
          >
            View All Doctors & Visiting Hours
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
          </Link>
        </div>

        {loadState === "loading" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse" aria-busy="true" aria-label="Loading specialist doctors">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 min-h-[320px] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-14 h-14 rounded-full bg-slate-200 shrink-0" />
                    <div className="space-y-1.5 grow">
                      <div className="h-3 bg-slate-200 rounded w-16" />
                      <div className="h-4 bg-slate-200 rounded w-28" />
                    </div>
                  </div>
                  <div className="space-y-2 py-3 border-t border-slate-100">
                    <div className="h-3 bg-slate-100 rounded w-24" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                  </div>
                </div>
                <div className="h-10 bg-slate-200 rounded-lg mt-4" />
              </div>
            ))}
          </div>
        )}

        {loadState === "error" && (
          <div className="flex items-center justify-center gap-3 py-10 bg-amber-50 rounded-2xl border border-amber-100 text-sm text-amber-700" aria-live="polite">
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Unable to load doctors right now. Please try the <Link href="/doctors" className="underline">Doctors page</Link>.</span>
          </div>
        )}

        {loadState === "empty" && (
          <div className="text-center py-10 text-sm text-slate-500">
            Doctor schedules are being updated. View our <Link href="/doctors" className="text-sky-600 underline">full directory</Link>.
          </div>
        )}

        {loadState === "success" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {doctors.slice(0, 4).map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between"
              >
                <div className="p-5">
                  <div className="flex items-center space-x-3 mb-4">
                    <div
                      className="w-14 h-14 rounded-full bg-sky-100 border-2 border-sky-200 flex items-center justify-center font-bold text-sky-800 text-lg shrink-0"
                      aria-hidden="true"
                    >
                      {getDoctorInitials(doc.full_name)}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded">
                        {doc.department_name}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-1 leading-snug">
                        {doc.full_name}
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-slate-700 mb-1">
                    {doc.designation}
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">
                    {doc.degrees}
                  </p>

                  <div className="text-[11px] space-y-1 py-2 border-t border-slate-100 text-slate-600">
                    {doc.bmdc_reg_number ? (
                      <div className="flex justify-between">
                        <span>BMDC Reg:</span>
                        <span className="font-medium text-slate-800">{doc.bmdc_reg_number}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span>Chamber:</span>
                      <span className="font-medium text-slate-800">{doc.room_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consultation Fee:</span>
                      <span className="font-bold text-emerald-700">{formatCurrencyBDT(doc.opd_fee)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <Link
                    href={`/appointment?doctor=${doc.id}`}
                    className="w-full text-center min-h-[44px] flex items-center justify-center py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                    aria-label={`Book appointment with ${doc.full_name}`}
                  >
                    Book Serial / Token
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
