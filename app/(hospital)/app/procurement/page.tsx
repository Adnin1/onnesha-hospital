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
} from "lucide-react";
import {
  PurchaseRequisitionRecord,
  GoodsReceiptNoteRecord,
  WarehouseRecord,
  getPurchaseRequisitionsAction,
  createPurchaseRequisitionAction,
  getGoodsReceiptNotesAction,
  createGoodsReceiptNoteAction,
  getWarehousesAction,
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

  const [submitting, setSubmitting] = useState(false);

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

  const filteredRequisitions = requisitions.filter(
    (r) =>
      r.requisition_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Procurement, Requisitions & Supply Chain
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Departmental purchase requests, supplier Goods Receipt Notes (GRN), and multi-warehouse control.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setReqNumber(`PR-${Date.now().toString().slice(-6)}`);
              setIsReqModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
          >
            <Plus className="h-4 w-4" /> New Requisition
          </button>
          <button
            onClick={() => {
              setGrnNumber(`GRN-${Date.now().toString().slice(-6)}`);
              setIsGrnModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition"
          >
            <Plus className="h-4 w-4" /> Record GRN
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("REQUISITIONS")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "REQUISITIONS"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <ShoppingCart className="h-4 w-4" /> Requisitions ({requisitions.length})
        </button>
        <button
          onClick={() => setActiveTab("GRN")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "GRN"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <PackageCheck className="h-4 w-4" /> Goods Receipt Notes ({grns.length})
        </button>
        <button
          onClick={() => setActiveTab("WAREHOUSES")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "WAREHOUSES"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
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
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">PR #</th>
                    <th className="px-6 py-3 font-semibold">Priority</th>
                    <th className="px-6 py-3 font-semibold">Items</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Created Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No purchase requisitions found. Click &quot;New Requisition&quot; to initiate a request.
                      </td>
                    </tr>
                  ) : (
                    filteredRequisitions.map((req) => (
                      <React.Fragment key={req.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {req.requisition_number}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                req.priority === "URGENT" || req.priority === "EMERGENCY"
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {req.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                            {req.items?.length || 0} line items
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {req.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs">
                            {new Date(req.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                        {req.items && req.items.length > 0 && (
                          <tr className="bg-slate-50/40 dark:bg-slate-800/20 text-xs">
                            <td colSpan={5} className="px-8 py-2">
                              <div className="space-y-1">
                                {req.items.map((it, idx) => (
                                  <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400">
                                    <span>{it.item_name} ({it.item_category})</span>
                                    <span>Qty: {it.quantity} @ {formatCurrencyBDT(it.estimated_unit_cost)}</span>
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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">GRN #</th>
                    <th className="px-6 py-3 font-semibold">Received Date</th>
                    <th className="px-6 py-3 font-semibold text-right">Total Cost (BDT)</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {grns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No Goods Receipt Notes verified yet.
                      </td>
                    </tr>
                  ) : (
                    grns.map((grn) => (
                      <React.Fragment key={grn.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {grn.grn_number}
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs">
                            {new Date(grn.received_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatCurrencyBDT(grn.total_received_cost)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              {grn.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs">
                            {grn.notes || "—"}
                          </td>
                        </tr>
                        {grn.items && grn.items.length > 0 && (
                          <tr className="bg-slate-50/40 dark:bg-slate-800/20 text-xs">
                            <td colSpan={5} className="px-8 py-2">
                              <div className="space-y-1">
                                {grn.items.map((it, idx) => (
                                  <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-400 font-mono">
                                    <span>{it.item_name} (Batch: {it.batch_number || "N/A"})</span>
                                    <span>
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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Warehouse Code</th>
                    <th className="px-6 py-3 font-semibold">Warehouse Name</th>
                    <th className="px-6 py-3 font-semibold">Location</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {warehouses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        No secondary warehouses configured. Default main storage in use.
                      </td>
                    </tr>
                  ) : (
                    warehouses.map((wh) => (
                      <tr key={wh.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                          {wh.warehouse_code}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                          {wh.warehouse_name}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{wh.location || "Central"}</td>
                        <td className="px-6 py-4">
                          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Create Purchase Requisition
              </h3>
              <button
                onClick={() => setIsReqModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequisition} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Requisition #
                  </label>
                  <input
                    type="text"
                    required
                    value={reqNumber}
                    onChange={(e) => setReqNumber(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Priority
                  </label>
                  <select
                    value={reqPriority}
                    onChange={(e) => setReqPriority(e.target.value as "LOW" | "NORMAL" | "URGENT" | "EMERGENCY")}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                  <span className="text-xs font-bold uppercase text-slate-500">
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
                    className="text-xs text-sky-600 hover:underline font-medium"
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
                      className="col-span-6 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-2 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-3 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                    />

                    {reqItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setReqItems(reqItems.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Notes / Justification
                </label>
                <textarea
                  rows={2}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Clinical department justification..."
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReqModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Record Goods Receipt Note (GRN)
              </h3>
              <button
                onClick={() => setIsGrnModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGrn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  GRN #
                </label>
                <input
                  type="text"
                  required
                  value={grnNumber}
                  onChange={(e) => setGrnNumber(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              {/* GRN Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-500">
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
                    className="text-xs text-sky-600 hover:underline font-medium"
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
                      className="col-span-4 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-2 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-2 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-3 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                    />

                    {grnItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setGrnItems(grnItems.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Receiving Notes / Supplier Invoice
                </label>
                <textarea
                  rows={2}
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  placeholder="Supplier challan number, delivery condition..."
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGrnModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting ? "Verifying..." : "Verify & Receive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
