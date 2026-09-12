"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  DollarSign,
  AlertCircle,
  Bed,
  CalendarClock,
  Activity,
  ArrowUpRight,
  Stethoscope,
  Microscope,
  Pill,
  Radio,
  PlusCircle,
  CheckCircle2,
  Volume2,
} from "lucide-react";
import {
  MOCK_WAITING_QUEUE,
  MOCK_BEDS,
  MOCK_INVOICES,
  MOCK_PATIENTS,
  MOCK_DOCTORS,
} from "@/lib/mock-data";
import { formatCurrencyBDT } from "@/lib/utils";

export default function HospitalDashboardPage() {
  const [waitingQueue, setWaitingQueue] = useState(MOCK_WAITING_QUEUE);

  // Compute live dashboard metrics
  const totalBeds = MOCK_BEDS.length;
  const availableBeds = MOCK_BEDS.filter((b) => b.status === "available").length;
  const occupiedBeds = MOCK_BEDS.filter((b) => b.status === "occupied").length;

  const totalIncomeToday = MOCK_INVOICES.reduce((acc, inv) => acc + inv.paid_amount, 0);
  const totalDueToday = MOCK_INVOICES.reduce((acc, inv) => acc + inv.due_amount, 0);

  // Call Next Token Action
  const handleCallToken = (id: string) => {
    setWaitingQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: "calling", called_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          : item
      )
    );
  };

  const handleMarkDone = (id: string) => {
    setWaitingQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "done" } : item
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Hospital Operations Command Center
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Executive Daily Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime monitoring for OPD, IPD, Emergency admissions, cash register, and diagnostic orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/patients?action=register"
            className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
            Register Patient
          </Link>
          <Link
            href="/app/billing"
            className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition"
          >
            <DollarSign className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            New Invoice (POS)
          </Link>
        </div>
      </div>

      {/* 1. TOP METRICS STRIP (Today's Patients, Income, Due, Emergency, OPD, IPD, Available Beds) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Today&apos;s Patients</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">48</div>
          <span className="text-[10px] text-emerald-600 font-medium">↑ 12% from yesterday</span>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Today&apos;s Collection</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatCurrencyBDT(totalIncomeToday)}</div>
          <span className="text-[10px] text-slate-500 font-medium">Cash + bKash</span>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Today&apos;s Due</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-700">{formatCurrencyBDT(totalDueToday)}</div>
          <span className="text-[10px] text-amber-600 font-medium">1 Patient Due</span>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Emergency</span>
            <Radio className="w-4 h-4 text-rose-600 animate-pulse" />
          </div>
          <div className="text-xl font-bold text-rose-700">6</div>
          <span className="text-[10px] text-rose-600 font-medium">2 Under Triage</span>
        </div>

        {/* Metric 5 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">OPD Consults</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">34</div>
          <span className="text-[10px] text-slate-500 font-medium">4 Doctors active</span>
        </div>

        {/* Metric 6 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">IPD Inpatients</span>
            <Bed className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">8</div>
          <span className="text-[10px] text-purple-600 font-medium">3 New admissions</span>
        </div>

        {/* Metric 7 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Beds Vacant</span>
            <Bed className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">
            {availableBeds} / {totalBeds}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">{occupiedBeds} Occupied</span>
        </div>
      </div>

      {/* 2. REALTIME WAITING QUEUE & TOKEN MANAGER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 gap-2 mb-4">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
            <h2 className="text-base font-bold text-slate-900">
              Live Doctor Chamber Token Board (Realtime Sync)
            </h2>
          </div>
          <Link
            href="/app/appointments"
            className="text-xs font-semibold text-sky-700 hover:text-sky-800 flex items-center"
          >
            Manage Queue & Token Allocations
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {waitingQueue.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition ${
                item.status === "serving"
                  ? "bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-400/20"
                  : item.status === "calling"
                  ? "bg-amber-50/50 border-amber-300 animate-pulse"
                  : item.status === "done"
                  ? "bg-slate-50 border-slate-200 opacity-60"
                  : "bg-white border-slate-200"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-slate-600">
                  {item.room_number}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    item.status === "serving"
                      ? "bg-emerald-200 text-emerald-900"
                      : item.status === "calling"
                      ? "bg-amber-200 text-amber-900"
                      : item.status === "done"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <div className="my-2">
                <span className="text-2xl font-black font-mono text-sky-950 block">
                  Token: {item.token_number}
                </span>
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {item.patient_name}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {item.doctor_name}
                </p>
              </div>

              {/* Action Buttons for chamber assistance */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
                {item.status !== "done" && (
                  <>
                    <button
                      onClick={() => handleCallToken(item.id)}
                      className="grow flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold py-1.5 rounded-lg transition"
                      title="Chime Audio & SMS"
                    >
                      <Volume2 className="w-3 h-3 mr-1" />
                      Call Next
                    </button>
                    <button
                      onClick={() => handleMarkDone(item.id)}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                      title="Mark Completed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {item.status === "done" && (
                  <span className="text-[11px] text-slate-400 font-medium text-center w-full py-1">
                    Consultation Finished
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. REVENUE BREAKDOWN & RECENT ADMISSIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Department Revenue Stream */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            Today&apos;s Revenue Breakdown
          </h3>
          <div className="space-y-3 text-xs">
            {[
              { name: "Doctor Consultations", amount: 1800, icon: Stethoscope, color: "text-blue-600" },
              { name: "Diagnostic & Lab Tests", amount: 1800, icon: Microscope, color: "text-purple-600" },
              { name: "Pharmacy Counter", amount: 3200, icon: Pill, color: "text-rose-600" },
              { name: "Cabin & Bed Charges", amount: 2500, icon: Bed, color: "text-emerald-600" },
            ].map((stream, idx) => {
              const Icon = stream.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${stream.color}`} />
                    <span className="font-semibold text-slate-800">{stream.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">
                    {formatCurrencyBDT(stream.amount)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-600">Total Net Income:</span>
            <span className="text-base font-extrabold text-emerald-700">
              {formatCurrencyBDT(9300)}
            </span>
          </div>
        </div>

        {/* Right: Recent Patient Admissions & Triage */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              Recent Patient Registrations & Visits
            </h3>
            <Link
              href="/app/patients"
              className="text-xs font-semibold text-sky-700 hover:text-sky-800"
            >
              View Full Registry →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold text-[11px] uppercase border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Patient ID</th>
                  <th className="py-2.5 px-3">Patient Name</th>
                  <th className="py-2.5 px-3">Age/Gender</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Blood Group</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_PATIENTS.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                      {p.patient_id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {p.full_name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {p.age} Y / {p.gender.toUpperCase()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{p.phone}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                        {p.blood_group || "N/A"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Link
                        href={`/app/patients?id=${p.id}`}
                        className="text-sky-600 hover:text-sky-800 font-semibold"
                      >
                        Profile & History →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
