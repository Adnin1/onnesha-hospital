"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Printer,
  Search,
  FlaskConical,
  Barcode,
  Microscope,
  Plus,
  X,
  FilePlus,
  Check,
} from "lucide-react";
import { DiagnosticOrderRecord } from "@/types/clinical-emr";
import { DoctorRecord } from "@/types/appointments";
import { PatientMaster } from "@/types/clinical";
import {
  getDiagnosticOrdersAction,
  verifyDiagnosticReportAction,
  getDiagnosticTestsCatalogAction,
  createDiagnosticOrderAction,
} from "@/lib/lab/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";

export default function LabManagementPage() {
  const [labOrders, setLabOrders] = useState<DiagnosticOrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DiagnosticOrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // New Order Modal State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [testCatalog, setTestCatalog] = useState<
    Array<{ id: string; test_name: string; test_code: string; price: number; specimen_type: string }>
  >([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      const [ordersRes, catalogRes, docRes, patRes] = await Promise.all([
        getDiagnosticOrdersAction(),
        getDiagnosticTestsCatalogAction(),
        getDoctorsAction(),
        searchPatientsAction({ pageSize: 50 }),
      ]);

      if (mounted) {
        if (ordersRes.success && ordersRes.data?.orders) {
          setLabOrders(ordersRes.data.orders);
          if (ordersRes.data.orders.length > 0) {
            setSelectedOrder(ordersRes.data.orders[0]);
          }
        }
        if (catalogRes.success && catalogRes.data?.tests) {
          setTestCatalog(catalogRes.data.tests);
        }
        if (docRes.success && docRes.data?.doctors) {
          setDoctors(docRes.data.doctors);
          if (docRes.data.doctors.length > 0) setSelectedDoctorId(docRes.data.doctors[0].id);
        }
        if (patRes.success && patRes.data?.patients) {
          setPatients(patRes.data.patients);
          const urlParamPatientId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("patientId")
              : null;
          if (urlParamPatientId && patRes.data.patients.some((p) => p.id === urlParamPatientId)) {
            setSelectedPatientId(urlParamPatientId);
            setIsOrderModalOpen(true);
          } else if (patRes.data.patients.length > 0) {
            setSelectedPatientId(patRes.data.patients[0].id);
          }
        }
        setLoading(false);
      }
    }
    loadData();
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
          ord.id === orderId ? { ...ord, status: "VERIFIED" } : ord
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

  const toggleTest = (testId: string) => {
    setSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  };

  const orderTotal = testCatalog
    .filter((t) => selectedTestIds.includes(t.id))
    .reduce((sum, t) => sum + Number(t.price || 0), 0);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      alert("Please select a patient.");
      return;
    }
    if (selectedTestIds.length === 0) {
      alert("Please select at least one test to order.");
      return;
    }
    setSubmittingOrder(true);
    const res = await createDiagnosticOrderAction({
      patientId: selectedPatientId,
      referredByDoctorId: selectedDoctorId || undefined,
      testIds: selectedTestIds,
      clinicalNotes: clinicalNotes || undefined,
    });
    setSubmittingOrder(false);

    if (res.success && res.data) {
      const ordersRes = await getDiagnosticOrdersAction();
      if (ordersRes.success && ordersRes.data?.orders) {
        setLabOrders(ordersRes.data.orders);
        const newOrder = ordersRes.data.orders.find((o) => o.id === res.data?.orderId);
        if (newOrder) setSelectedOrder(newOrder);
      }
      setIsOrderModalOpen(false);
      setSelectedTestIds([]);
      setClinicalNotes("");
    } else {
      alert(res.error || "Failed to create diagnostic order");
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

  const filteredCatalog = testCatalog.filter((t) => {
    const q = catalogSearch.toLowerCase();
    return (
      t.test_name.toLowerCase().includes(q) ||
      t.test_code.toLowerCase().includes(q) ||
      t.specimen_type.toLowerCase().includes(q)
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

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsOrderModalOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Diagnostic Order</span>
          </button>
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
                        <p className="text-[11px] font-bold text-slate-700">
                          ৳{(ord.tests || []).reduce((sum, t) => sum + (t.price || 0), 0)}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDateBDT(ord.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Report Details & Print Preview (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Action Buttons */}
              <div className="flex justify-between items-center no-print border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    Order #{selectedOrder.order_number}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                      selectedOrder.status === "VERIFIED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="flex space-x-2">
                  {selectedOrder.status !== "VERIFIED" && (
                    <button
                      onClick={() => handleVerifyReport(selectedOrder.id)}
                      disabled={verifying}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{verifying ? "Verifying..." : "Verify & Sign Report"}</span>
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Report</span>
                  </button>
                </div>
              </div>

              {/* Printable Medical Letterhead Report */}
              <div className="print-report space-y-6">
                <HospitalPrintHeader documentTitle="DEPARTMENT OF DIAGNOSTIC PATHOLOGY & RADIOLOGY" />

                {/* Patient Barcode & Demographics Bar */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">PATIENT NAME</span>
                    <span className="font-bold text-slate-900">{selectedOrder.patient?.full_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">PATIENT ID / CODE</span>
                    <span className="font-mono font-bold text-slate-900">{selectedOrder.patient?.patient_code || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">REFERRED BY</span>
                    <span className="font-semibold text-slate-800">
                      {selectedOrder.doctor?.full_name ? `Dr. ${selectedOrder.doctor.full_name}` : "Self / Medical Officer"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">SAMPLE BARCODE</span>
                    <span className="font-mono font-bold text-purple-700">{selectedOrder.barcode}</span>
                  </div>
                </div>

                {/* Test Results Table */}
                <div className="space-y-4">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="p-2.5">Investigation / Test Parameter</th>
                        <th className="p-2.5">Observed Value</th>
                        <th className="p-2.5 text-center">Unit</th>
                        <th className="p-2.5">Biological Reference Interval</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedOrder.tests || []).map((t, tIdx) => {
                        if (t.parameters && t.parameters.length > 0) {
                          return t.parameters.map((p, pIdx) => (
                            <tr
                              key={`${tIdx}-${pIdx}`}
                              className={p.is_abnormal ? "bg-red-50/50 font-bold text-red-900" : ""}
                            >
                              <td className="p-2.5 font-medium text-slate-800">{p.parameter_name}</td>
                              <td className="p-2.5 font-mono">
                                {p.observed_value || "Pending"}{" "}
                                {p.is_abnormal && <span className="text-[10px] text-red-600">▲ HIGH</span>}
                              </td>
                              <td className="p-2.5 text-center text-slate-500 font-mono">{p.unit || "-"}</td>
                              <td className="p-2.5 text-slate-600 font-mono text-[11px]">
                                {p.reference_range_male || "Normal range"}
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

      {/* New Diagnostic Order Modal */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <FilePlus className="w-5 h-5 text-sky-600" />
                <h2 className="text-base font-bold text-slate-900">
                  New Diagnostic Order / টেস্ট বুকিং
                </h2>
              </div>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Patient Select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Patient *
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- Choose Patient --</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.patient_code}) - {p.phone}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Doctor Select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referring Doctor (Optional)
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- Internal / Self Referral --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.full_name} ({d.specialization})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Diagnosis / Indicative Symptoms
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fever with chills, persistent abdominal pain, routine checkup"
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Test Catalog Selection */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Select Diagnostic Tests * ({selectedTestIds.length} selected)
                  </label>
                  <span className="text-xs font-bold text-sky-700">
                    Total: ৳{orderTotal}
                  </span>
                </div>

                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search test catalog by name, code or specimen..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {filteredCatalog.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No diagnostic tests found.
                    </div>
                  ) : (
                    filteredCatalog.map((test) => {
                      const isChecked = selectedTestIds.includes(test.id);
                      return (
                        <div
                          key={test.id}
                          onClick={() => toggleTest(test.id)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition ${
                            isChecked ? "bg-sky-50/70" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                isChecked
                                  ? "bg-sky-600 border-sky-600 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-900">{test.test_name}</p>
                              <p className="text-[10px] text-slate-400">
                                Code: {test.test_code} • Specimen: {test.specimen_type}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 font-mono">
                            ৳{test.price}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex justify-end items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOrder || selectedTestIds.length === 0}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {submittingOrder ? "Creating Order..." : `Place Order (৳${orderTotal})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
