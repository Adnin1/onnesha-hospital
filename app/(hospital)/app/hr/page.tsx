"use client";

import React, { useState } from "react";
import {
  UserCheck,
  Fingerprint,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Server,
  Download,
} from "lucide-react";
import { MOCK_EMPLOYEES } from "@/lib/mock-data";
import { formatCurrencyBDT } from "@/lib/utils";

export default function HRManagementPage() {
  const [employees, setEmployees] = useState(MOCK_EMPLOYEES);
  const [activeTab, setActiveTab] = useState<"staff" | "attendance" | "payroll" | "bridge">("staff");

  const [attendanceLogs, setAttendanceLogs] = useState([
    { id: "att-1", name: "Jewel Hossain", code: "EMP-001", checkIn: "08:55 AM", checkOut: "05:10 PM", source: "Biometric Device (Bridge)", status: "Present" },
    { id: "att-2", name: "Apon Mia", code: "EMP-002", checkIn: "08:48 AM", checkOut: "05:05 PM", source: "Biometric Device (Bridge)", status: "Present" },
    { id: "att-3", name: "Sharmin Sultana", code: "EMP-003", checkIn: "06:50 AM", checkOut: "03:15 PM", source: "Biometric Device (Bridge)", status: "Present" },
    { id: "att-4", name: "Kazi Jahangir", code: "EMP-004", checkIn: "09:12 AM", checkOut: "-", source: "Biometric Device (Bridge)", status: "Late (12m)" },
  ]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Human Resources & Staff Administration
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            HR, Attendance & Biometric Device Bridge
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Employee roster, biometric fingerprint bridge connector, monthly attendance logs, and payroll calculations.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "staff" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Staff Directory
          </button>
          <button
            onClick={() => setActiveTab("attendance")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "attendance" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Daily Attendance
          </button>
          <button
            onClick={() => setActiveTab("bridge")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "bridge" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Biometric Bridge
          </button>
          <button
            onClick={() => setActiveTab("payroll")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "payroll" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Payroll & Salary
          </button>
        </div>
      </div>

      {/* TAB 1: STAFF DIRECTORY */}
      {activeTab === "staff" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            Hospital Permanent Staff List
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Employee Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Joining Date</th>
                  <th className="py-3 px-4 text-right">Basic Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-sky-900">{emp.employee_code}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{emp.full_name}</td>
                    <td className="py-3 px-4 text-slate-700">{emp.department}</td>
                    <td className="py-3 px-4 text-slate-600 font-medium">{emp.designation}</td>
                    <td className="py-3 px-4 text-slate-600">{emp.phone}</td>
                    <td className="py-3 px-4 text-slate-500">{emp.joining_date}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      {formatCurrencyBDT(emp.basic_salary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE LOGS */}
      {activeTab === "attendance" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Today&apos;s Biometric Attendance Log
              </h3>
              <p className="text-xs text-slate-500">
                Recorded via Local Attendance Bridge Service from Front Gate Fingerprint Terminal.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
              Auto Sync Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Check-In Time</th>
                  <th className="py-3 px-4">Check-Out Time</th>
                  <th className="py-3 px-4">Source Terminal</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{log.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{log.code}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-700">{log.checkIn}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{log.checkOut}</td>
                    <td className="py-3 px-4 text-slate-500">{log.source}</td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.status.startsWith("Late")
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BIOMETRIC BRIDGE ARCHITECTURE & CONFIGURATION */}
      {activeTab === "bridge" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
              <Fingerprint className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Local Biometric Device Bridge Connector
              </h2>
              <p className="text-xs text-slate-500">
                Reliable architecture connecting physical USB/TCP-IP biometric attendance devices to Onnesha Cloud HMS.
              </p>
            </div>
          </div>

          {/* Architecture Visual Diagram */}
          <div className="p-6 bg-slate-900 text-white rounded-2xl font-mono text-xs overflow-x-auto">
            <div className="text-sky-400 font-bold mb-2">{"// Architecture Data Flow:"}</div>
            <pre className="text-slate-300">
{`[Physical Biometric Machine] (ZKTeco / Realtime / Virdi)
              │
              ▼ (TCP/IP / USB Local Network)
[Local Attendance Bridge Service] (Running on Hospital Reception PC at localhost:8088)
              │
              ▼ (HTTPS Webhook with API Token)
[Onnesha Cloud API Endpoint] (/api/biometric/sync)
              │
              ▼
[Supabase PostgreSQL] -> attendance table (Instant HR Dashboard Display)`}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Local Bridge Daemon Status:</span>
              <span className="inline-flex items-center text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Listening on http://localhost:8088
              </span>
              <p className="text-slate-500 text-[11px] mt-2">
                Device Model: ZKTeco K40 / SilkBio-101TC • IP: 192.168.1.201
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800 block mb-1">Bridge Security Token:</span>
              <code className="bg-slate-200 text-slate-800 px-2 py-1 rounded text-[11px] font-mono block truncate">
                bh_bridge_sec_991823abce1287
              </code>
              <p className="text-slate-500 text-[11px] mt-2">
                Payload encrypted with HMAC SHA-256 before forwarding to cloud.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PAYROLL & SALARY */}
      {activeTab === "payroll" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            Monthly Payroll Calculations (September 2026)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Basic Pay</th>
                  <th className="py-3 px-4">Overtime / Allowance</th>
                  <th className="py-3 px-4">Deductions</th>
                  <th className="py-3 px-4 text-right">Net Payable</th>
                  <th className="py-3 px-4 text-right">Salary Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {emp.full_name}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {emp.designation}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">{formatCurrencyBDT(emp.basic_salary)}</td>
                    <td className="py-3 px-4 font-mono text-emerald-700">+{formatCurrencyBDT(3000)}</td>
                    <td className="py-3 px-4 font-mono text-rose-600">-{formatCurrencyBDT(0)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {formatCurrencyBDT(emp.basic_salary + 3000)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px]">
                        Processed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
