"use client";

import React from "react";
import Link from "next/link";
import { Calendar, Clock, User, ArrowRight } from "lucide-react";

export interface AppointmentItem {
  id: string;
  time: string;
  doctorName: string;
  department: string;
  patientName: string;
  tokenNumber?: string;
  status: "Confirmed" | "Waiting" | "In Consultation" | "Completed";
}

const DEFAULT_APPOINTMENTS: AppointmentItem[] = [
  {
    id: "APT-101",
    time: "09:30 AM",
    doctorName: "Dr. Rahman",
    department: "Cardiology",
    patientName: "Rahim Uddin",
    tokenNumber: "OPD-001",
    status: "Confirmed",
  },
  {
    id: "APT-102",
    time: "10:00 AM",
    doctorName: "Dr. Nasreen",
    department: "Gynaecology",
    patientName: "Fatema Khatun",
    tokenNumber: "OPD-002",
    status: "Confirmed",
  },
  {
    id: "APT-103",
    time: "10:45 AM",
    doctorName: "Dr. Chowdhury",
    department: "Medicine",
    patientName: "Md. Hasan",
    tokenNumber: "OPD-003",
    status: "Waiting",
  },
  {
    id: "APT-104",
    time: "11:30 AM",
    doctorName: "Dr. Sultana",
    department: "Paediatrics",
    patientName: "Salma Akter",
    tokenNumber: "OPD-004",
    status: "Confirmed",
  },
];

export function TodayAppointmentsWidget({
  appointments = DEFAULT_APPOINTMENTS,
}: {
  appointments?: AppointmentItem[];
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center">
              <Calendar className="w-4 h-4 mr-1.5 text-sky-600" />
              Today&apos;s Appointments
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">আজকের অ্যাপয়েন্টমেন্ট শিডিউল</p>
          </div>
          <Link
            href="/app/appointments"
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center transition"
          >
            <span>সব দেখুন</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>

        {/* Appointment list items */}
        <div className="space-y-2.5">
          {appointments.slice(0, 5).map((apt) => {
            const isConfirmed = apt.status === "Confirmed";
            const isWaiting = apt.status === "Waiting";
            const isInConsultation = apt.status === "In Consultation";

            return (
              <div
                key={apt.id}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition flex items-center justify-between gap-3"
              >
                {/* Time Badge */}
                <div className="flex items-center space-x-2 shrink-0">
                  <div className="flex items-center text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded-md border border-slate-200/60 shadow-2xs font-mono">
                    <Clock className="w-3 h-3 mr-1 text-sky-600" />
                    <span>{apt.time}</span>
                  </div>
                </div>

                {/* Doctor & Patient details */}
                <div className="min-w-0 grow">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {apt.doctorName}
                    <span className="text-[10px] text-slate-400 font-normal ml-1.5 hidden sm:inline">
                      ({apt.department})
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate flex items-center mt-0.5">
                    <User className="w-3 h-3 mr-1 text-slate-400 shrink-0" />
                    <span className="truncate">রোগী: <strong>{apt.patientName}</strong></span>
                  </p>
                </div>

                {/* Status Pill Badge */}
                <div className="shrink-0">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                      isConfirmed
                        ? "bg-sky-100 text-sky-800 border border-sky-200"
                        : isWaiting
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : isInConsultation
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {apt.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>সক্রিয় অ্যাপয়েন্টমেন্ট ডেস্ক</span>
        <span className="font-semibold text-slate-600">মোট ৪টি বুকিং চলমান</span>
      </div>
    </div>
  );
}
