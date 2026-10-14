"use client";

import React, { useState, useEffect } from "react";
import {
  ShoppingCart,
  Plus,
  Search,
  Loader2,
  RefreshCw,
  PackageCheck,
  Building2,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Truck,
  Sparkles,
} from "lucide-react";
import {
  PurchaseRequisitionRecord,
  GoodsReceiptNoteRecord,
  WarehouseRecord,
  getPurchaseRequisitionsAction,
  createPurchaseRequisitionAction,
  updatePurchaseRequisitionStatusAction,
  getGoodsReceiptNotesAction,
  createGoodsReceiptNoteAction,
  getWarehousesAction,
  createWarehouseAction,
} from "@/lib/procurement/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<"REQUISITIONS" | "GRN" | "WAREHOUSES">("REQUISITIONS");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data
  const [requisitions, setRequisitions] = useState<PurchaseRequisitionRecord[]>([]);
  const [grns, setGrns] = useState<GoodsReceiptNoteRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Requisition Modal
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [reqNumber, setReqNumber] = useState("");
  const [reqPriority, setReqPriority] = useState<"LOW" | "NORMAL" | "URGENT" | "EMERGENCY">("NORMAL");
  const [reqNotes, setReqNotes] = useState("");
  const [reqItems, setReqItems] = useState<
    Array<{ item_name: string; item_category: string; quantity: number; estimated_unit_cost: number }>
  >([
    { item_name: "", item_category: "CONSUMABLE", quantity: 1, estimated_unit_cost: 0 },
  ]);

  // GRN Modal
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [grnNumber, setGrnNumber] = useState("");
  const [grnNotes, setGrnNotes] = useState("");
  const [grnItems, setGrnItems] = useState<
    Array<{ item_name: string; quantity_received: number; unit_cost: number; batch_number: string; expiry_date: string }>
  >([
    { item_name: "", quantity_received: 1, unit_cost: 0, batch_number: "", expiry_date: "" },
  ]);

  // Warehouse Modal
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whLocation, setWhLocation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const applyQuickReqTemplate = (templateType: "SURGICAL" | "REAGENTS" | "ICU_SUPPLIES") => {
    setActiveTab("REQUISITIONS");
    setReqNumber(`PR-${Date.now().toString().slice(-6)}`);
    if (templateType === "SURGICAL") {
      setReqPriority("URGENT");
      setReqNotes("OT Emergency Surgical Requisition - Sutures, Sterile Gloves, Blade 11");
      setReqItems([
        { item_name: "Surgical Sterile Gloves 7.0 (Pairs)", item_category: "CONSUMABLE", quantity: 50, estimated_unit_cost: 45 },
        { item_name: "Vicryl 2-0 Suture with Needle", item_category: "SURGICAL", quantity: 20, estimated_unit_cost: 320 },
        { item_name: "Disposable Surgical Blade No 11", item_category: "SURGICAL", quantity: 100, estimated_unit_cost: 15 },
      ]);
    } else if (templateType === "REAGENTS") {
      setReqPriority("NORMAL");
      setReqNotes("Monthly Clinical Pathology Diagnostic Reagent Restock");
      setReqItems([
        { item_name: "CBC Diluent & Lyse Reagent Pack (20L)", item_category: "LAB_REAGENT", quantity: 2, estimated_unit_cost: 8500 },
        { item_name: "Serum Creatinine Kit (Jaffe Method)", item_category: "LAB_REAGENT", quantity: 3, estimated_unit_cost: 2400 },
        { item_name: "Vacutainer EDTA Blood Collection Tubes (100 pcs)", item_category: "CONSUMABLE", quantity: 5, estimated_unit_cost: 650 },
      ]);
    } else {
      setReqPriority("EMERGENCY");
      setReqNotes("ICU / Emergency Life Support Consumables Restock");
      setReqItems([
        { item_name: "Endotracheal Tube Size 7.5 Cuffed", item_category: "MEDICAL_DEVICE", quantity: 10, estimated_unit_cost: 180 },
        { item_name: "High Flow Oxygen Mask with Reservoir", item_category: "CONSUMABLE", quantity: 15, estimated_unit_cost: 220 },
        { item_name: "Normal Saline 1000ml Infusion Bags", item_category: "MEDICINE", quantity: 40, estimated_unit_cost: 85 },
      ]);
    }
    setIsReqModalOpen(true);
  };

  const applyQuickGrnTemplate = () => {
    setActiveTab("GRN");
    setGrnNumber(`GRN-${Date.now().toString().slice(-6)}`);
    setGrnNotes("Standard Stock Delivery from Verified Pharmaceutical Supplier");
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 2);
    const expDateStr = nextYear.toISOString().split("T")[0];
    setGrnItems([
      { item_name: "Inj. Ceftriaxone 1g IV/IM", quantity_received: 100, unit_cost: 125, batch_number: `BCH-${Date.now().toString().slice(-4)}A`, expiry_date: expDateStr },
      { item_name: "Normal Saline 0.9% 1000ml", quantity_received: 50, unit_cost: 82, batch_number: `BCH-${Date.now().toString().slice(-4)}B`, expiry_date: expDateStr },
    ]);
    setIsGrnModalOpen(true);
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [reqRes, grnRes, whRes] = await Promise.all([
        getPurchaseRequisitionsAction({ limit: 50 }),
        getGoodsReceiptNotesAction({ limit: 50 }),
        getWarehousesAction(),
      ]);

      if (!reqRes.success) throw new Error(reqRes.error || "Failed to load requisitions");
      setRequisitions(reqRes.data?.requisitions || []);

      if (!grnRes.success) throw new Error(grnRes.error || "Failed to load GRNs");
      setGrns(grnRes.data?.grns || []);

      if (!whRes.success) throw new Error(whRes.error || "Failed to load warehouses");
      setWarehouses(whRes.data?.warehouses || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading procurement data";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [reqRes, grnRes, whRes] = await Promise.all([
          getPurchaseRequisitionsAction({ limit: 50 }),
          getGoodsReceiptNotesAction({ limit: 50 }),
          getWarehousesAction(),
        ]);

        if (isMounted) {
          if (reqRes.success && reqRes.data) setRequisitions(reqRes.data.requisitions);
          if (grnRes.success && grnRes.data) setGrns(grnRes.data.grns);
          if (whRes.success && whRes.data) setWarehouses(whRes.data.warehouses);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Error loading procurement data";
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reqItems.length === 0 || !reqItems[0].item_name) {
      setErrorMsg("Please provide at least one item name");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createPurchaseRequisitionAction({
        requisition_number: reqNumber,
        priority: reqPriority,
        notes: reqNotes,
        items: reqItems.map((i) => ({
          item_name: i.item_name,
          item_category: i.item_category,
          quantity: Number(i.quantity) || 1,
          estimated_unit_cost: Number(i.estimated_unit_cost) || 0,
        })),
      });

      if (!res.success) throw new Error(res.error || "Failed to create requisition");

      setSuccessMsg(`Purchase Requisition ${res.data?.requisition.requisition_number} created.`);
      setIsReqModalOpen(false);
      setReqNumber(`PR-${Date.now().toString().slice(-6)}`);
      setReqNotes("");
      setReqItems([{ item_name: "", item_category: "CONSUMABLE", quantity: 1, estimated_unit_cost: 0 }]);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating requisition";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateReqStatus = async (
    reqId: string,
    newStatus: "PENDING" | "APPROVED" | "REJECTED" | "CONVERTED_TO_PO"
  ) => {
    try {
      const res = await updatePurchaseRequisitionStatusAction({
        requisition_id: reqId,
        status: newStatus,
      });
      if (!res.success) throw new Error(res.error || "Failed to update status");
      setSuccessMsg(`Requisition status updated to ${newStatus}.`);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating requisition status";
      setErrorMsg(msg);
    }
  };

  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grnItems.length === 0 || !grnItems[0].item_name) {
      setErrorMsg("Please provide at least one received item name");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createGoodsReceiptNoteAction({
        grn_number: grnNumber,
        notes: grnNotes,
        items: grnItems.map((i) => ({
          item_name: i.item_name,
          quantity_received: Number(i.quantity_received) || 1,
          unit_cost: Number(i.unit_cost) || 0,
          batch_number: i.batch_number,
          expiry_date: i.expiry_date || undefined,
        })),
      });

      if (!res.success) throw new Error(res.error || "Failed to create GRN");

      setSuccessMsg(`Goods Receipt Note ${res.data?.grn.grn_number} verified and stored.`);
      setIsGrnModalOpen(false);
      setGrnNumber(`GRN-${Date.now().toString().slice(-6)}`);
      setGrnNotes("");
      setGrnItems([{ item_name: "", quantity_received: 1, unit_cost: 0, batch_number: "", expiry_date: "" }]);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating GRN";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whCode.trim() || !whName.trim()) {
      setErrorMsg("Warehouse Code and Name are required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createWarehouseAction({
        warehouse_code: whCode,
        warehouse_name: whName,
        location: whLocation || undefined,
      });
      if (!res.success) throw new Error(res.error || "Failed to create warehouse");
      setSuccessMsg(`Warehouse "${res.data?.warehouse.warehouse_code}" created successfully.`);
      setIsWarehouseModalOpen(false);
      setWhCode("");
      setWhName("");
      setWhLocation("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating warehouse";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequisitions = requisitions.filter(
    (r) =>
      r.requisition_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-sky-600" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Procurement, Requisitions & Supply Chain
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Departmental purchase requests, supplier Goods Receipt Notes (GRN), and multi-warehouse control.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setReqNumber(`PR-${Date.now().toString().slice(-6)}`);
              setIsReqModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Requisition
          </button>
          <button
            onClick={() => {
              setGrnNumber(`GRN-${Date.now().toString().slice(-6)}`);
              setIsGrnModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Record GRN
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2 border border-slate-300 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 📦 Baby-Simple Admin Guide Banner for Procurement & GRN */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 rounded-2xl p-5 shadow-xs transition-all">
        <div className="flex justify-between items-start cursor-pointer" onClick={() => setShowGuide(!showGuide)}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  হাসপাতাল প্রকিউরমেন্ট, রিকুইজিশন ও জিআরএন ব্যবহারের সহজ নির্দেশিকা (Easy Procurement & GRN Guide)
                </h3>
                <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Admin Master Guide
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                হাসপাতালের প্রতিটি ডিপার্টমেন্টের মালামালের চাহিদা, অনুমোদন, চালান গ্রহণ (GRN) ও স্টক নিয়ন্ত্রণের ৪টি সহজ নিয়ম
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 hover:bg-emerald-200/50 rounded-lg text-slate-600 transition cursor-pointer"
            aria-label="Toggle Guide"
          >
            {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {showGuide && (
          <div className="mt-4 pt-4 border-t border-emerald-200/70 space-y-4 text-xs">
            {/* 4 Steps Visual Flow */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white/80 p-3.5 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-800 font-bold mb-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">১</span>
                  <span>চাহিদা তৈরি (Requisition)</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  যেকোনো বিভাগ (ওটি, আইসিইউ, ল্যাব) থেকে প্রয়োজনীয় সামগ্রীর তালিকা করে <strong>&quot;New Requisition&quot;</strong> তৈরি করুন।
                </p>
              </div>

              <div className="bg-white/80 p-3.5 rounded-xl border border-teal-200">
                <div className="flex items-center gap-2 text-teal-800 font-bold mb-1">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">২</span>
                  <span>অ্যাডমিন অনুমোদন (Approve)</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  তালিকায় থাকা রিকুইজিশনটি যাচাই করে অ্যাডমিন <strong>&quot;Approve&quot;</strong> বাটনে ক্লিক করে অনুমোদন দেবেন।
                </p>
              </div>

              <div className="bg-white/80 p-3.5 rounded-xl border border-sky-200">
                <div className="flex items-center gap-2 text-sky-800 font-bold mb-1">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px]">৩</span>
                  <span>পণ্য গ্রহণ (Record GRN)</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  সাপ্লায়ার পণ্য ডেলিভারি দিলে চালান দেখে <strong>&quot;Record GRN&quot;</strong>-এ পণ্যের পরিমাণ, ব্যাচ নম্বর ও মেয়াদ এন্ট্রি করুন।
                </p>
              </div>

              <div className="bg-white/80 p-3.5 rounded-xl border border-indigo-200">
                <div className="flex items-center gap-2 text-indigo-800 font-bold mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">৪</span>
                  <span>স্টক ও লেজার সিঙ্ক (Auto Sync)</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  জিআরএন সেভ হওয়ামাত্র স্বয়ংক্রিয়ভাবে মেইন ওয়্যারহাউসে স্টক জমা হবে এবং অ্যাকাউন্টিং লেজারে ইনভেন্টরি জার্নাল তৈরি হবে।
                </p>
              </div>
            </div>

            {/* 1-Click Quick Demo Actions */}
            <div className="bg-white/90 p-3 rounded-xl border border-emerald-300 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-800">১-ক্লিক দ্রুত রিকুইজিশন ও জিআরএন শুরু করুন (Quick Start Templates):</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyQuickReqTemplate("SURGICAL")}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-300 text-[11px] transition cursor-pointer"
                >
                  ✂️ জরুরি ওটি সার্জিক্যাল মালামাল (OT Supplies)
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickReqTemplate("REAGENTS")}
                  className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold rounded-lg border border-teal-300 text-[11px] transition cursor-pointer"
                >
                  🧪 প্যাথলজি ল্যাব রিএজেন্ট (Lab Reagents)
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickReqTemplate("ICU_SUPPLIES")}
                  className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold rounded-lg border border-sky-300 text-[11px] transition cursor-pointer"
                >
                  🫁 আইসিইউ লাইফ সাপোর্ট সামগ্রী (ICU Consumables)
                </button>
                <button
                  type="button"
                  onClick={applyQuickGrnTemplate}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg border border-indigo-300 text-[11px] transition cursor-pointer flex items-center gap-1"
                >
                  <Truck className="w-3.5 h-3.5" /> পণ্য চালান গ্রহণ (Demo GRN)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          onClick={() => setActiveTab("REQUISITIONS")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "REQUISITIONS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ShoppingCart className="h-4 w-4" /> Requisitions ({requisitions.length})
        </button>
        <button
          onClick={() => setActiveTab("GRN")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "GRN"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <PackageCheck className="h-4 w-4" /> Goods Receipt Notes ({grns.length})
        </button>
        <button
          onClick={() => setActiveTab("WAREHOUSES")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "WAREHOUSES"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Building2 className="h-4 w-4" /> Warehouses ({warehouses.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <span className="ml-3 text-sm">Loading procurement registry...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: REQUISITIONS */}
          {activeTab === "REQUISITIONS" && (
            <div className="space-y-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search requisitions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">PR #</th>
                      <th className="px-6 py-3 font-semibold">Priority</th>
                      <th className="px-6 py-3 font-semibold">Items</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Created Date</th>
                      <th className="px-6 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequisitions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                          No purchase requisitions found. Click &quot;New Requisition&quot; to initiate a request.
                        </td>
                      </tr>
                    ) : (
                      filteredRequisitions.map((req) => (
                        <React.Fragment key={req.id}>
                          <tr className="hover:bg-slate-50/70 transition">
                            <td className="px-6 py-4 font-mono font-bold text-sky-700">
                              {req.requisition_number}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  req.priority === "URGENT" || req.priority === "EMERGENCY"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                                }`}
                              >
                                {req.priority}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-700 font-medium">
                              {req.items?.length || 0} line items
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  req.status === "APPROVED"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : req.status === "CONVERTED_TO_PO"
                                    ? "bg-sky-50 text-sky-700 border border-sky-200"
                                    : req.status === "REJECTED"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {req.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-500 font-medium text-xs">
                              {new Date(req.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {req.status === "PENDING" && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleUpdateReqStatus(req.id, "APPROVED")}
                                    className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleUpdateReqStatus(req.id, "REJECTED")}
                                    className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {req.status === "APPROVED" && (
                                <button
                                  onClick={() => handleUpdateReqStatus(req.id, "CONVERTED_TO_PO")}
                                  className="px-2.5 py-1 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition cursor-pointer"
                                >
                                  Convert to PO
                                </button>
                              )}
                              {req.status === "CONVERTED_TO_PO" && (
                                <span className="text-[11px] font-bold text-slate-400">PO Active</span>
                              )}
                              {req.status === "REJECTED" && (
                                <span className="text-[11px] font-bold text-rose-500">Rejected</span>
                              )}
                            </td>
                          </tr>
                          {req.items && req.items.length > 0 && (
                            <tr className="bg-slate-50/70 text-xs">
                              <td colSpan={6} className="px-8 py-2.5 border-t border-slate-100">
                                <div className="space-y-1">
                                  {req.items.map((it, idx) => (
                                    <div key={idx} className="flex justify-between text-slate-600 font-mono">
                                      <span>{it.item_name} ({it.item_category})</span>
                                      <span className="font-semibold">Qty: {it.quantity} @ {formatCurrencyBDT(it.estimated_unit_cost)}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: GOODS RECEIPT NOTES */}
          {activeTab === "GRN" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">GRN #</th>
                    <th className="px-6 py-3 font-semibold">Received Date</th>
                    <th className="px-6 py-3 font-semibold text-right">Total Cost (BDT)</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No Goods Receipt Notes verified yet.
                      </td>
                    </tr>
                  ) : (
                    grns.map((grn) => (
                      <React.Fragment key={grn.id}>
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="px-6 py-4 font-mono font-bold text-sky-700">
                            {grn.grn_number}
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-medium text-xs">
                            {new Date(grn.received_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBDT(grn.total_received_cost)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              {grn.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 text-xs font-medium">
                            {grn.notes || "—"}
                          </td>
                        </tr>
                        {grn.items && grn.items.length > 0 && (
                          <tr className="bg-slate-50/70 text-xs">
                            <td colSpan={5} className="px-8 py-2.5 border-t border-slate-100">
                              <div className="space-y-1">
                                {grn.items.map((it, idx) => (
                                  <div key={idx} className="flex justify-between text-slate-600 font-mono">
                                    <span>{it.item_name} (Batch: {it.batch_number || "N/A"})</span>
                                    <span className="font-semibold">
                                      {it.quantity_received} units @ {formatCurrencyBDT(it.unit_cost)} = {formatCurrencyBDT(it.total_cost)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: WAREHOUSES */}
          {activeTab === "WAREHOUSES" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hospital Storage Vaults & Warehouses</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Manage centralized pharmaceutical storage, OT consumable vaults, and logistics depots.</p>
                </div>
                <button
                  onClick={() => {
                    setWhCode(`WH-${Date.now().toString().slice(-4)}`);
                    setIsWarehouseModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-sky-600 text-white hover:bg-sky-700 shadow-xs transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> + Add Warehouse
                </button>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Warehouse Code</th>
                    <th className="px-6 py-3 font-semibold">Warehouse Name</th>
                    <th className="px-6 py-3 font-semibold">Location</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warehouses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        No secondary warehouses configured. Default main storage in use.
                      </td>
                    </tr>
                  ) : (
                    warehouses.map((wh) => (
                      <tr key={wh.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-6 py-4 font-mono font-bold text-sky-700">
                          {wh.warehouse_code}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {wh.warehouse_name}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{wh.location || "Central"}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            ● ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL: NEW REQUISITION */}
      {isReqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-900">
                Create Purchase Requisition
              </h3>
              <button
                onClick={() => setIsReqModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequisition} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Requisition #
                  </label>
                  <input
                    type="text"
                    required
                    value={reqNumber}
                    onChange={(e) => setReqNumber(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Priority
                  </label>
                  <select
                    value={reqPriority}
                    onChange={(e) => setReqPriority(e.target.value as "LOW" | "NORMAL" | "URGENT" | "EMERGENCY")}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="URGENT">URGENT</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Requisition Items
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setReqItems([
                        ...reqItems,
                        { item_name: "", item_category: "CONSUMABLE", quantity: 1, estimated_unit_cost: 0 },
                      ])
                    }
                    className="text-xs text-sky-600 hover:underline font-bold cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                {reqItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      required
                      placeholder="Item Description"
                      value={item.item_name}
                      onChange={(e) => {
                        const updated = [...reqItems];
                        updated[idx].item_name = e.target.value;
                        setReqItems(updated);
                      }}
                      className="col-span-6 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...reqItems];
                        updated[idx].quantity = parseInt(e.target.value) || 1;
                        setReqItems(updated);
                      }}
                      className="col-span-2 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Est. Unit Cost"
                      value={item.estimated_unit_cost || ""}
                      onChange={(e) => {
                        const updated = [...reqItems];
                        updated[idx].estimated_unit_cost = parseFloat(e.target.value) || 0;
                        setReqItems(updated);
                      }}
                      className="col-span-3 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    {reqItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setReqItems(reqItems.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Notes / Justification
                </label>
                <textarea
                  rows={2}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Clinical department justification..."
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsReqModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Submitting..." : "Submit Requisition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW GRN */}
      {isGrnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-900">
                Record Goods Receipt Note (GRN)
              </h3>
              <button
                onClick={() => setIsGrnModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGrn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  GRN #
                </label>
                <input
                  type="text"
                  required
                  value={grnNumber}
                  onChange={(e) => setGrnNumber(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              {/* GRN Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Received Goods
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGrnItems([
                        ...grnItems,
                        { item_name: "", quantity_received: 1, unit_cost: 0, batch_number: "", expiry_date: "" },
                      ])
                    }
                    className="text-xs text-sky-600 hover:underline font-bold cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                {grnItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      required
                      placeholder="Item Name"
                      value={item.item_name}
                      onChange={(e) => {
                        const updated = [...grnItems];
                        updated[idx].item_name = e.target.value;
                        setGrnItems(updated);
                      }}
                      className="col-span-4 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity_received}
                      onChange={(e) => {
                        const updated = [...grnItems];
                        updated[idx].quantity_received = parseInt(e.target.value) || 1;
                        setGrnItems(updated);
                      }}
                      className="col-span-2 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit Cost"
                      value={item.unit_cost || ""}
                      onChange={(e) => {
                        const updated = [...grnItems];
                        updated[idx].unit_cost = parseFloat(e.target.value) || 0;
                        setGrnItems(updated);
                      }}
                      className="col-span-2 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="text"
                      placeholder="Batch #"
                      value={item.batch_number}
                      onChange={(e) => {
                        const updated = [...grnItems];
                        updated[idx].batch_number = e.target.value;
                        setGrnItems(updated);
                      }}
                      className="col-span-3 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    {grnItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setGrnItems(grnItems.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Receiving Notes / Supplier Invoice
                </label>
                <textarea
                  rows={2}
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  placeholder="Supplier challan number, delivery condition..."
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsGrnModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Verifying..." : "Verify & Receive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW WAREHOUSE */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-600" />
                <h3 className="text-lg font-extrabold text-slate-900">Add Storage Warehouse</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWarehouseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Warehouse Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WH-EMERGENCY"
                  value={whCode}
                  onChange={(e) => setWhCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Warehouse Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Emergency Room Consumable Vault"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Location / Floor
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ground Floor, ER Triage Wing"
                  value={whLocation}
                  onChange={(e) => setWhLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Creating..." : "Save Warehouse"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
