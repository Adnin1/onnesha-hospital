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
  Cpu,
  DollarSign,
  FileEdit,
  Send,
} from "lucide-react";
import { DiagnosticOrderRecord, DiagnosticParameterRecord } from "@/types/clinical-emr";
import { DoctorRecord } from "@/types/appointments";
import { PatientMaster } from "@/types/clinical";
import {
  getDiagnosticOrdersAction,
  verifyDiagnosticReportAction,
  getDiagnosticTestsCatalogAction,
  createDiagnosticOrderAction,
  collectSampleAction,
  deliverDiagnosticOrderAction,
} from "@/lib/lab/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";
import { Toast } from "@/components/ui/Toast";
import { LisAnalyzerModal } from "@/components/lab/LisAnalyzerModal";
import { TestTariffManager } from "@/components/lab/TestTariffManager";
import { LabResultEntryModal } from "@/components/lab/LabResultEntryModal";

export default function LabManagementPage() {
  const [activeView, setActiveView] = useState<"orders" | "tariffs">("orders");
  const [labOrders, setLabOrders] = useState<DiagnosticOrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DiagnosticOrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [collectingSample, setCollectingSample] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  // Production-grade Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  // New Order Modal State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isLisModalOpen, setIsLisModalOpen] = useState(false);
  const [selectedForLis, setSelectedForLis] = useState<DiagnosticOrderRecord | null>(null);
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
          let patList = patRes.data.patients;
          const urlParamPatientId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("patientId")
              : null;

          if (urlParamPatientId) {
            let matched = patList.find((p) => p.id === urlParamPatientId);
            if (!matched) {
              // Direct query fallback if patient outside initial 50
              const singlePatRes = await searchPatientsAction({ query: urlParamPatientId });
              if (singlePatRes.success && singlePatRes.data?.patients && singlePatRes.data.patients.length > 0) {
                matched = singlePatRes.data.patients[0];
                patList = [matched, ...patList];
              }
            }
            if (matched) {
              setSelectedPatientId(matched.id);
              setIsOrderModalOpen(true);
            }
          } else if (patList.length > 0) {
            setSelectedPatientId(patList[0].id);
          }
          setPatients(patList);
        }
        setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isOrderModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOrderModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOrderModalOpen]);

  const refreshCatalog = async () => {
    const catalogRes = await getDiagnosticTestsCatalogAction();
    if (catalogRes.success && catalogRes.data?.tests) {
      setTestCatalog(catalogRes.data.tests);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleVerifyReport = async (orderId: string) => {
    setVerifying(true);
    const res = await verifyDiagnosticReportAction({
      orderId,
      pathologistRemarks: "Reviewed and electronically validated by Consultant Clinical Pathologist",
    });
    setVerifying(false);

    if (res.success) {
      showToast("Diagnostic report verified and locked successfully.", "success");
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
      showToast(res.error || "Failed to verify diagnostic report", "error");
    }
  };

  const handleCollectSample = async (orderId: string) => {
    setCollectingSample(true);
    const res = await collectSampleAction({ orderId });
    setCollectingSample(false);
    if (res.success && res.data) {
      showToast(`নমুনা সফলভাবে গৃহীত হয়েছে। বারকোড: ${res.data.barcode}`, "success");
      setLabOrders((prev) =>
        prev.map((ord) =>
          ord.id === orderId ? { ...ord, status: "SAMPLE_COLLECTED", barcode: res.data!.barcode } : ord
        )
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, status: "SAMPLE_COLLECTED", barcode: res.data!.barcode } : null
        );
      }
    } else {
      showToast(res.error || "স্যাম্পল গ্রহণ ব্যর্থ হয়েছে", "error");
    }
  };

  const handleDeliverReport = async (orderId: string) => {
    setDelivering(true);
    const res = await deliverDiagnosticOrderAction(orderId);
    setDelivering(false);
    if (res.success) {
      showToast("রিপোর্ট রোগীর নিকট সফলভাবে ডেলিভারি সম্পন্ন হয়েছে।", "success");
      setLabOrders((prev) =>
        prev.map((ord) =>
          ord.id === orderId ? { ...ord, status: "DELIVERED" } : ord
        )
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, status: "DELIVERED" } : null
        );
      }
    } else {
      showToast(res.error || "ডেলিভারি আপডেট ব্যর্থ হয়েছে", "error");
    }
  };

  const reloadOrders = async () => {
    const ordersRes = await getDiagnosticOrdersAction();
    if (ordersRes.success && ordersRes.data?.orders) {
      setLabOrders(ordersRes.data.orders);
      if (selectedOrder) {
        const updated = ordersRes.data.orders.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
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
      showToast("Please select a registered patient.", "error");
      return;
    }
    if (selectedTestIds.length === 0) {
      showToast("Please select at least one test to order.", "error");
      return;
    }
    setSubmittingOrder(true);
    const res = await createDiagnosticOrderAction({
      patientId: selectedPatientId,
      referredByDoctorId: selectedDoctorId || undefined,
      testIds: selectedTestIds,
      clinicalNotes: clinicalNotes.trim() || undefined,
    });
    setSubmittingOrder(false);

    if (res.success && res.data) {
      showToast(`Diagnostic order #${res.data.orderNumber} placed successfully.`, "success");
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
      showToast(res.error || "Failed to create diagnostic order", "error");
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

  // Calculate gender and age specific reference ranges
  const getReferenceInterval = (
    p: DiagnosticParameterRecord,
    patient?: DiagnosticOrderRecord["patient"]
  ) => {
    const gender = patient?.gender?.toLowerCase();
    const age = patient?.age;
    if (age !== undefined && age < 12 && p.reference_range_child) {
      return p.reference_range_child;
    }
    if (gender === "female" && p.reference_range_female) {
      return p.reference_range_female;
    }
    return p.reference_range_male || "Normal range";
  };

  // Derive dynamic method according to clinical modality
  const getDiagnosticMethod = (order: DiagnosticOrderRecord) => {
    const codes = (order.tests || []).map((t) => t.test_code?.toUpperCase() || "");
    const specimens = (order.tests || []).map((t) => t.specimen_type?.toLowerCase() || "");

    if (codes.some((c) => c.includes("XRAY"))) return "Digital High-Frequency Radiography (P/A View)";
    if (codes.some((c) => c.includes("USG"))) return "High-Resolution Real-Time Ultrasonography (3.5/5.0 MHz)";
    if (codes.some((c) => c.includes("ECG"))) return "12-Lead Standard Electrocardiogram (50 mm/s)";
    if (specimens.includes("blood")) return "Automated Photometric & Five-Part Differential Flow Cytometry";
    if (specimens.includes("urine")) return "Automated Urine Chemistry & Brightfield Microscopic Examination";
    return "Standard Certified Hospital Laboratory Protocol";
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
            Phlebotomy barcoding, age/gender biological ranges, dual-gate clinical verification, and official letterhead printing.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsOrderModalOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ নতুন টেস্ট অর্ডার (New Order)</span>
          </button>
          <button
            onClick={() => {
              setSelectedForLis(null);
              setIsLisModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition"
            title="অটোমেটেড ল্যাব মেশিন RS232/LAN কানেকশন ও প্যাকেট ইনজেস্ট"
          >
            <Cpu className="w-4 h-4 text-slate-600" />
            <span>মেশিন কানেকশন (LIS)</span>
          </button>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 hidden sm:flex items-center">
            <FlaskConical className="w-4 h-4 mr-1.5 text-purple-600" />
            Lab Engine Online
          </span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 no-print">
        <button
          onClick={() => setActiveView("orders")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeView === "orders"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>ল্যাব অর্ডার ও পেশেন্ট রিপোর্ট (Orders & Reports)</span>
        </button>
        <button
          onClick={() => setActiveView("tariffs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeView === "tariffs"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span>টেস্ট ফি শিডিউল ও সার্ভিস রেট (Tariff Management)</span>
        </button>
      </div>

      {/* 4-Step Hospital Staff Lab Workflow Stepper */}
      {activeView === "orders" && (
        <div className="bg-gradient-to-r from-sky-50 via-purple-50 to-emerald-50 border border-sky-100 rounded-2xl p-4 no-print shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-sky-600" />
              <span>হাসপাতাল ল্যাব ও ডায়াগনস্টিক কার্যপ্রণালী (Staff Workflow Guide)</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
              ৪-ধাপে সম্পূর্ণ টেস্ট ও রিপোর্ট প্রসেসিং
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-sky-200 flex items-center gap-2 shadow-2xs">
              <span className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">১</span>
              <div>
                <p className="font-bold text-slate-800">টেস্ট অর্ডার গ্রহণ</p>
                <p className="text-[10px] text-slate-500">রোগীর টেস্ট সিলেক্ট করে অর্ডার দিন</p>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-purple-200 flex items-center gap-2 shadow-2xs">
              <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">২</span>
              <div>
                <p className="font-bold text-slate-800">নমুনা ও বারকোড</p>
                <p className="text-[10px] text-slate-500">স্যাম্পল গ্রহণ ও বারকোড জেনারেট</p>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-blue-200 flex items-center gap-2 shadow-2xs">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">৩</span>
              <div>
                <p className="font-bold text-slate-800">ফলাফল এন্ট্রি (Result)</p>
                <p className="text-[10px] text-slate-500">প্যারামিটার মান ও ফাইন্ডিংস ইনপুট</p>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2 shadow-2xs">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">৪</span>
              <div>
                <p className="font-bold text-slate-800">ডাক্তার স্বাক্ষর ও প্রিন্ট</p>
                <p className="text-[10px] text-slate-500">ভেরিফাই করে ডেলিভারি ও প্রিন্ট</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === "tariffs" ? (
        <TestTariffManager onCatalogChanged={refreshCatalog} />
      ) : (
        /* Main Grid */
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
                          {ord.barcode ? ord.barcode : "Sample Pending"} • {(ord.tests || []).map((t) => t.test_name).join(", ") || "General Panel"}
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
              <div className="flex flex-wrap justify-between items-center gap-3 no-print border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    Order #{selectedOrder.order_number}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                      selectedOrder.status === "DELIVERED"
                        ? "bg-purple-100 text-purple-800"
                        : selectedOrder.status === "VERIFIED"
                        ? "bg-emerald-100 text-emerald-800"
                        : selectedOrder.status === "PROCESSING"
                        ? "bg-blue-100 text-blue-800"
                        : selectedOrder.status === "SAMPLE_COLLECTED"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Step 2: Collect Sample if pending */}
                  {(!selectedOrder.barcode || selectedOrder.status === "ORDERED" || selectedOrder.status === "PAID") && (
                    <button
                      onClick={() => handleCollectSample(selectedOrder.id)}
                      disabled={collectingSample}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                      title="রোগীর কাছ থেকে স্যাম্পল গ্রহণ করুন এবং বারকোড আইডি বরাদ্দ করুন"
                    >
                      <Barcode className="w-4 h-4" />
                      <span>{collectingSample ? "বারকোড তৈরি হচ্ছে..." : "নমুনা গ্রহণ ও বারকোড"}</span>
                    </button>
                  )}

                  {/* Step 3: Enter / Edit Results (Available unless DELIVERED) */}
                  {selectedOrder.status !== "DELIVERED" && (
                    <button
                      onClick={() => setIsResultModalOpen(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                      title="পরীক্ষার সংখ্যাসূচক মান এবং বিবরণ এন্ট্রি করুন"
                    >
                      <FileEdit className="w-4 h-4" />
                      <span>ফলাফল এন্ট্রি / সম্পাদন</span>
                    </button>
                  )}

                  {/* Step 4: Doctor Verification & Sign */}
                  {selectedOrder.status !== "VERIFIED" && selectedOrder.status !== "DELIVERED" && (
                    <button
                      onClick={() => handleVerifyReport(selectedOrder.id)}
                      disabled={verifying}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                      title="প্যাথলজিস্ট / রেডিওলজিস্ট ডাক্তারের ইলেকট্রনিক স্বাক্ষর ও অনুমোদন"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{verifying ? "যাচাই হচ্ছে..." : "ডাক্তার অনুমোদন ও স্বাক্ষর"}</span>
                    </button>
                  )}

                  {/* Step 5: Deliver Report to Patient */}
                  {selectedOrder.status === "VERIFIED" && (
                    <button
                      onClick={() => handleDeliverReport(selectedOrder.id)}
                      disabled={delivering}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                      title="রোগীকে ফাইনাল প্রিন্টসহ রিপোর্ট প্রদান সম্পন্ন করুন"
                    >
                      <Send className="w-4 h-4" />
                      <span>{delivering ? "ডেলিভারি হচ্ছে..." : "রিপোর্ট ডেলিভারি সম্পন্ন"}</span>
                    </button>
                  )}

                  {/* LIS Analyzer Machine Connection (Auxiliary) */}
                  <button
                    onClick={() => {
                      setSelectedForLis(selectedOrder);
                      setIsLisModalOpen(true);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 rounded-xl text-xs font-semibold transition shadow-xs"
                    title="অটোমেটেড ল্যাব অ্যানালাইজার মেশিন থেকে সরাসরি সিরিয়াল/নেটওয়ার্ক প্যাকেট রিড করুন"
                  >
                    <Cpu className="w-4 h-4 text-slate-600" />
                    <span>মেশিন ইনজেস্ট (LIS)</span>
                  </button>

                  {/* Print Report */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>প্রিন্ট রিপোর্ট</span>
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
                    {selectedOrder.barcode ? (
                      <span className="font-mono font-bold text-purple-700">{selectedOrder.barcode}</span>
                    ) : (
                      <span className="text-slate-400 italic">Sample Collection Pending</span>
                    )}
                  </div>
                </div>

                {/* Clinical Notes if entered */}
                {selectedOrder.clinical_notes && (
                  <div className="p-3 bg-slate-50/60 border border-slate-200 rounded-xl text-xs">
                    <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">
                      Clinical Indication / Notes
                    </span>
                    <p className="text-slate-800 font-medium mt-0.5">{selectedOrder.clinical_notes}</p>
                  </div>
                )}

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
                              className={p.is_abnormal ? "bg-amber-50/60 font-semibold text-slate-900" : ""}
                            >
                              <td className="p-2.5 font-medium text-slate-800">{p.parameter_name}</td>
                              <td className="p-2.5 font-mono">
                                {p.observed_value ? (
                                  <span className="font-semibold text-slate-900">
                                    {p.observed_value}{" "}
                                    {p.is_abnormal && (
                                      <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded ml-1">
                                        OUT OF RANGE
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-amber-700 italic font-sans font-medium text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    অপেক্ষমান (Pending)
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-center text-slate-500 font-mono">{p.unit || "-"}</td>
                              <td className="p-2.5 text-slate-600 font-mono text-[11px]">
                                {getReferenceInterval(p, selectedOrder.patient)}
                              </td>
                            </tr>
                          ));
                        }
                        return (
                          <tr key={tIdx}>
                            <td className="p-2.5 font-semibold text-slate-900" colSpan={2}>
                              {t.test_name}
                              {t.descriptive_findings ? (
                                <div className="font-normal text-slate-700 mt-1 whitespace-pre-line text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                  {t.descriptive_findings}
                                </div>
                              ) : (
                                <p className="font-normal text-amber-700 italic text-[11px] mt-1 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                                  বিবরণমূলক রিপোর্ট অপেক্ষমান — &apos;ফলাফল এন্ট্রি&apos; বাটনে ক্লিক করে ফলাফল লিখুন
                                </p>
                              )}
                            </td>
                            <td className="p-2.5 text-center text-slate-500 font-mono">-</td>
                            <td className="p-2.5 text-slate-500 text-[11px]">Descriptive Evaluation</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 mt-1.5 italic">
                    * Biological reference intervals calibrated for patient gender and chronological age.
                  </p>

                  {/* Pathologist Remarks if available */}
                  {selectedOrder.pathologist_remarks && (
                    <div className="mt-4 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs">
                      <span className="text-emerald-700 text-[10px] font-bold block uppercase tracking-wider">
                        Pathologist / Doctor Remarks (পরামর্শ)
                      </span>
                      <p className="text-slate-800 font-medium mt-0.5">{selectedOrder.pathologist_remarks}</p>
                    </div>
                  )}
                </div>

                {/* Verification Footer */}
                <div className="mt-12 pt-6 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
                  <div>
                    <p className="font-semibold text-slate-800">
                      Method: {getDiagnosticMethod(selectedOrder)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Standard Quality Control: Bio-Rad External Quality Assurance Certified
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="w-44 border-b border-slate-400 mb-1 ml-auto"></div>
                    <p className="font-bold text-slate-900">
                      {selectedOrder.status === "VERIFIED"
                        ? selectedOrder.verified_by_doctor?.full_name
                          ? `Dr. ${selectedOrder.verified_by_doctor.full_name}`
                          : "Consultant Pathologist (Authorized)"
                        : "Pending Verification"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {selectedOrder.status === "VERIFIED"
                        ? `Electronically Authorized ${selectedOrder.verified_at ? formatDateBDT(selectedOrder.verified_at) : ""}`
                        : "Consultant Clinical Pathologist"}
                    </p>
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
    )}

      {/* New Diagnostic Order Modal */}
      {isOrderModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsOrderModalOpen(false)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* LIS Analyzer Integration Modal */}
      <LisAnalyzerModal
        isOpen={isLisModalOpen}
        onClose={() => setIsLisModalOpen(false)}
        selectedOrderNumber={selectedForLis?.order_number || selectedOrder?.order_number}
        selectedSampleBarcode={selectedForLis?.sample_barcode || selectedForLis?.barcode || selectedOrder?.sample_barcode || selectedOrder?.barcode}
        onResultsApplied={async () => {
          const ordersRes = await getDiagnosticOrdersAction();
          if (ordersRes.success && ordersRes.data?.orders) {
            setLabOrders(ordersRes.data.orders);
            const updated = ordersRes.data.orders.find(
              (o) => o.id === (selectedForLis?.id || selectedOrder?.id)
            );
            if (updated) setSelectedOrder(updated);
          }
        }}
        onToast={showToast}
      />

      {/* Manual Diagnostic Result Entry Modal */}
      {selectedOrder && (
        <LabResultEntryModal
          key={selectedOrder.id}
          isOpen={isResultModalOpen}
          onClose={() => setIsResultModalOpen(false)}
          order={selectedOrder}
          onSaved={reloadOrders}
          onToast={showToast}
        />
      )}

      {/* Production Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
