"use client";

import React from "react";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";

export interface RecentPatientRecord {
  id: string;
  patientId: string;
  name: string;
  age: string;
  gender?: string;
  department: string;
  visitTime: string;
  status: "Admitted" | "Ongoing" | "Discharged";
}

const DEFAULT_RECENT_PATIENTS: RecentPatientRecord[] = [
  {
    id: "p1",
    patientId: "PID-1024",
    name: "Rahim Uddin",
    age: "45y",
    gender: "M",
    department: "Cardiology",
    visitTime: "09:15 AM",
    status: "Admitted",
  },
  {
    id: "p2",
    patientId: "PID-1023",
    name: "Fatema Khatun",
    age: "32y",
    gender: "F",
    department: "Gynaecology",
    visitTime: "10:20 AM",
    status: "Ongoing",
  },
  {
    id: "p3",
    patientId: "PID-1022",
    name: "Md. Hasan",
    age: "58y",
    gender: "M",
    department: "Medicine",
    visitTime: "11:05 AM",
    status: "Discharged",
  },
  {
    id: "p4",
    patientId: "PID-1021",
    name: "Salma Akter",
    age: "27y",
    gender: "F",
    department: "Paediatrics",
    visitTime: "11:40 AM",
    status: "Admitted",
  },
];

export function RecentPatientsTable({
  patients = DEFAULT_RECENT_PATIENTS,
}: {
  patients?: RecentPatientRecord[];
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition duration-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center">
            <Users className="w-4 h-4 mr-1.5 text-sky-600" />
            Recent Patients
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">সাম্প্রতিক রোগীর তালিকা ও লাইভ ক্লিনিক্যাল অবস্থা</p>
        </div>
        <Link
          href="/app/patients"
          className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center transition"
        >
          <span>পেশেন্ট ডিরেক্টরি</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>

      {/* Table Container */}
      <div className="table-responsive border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs text-slate-600 border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3">Patient ID</th>
              <th className="py-2.5 px-3">Name</th>
              <th className="py-2.5 px-3">Age</th>
              <th className="py-2.5 px-3">Department</th>
              <th className="py-2.5 px-3">Visit Time</th>
              <th className="py-2.5 px-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((p) => {
              const isAdmitted = p.status === "Admitted";
              const isOngoing = p.status === "Ongoing";

              return (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 text-[11px]">
                    {p.patientId}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">
                    {p.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {p.age} {p.gender ? `(${p.gender})` : ""}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 font-medium">
                    {p.department}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                    {p.visitTime}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                        isAdmitted
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : isOngoing
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400">
        <span>সক্রিয় পেশেন্ট কিউ ট্র্যাকার</span>
        <span>মোট ৪ জন সাম্প্রতিক রোগী তালিকাভুক্ত</span>
      </div>
    </div>
  );
}
