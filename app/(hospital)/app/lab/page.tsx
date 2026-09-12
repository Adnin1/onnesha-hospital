"use client";

import React, { useState } from "react";
import {
  Microscope,
  CheckCircle2,
  Clock,
  Printer,
  Search,
  Plus,
  AlertCircle,
  FileCheck,
  User,
  FlaskConical,
} from "lucide-react";
import { MOCK_LAB_ORDERS, MOCK_LAB_TESTS, MOCK_PATIENTS } from "@/lib/mock-data";
import { LabOrder } from "@/types";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function LabManagementPage() {
  const [labOrders, setLabOrders] = useState<LabOrder[]>(MOCK_LAB_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(MOCK_LAB_ORDERS[0]);
  const [searchQuery, setSearchQuery] = useState("");

  const handlePrint = () => {
    window.print();
  };

  const handleVerifyReport = (orderId: string) => {
    setLabOrders((prev) =>
      prev.map((ord) =>
        ord.id === orderId
          ? { ...ord, status: "verified", verified_by: "Dr. Kazi Jahangir (Biochemist)" }
          : ord
      )
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) =>
        prev ? { ...prev, status: "verified", verified_by: "Dr. Kazi Jahangir (Biochemist)" } : null
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Diagnostic & Laboratory Medicine
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Pathology Orders & Verified Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sample barcoding, automated biochemistry result entry, reference ranges, and verified letterhead printing.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center">
            <FlaskConical className="w-4 h-4 mr-1.5 text-purple-600" />
            Analyzers Online
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Lab Orders List (5 cols) */}
        <div className="lg:col-span-5 space-y-4 no-print">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by Order # or Patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
              />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {labOrders.map((ord) => {
                const isSelected = selectedOrder?.id === ord.id;
                return (
                  <div
                    key={ord.id}
                    onClick={() => setSelectedOrder(ord)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? "bg-purple-50/80 border-purple-300 shadow-2xs"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-purple-900">
                          {ord.order_number}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            ord.status === "verified" || ord.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-1">
                        {ord.patient_name} ({ord.patient_code})
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Tests: {ord.tests.map((t) => t.test_name.split(" ")[0]).join(", ")}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">
                        {formatDateBDT(ord.ordered_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Verified Lab Report Pad Viewer (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              {/* Action Bar (Hide on Print) */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6 no-print">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-500">Status:</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded uppercase bg-emerald-100 text-emerald-800">
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedOrder.status !== "verified" && (
                    <button
                      onClick={() => handleVerifyReport(selectedOrder.id)}
                      className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Verify & Sign Report
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print Verified Report
                  </button>
                </div>
              </div>

              {/* Printable Lab Report Pad */}
              <div className="print-pad">
                <HospitalPrintHeader
                  documentTitle="DIAGNOSTIC PATHOLOGY REPORT"
                  documentNumber={selectedOrder.order_number}
                  dateStr={formatDateBDT(selectedOrder.ordered_at)}
                />

                {/* Patient Header */}
                <div className="grid grid-cols-2 gap-4 text-xs py-3 border-y border-slate-200 my-4">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Patient Name</span>
                    <strong className="text-slate-900">{selectedOrder.patient_name}</strong>
                    <span className="block text-slate-600 font-mono text-[11px]">
                      Patient ID: {selectedOrder.patient_code}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Referred By</span>
                    <strong className="text-slate-800">{selectedOrder.doctor_name}</strong>
                    <span className="block text-slate-500 text-[11px]">
                      Sample: Peripheral Venous Blood
                    </span>
                  </div>
                </div>

                {/* Test Results Table */}
                <div className="my-6">
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Investigation / Test Parameter</th>
                        <th className="p-2.5 text-center">Observed Result</th>
                        <th className="p-2.5 text-center">Unit</th>
                        <th className="p-2.5">Biological Reference Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedOrder.tests.map((test, idx) => (
                        <tr
                          key={idx}
                          className={test.is_abnormal ? "bg-amber-50/50" : ""}
                        >
                          <td className="p-2.5 font-semibold text-slate-900">
                            {test.test_name}
                            {test.remarks && (
                              <span className="block text-[10px] text-amber-800 italic mt-0.5">
                                Note: {test.remarks}
                              </span>
                            )}
                          </td>
                          <td
                            className={`p-2.5 text-center font-bold font-mono text-sm ${
                              test.is_abnormal ? "text-amber-700" : "text-slate-900"
                            }`}
                          >
                            {test.result_value || "Pending"}
                            {test.is_abnormal && " *"}
                          </td>
                          <td className="p-2.5 text-center text-slate-600 font-mono">
                            {test.unit || "-"}
                          </td>
                          <td className="p-2.5 text-slate-600 text-[11px]">
                            {test.normal_range || "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    * Flagged values indicate results outside standard biological reference interval.
                  </p>
                </div>

                {/* Verification Footer */}
                <div className="mt-12 pt-6 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
                  <div>
                    <p className="font-semibold text-slate-800">
                      Checked By: Lab Medical Technologist
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Method: Fully Automated Photometric & Sysmex Hematology
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="w-40 border-b border-slate-400 mb-1"></div>
                    <p className="font-bold text-slate-900">
                      {selectedOrder.verified_by || "Verified by Pathologist"}
                    </p>
                    <p className="text-[10px] text-slate-500">Consultant Pathologist</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Select an investigation order to view results and letterhead report.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
