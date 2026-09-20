"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Printer,
  Search,
  FlaskConical,
  Barcode,
  Microscope,
} from "lucide-react";
import { DiagnosticOrderRecord } from "@/types/clinical-emr";
import { getDiagnosticOrdersAction, verifyDiagnosticReportAction } from "@/lib/lab/actions";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";

export default function LabManagementPage() {
  const [labOrders, setLabOrders] = useState<DiagnosticOrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DiagnosticOrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadOrders() {
      setLoading(true);
      const res = await getDiagnosticOrdersAction();
      if (mounted) {
        if (res.success && res.data?.orders) {
          setLabOrders(res.data.orders);
          if (res.data.orders.length > 0) {
            setSelectedOrder(res.data.orders[0]);
          }
        }
        setLoading(false);
      }
    }
    loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleVerifyReport = async (orderId: string) => {
    setVerifying(true);
    const res = await verifyDiagnosticReportAction({
      orderId,
      pathologistRemarks: "Reviewed and validated by Consultant Pathologist",
    });
    setVerifying(false);

    if (res.success) {
      setLabOrders((prev) =>
        prev.map((ord) =>
          ord.id === orderId
            ? { ...ord, status: "VERIFIED" }
            : ord
        )
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, status: "VERIFIED" } : null
        );
      }
    } else {
      alert(res.error || "Failed to verify diagnostic report");
    }
  };

  const filteredOrders = labOrders.filter((ord) => {
    const q = searchQuery.toLowerCase();
    return (
      ord.order_number.toLowerCase().includes(q) ||
      (ord.patient?.full_name && ord.patient.full_name.toLowerCase().includes(q)) ||
      (ord.patient?.patient_code && ord.patient.patient_code.toLowerCase().includes(q)) ||
      (ord.barcode && ord.barcode.toLowerCase().includes(q))
    );
  });

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
            Phlebotomy barcoding, automated parameter ranges, dual-gate clinical verification, and official letterhead printing.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center">
            <FlaskConical className="w-4 h-4 mr-1.5 text-purple-600" />
            Lab Engine Online
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
                placeholder="Search by Order #, Barcode, Patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
              />
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading diagnostic orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Microscope className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                No laboratory orders match your search.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredOrders.map((ord) => {
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
                              ord.status === "VERIFIED" || ord.status === "DELIVERED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {ord.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 mt-1">
                          {ord.patient?.full_name || "Patient"} ({ord.patient?.patient_code || ""})
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center mt-0.5">
                          <Barcode className="w-3 h-3 mr-1 text-slate-400" />
                          {ord.barcode} • Tests: {(ord.tests || []).map((t) => t.test_name).join(", ") || "General Panel"}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">
                          {formatDateBDT(ord.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                    selectedOrder.status === "VERIFIED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}>
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedOrder.status !== "VERIFIED" && (
                    <button
                      onClick={() => handleVerifyReport(selectedOrder.id)}
                      disabled={verifying}
                      className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {verifying ? "Signing..." : "Verify & Sign Report"}
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
                  documentTitle="DIAGNOSTIC PATHOLOGY & LAB REPORT"
                  documentNumber={selectedOrder.order_number}
                  dateStr={formatDateBDT(selectedOrder.created_at)}
                />

                {/* Patient Header */}
                <div className="grid grid-cols-2 gap-4 text-xs py-3 border-y border-slate-200 my-4">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Patient Name</span>
                    <strong className="text-slate-900">{selectedOrder.patient?.full_name}</strong>
                    <span className="block text-slate-600 font-mono text-[11px]">
                      Patient ID: {selectedOrder.patient?.patient_code} • {selectedOrder.patient?.gender}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Referred By</span>
                    <strong className="text-slate-800">{selectedOrder.doctor?.full_name || "Self / OPD Walk-in"}</strong>
                    <span className="block text-slate-500 text-[11px]">
                      Barcode: <strong className="font-mono">{selectedOrder.barcode}</strong>
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
                      {(selectedOrder.tests || []).flatMap((t, tIdx) => {
                        if (t.parameters && t.parameters.length > 0) {
                          return t.parameters.map((p, pIdx) => (
                            <tr key={`${tIdx}-${pIdx}`} className={p.is_abnormal ? "bg-amber-50/50" : ""}>
                              <td className="p-2.5 font-semibold text-slate-900">
                                {t.test_name} - {p.parameter_name}
                              </td>
                              <td
                                className={`p-2.5 text-center font-bold font-mono text-sm ${
                                  p.is_abnormal ? "text-amber-700" : "text-slate-900"
                                }`}
                              >
                                {p.observed_value || "Pending"}
                                {p.is_abnormal && " *"}
                              </td>
                              <td className="p-2.5 text-center text-slate-600 font-mono">
                                {p.unit || "-"}
                              </td>
                              <td className="p-2.5 text-slate-600 text-[11px]">
                                {p.reference_range_male || p.reference_range_female || "Normal"}
                              </td>
                            </tr>
                          ));
                        }
                        return (
                          <tr key={tIdx}>
                            <td className="p-2.5 font-semibold text-slate-900" colSpan={2}>
                              {t.test_name}
                              {t.descriptive_findings && (
                                <p className="font-normal text-slate-600 mt-1 whitespace-pre-line text-[11px]">
                                  {t.descriptive_findings}
                                </p>
                              )}
                            </td>
                            <td className="p-2.5 text-center text-slate-500 font-mono">-</td>
                            <td className="p-2.5 text-slate-500 text-[11px]">Descriptive Report</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 mt-1.5 italic">
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
                    <div className="w-44 border-b border-slate-400 mb-1"></div>
                    <p className="font-bold text-slate-900">
                      {selectedOrder.status === "VERIFIED" ? "Dr. Kazi Jahangir (Pathologist)" : "Pending Signature"}
                    </p>
                    <p className="text-[10px] text-slate-500">Consultant Clinical Pathologist</p>
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

