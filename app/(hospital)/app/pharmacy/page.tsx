"use client";

import React, { useState, useEffect } from "react";
import {
  Pill,
  Search,
  Plus,
  AlertTriangle,
  History,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  PlusCircle,
} from "lucide-react";
import {
  MedicineRecord,
  MedicineBatchRecord,
  StockTransactionRecord,
} from "@/types/pharmacy";
import {
  getPharmacyInventoryAction,
  dispensePharmacySaleAction,
  getStockTransactionsAction,
  createMedicineAction,
  createMedicineBatchAction,
} from "@/lib/pharmacy/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function PharmacyPage() {
  const [loading, setLoading] = useState(true);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "pos" | "ledger">("catalog");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // POS Sale State
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [saleQty, setSaleQty] = useState(1);
  const [patientPhone, setPatientPhone] = useState("");
  const [posLoading, setPosLoading] = useState(false);
  const [posSuccessMsg, setPosSuccessMsg] = useState<string | null>(null);

  // Stock Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<StockTransactionRecord[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Add Medicine Modal State
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newGenericName, setNewGenericName] = useState("");
  const [newDosageForm, setNewDosageForm] = useState("Tablet");
  const [newStrength, setNewStrength] = useState("500mg");
  const [newManufacturer, setNewManufacturer] = useState("Square Pharmaceuticals");

  // Add Batch Modal State
  const [selectedMedForBatch, setSelectedMedForBatch] = useState<MedicineRecord | null>(null);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("2028-12-31");
  const [newPurchaseRate, setNewPurchaseRate] = useState(2.5);
  const [newMrp, setNewMrp] = useState(3.5);
  const [newBatchQty, setNewBatchQty] = useState(500);

  const loadCatalog = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getPharmacyInventoryAction();
      if (res.success && res.data) {
        setMedicines(res.data.medicines);
        setLowStockCount(res.data.lowStockCount);
        // Default batch for POS
        const firstBatchWithStock = res.data.medicines
          .flatMap((m) => m.batches)
          .find((b) => b.current_stock > 0);
        if (firstBatchWithStock) {
          setSelectedBatchId(firstBatchWithStock.id);
        }
      } else {
        setErrorMsg(res.error || "Failed to load medicine catalog");
      }
    } catch {
      setErrorMsg("Network error loading pharmacy catalog");
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async () => {
    setLedgerLoading(true);
    try {
      const res = await getStockTransactionsAction(50);
      if (res.success && res.data) {
        setLedgerEntries(res.data.transactions);
      }
    } catch {
      // ignore
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function initCatalog() {
      try {
        const res = await getPharmacyInventoryAction();
        if (isMounted) {
          if (res.success && res.data) {
            setMedicines(res.data.medicines);
            setLowStockCount(res.data.lowStockCount);
            const firstBatchWithStock = res.data.medicines
              .flatMap((m) => m.batches)
              .find((b) => b.current_stock > 0);
            if (firstBatchWithStock && !selectedBatchId) {
              setSelectedBatchId(firstBatchWithStock.id);
            }
          } else {
            setErrorMsg(res.error || "Failed to load pharmacy catalog");
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Network error loading pharmacy inventory");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    initCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === "ledger") {
      async function fetchLedger() {
        try {
          const res = await getStockTransactionsAction(50);
          if (isMounted && res.success && res.data) {
            setLedgerEntries(res.data.transactions);
          }
        } catch {
          // ignore
        } finally {
          if (isMounted) setLedgerLoading(false);
        }
      }
      fetchLedger();
    }
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const filteredMeds = medicines.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.brand_name.toLowerCase().includes(q) ||
      (m.generic_name && m.generic_name.toLowerCase().includes(q)) ||
      m.manufacturer.toLowerCase().includes(q)
    );
  });

  const handleDispenseMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) {
      alert("Please select a medicine batch with available stock.");
      return;
    }

    setPosLoading(true);
    setPosSuccessMsg(null);
    try {
      const res = await dispensePharmacySaleAction({
        batchId: selectedBatchId,
        quantity: Number(saleQty),
      });

      if (res.success && res.data) {
        setPosSuccessMsg(
          `Sale ${res.data.sale.sale_number} processed! Amount: ${formatCurrencyBDT(res.data.sale.total_amount)} (Remaining stock: ${res.data.remainingStock})`
        );
        await loadCatalog();
      } else {
        alert(res.error || "Failed to dispense medicine");
      }
    } catch {
      alert("Network error processing sale");
    } finally {
      setPosLoading(false);
    }
  };

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createMedicineAction({
        brandName: newBrandName,
        genericName: newGenericName,
        dosageForm: newDosageForm,
        strength: newStrength,
        manufacturer: newManufacturer,
      });
      if (res.success) {
        setShowAddMedModal(false);
        setNewBrandName("");
        await loadCatalog();
      } else {
        alert(res.error || "Failed to add medicine");
      }
    } catch {
      alert("Error adding medicine");
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedForBatch) return;

    try {
      const res = await createMedicineBatchAction({
        medicineId: selectedMedForBatch.id,
        batchNumber: newBatchNumber,
        expiryDate: newExpiryDate,
        purchaseRate: Number(newPurchaseRate),
        mrp: Number(newMrp),
        quantity: Number(newBatchQty),
      });

      if (res.success) {
        setSelectedMedForBatch(null);
        setNewBatchNumber("");
        await loadCatalog();
      } else {
        alert(res.error || "Failed to add batch");
      }
    } catch {
      alert("Error adding batch");
    }
  };

  const allAvailableBatches = medicines.flatMap((m) =>
    m.batches.map((b) => ({
      ...b,
      brand_name: m.brand_name,
      strength: m.strength,
      dosage_form: m.dosage_form,
    }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Dispensation & Inventory Ledger
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Pharmacy Management System
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict FIFO batch tracking, stock balance verification, real-time POS, and expiry alerts.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadCatalog}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowAddMedModal(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Medicine Brand
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* METRICS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Catalog Items</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{medicines.length} Brands</div>
          <span className="text-[10px] text-slate-400">Registered medicines</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Active Batches</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">{allAvailableBatches.length} Lots</div>
          <span className="text-[10px] text-emerald-700 font-medium">With recorded shelf-life</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-800 uppercase">Low Stock Alerts</span>
          <div className="text-2xl font-black text-amber-700 mt-1">{lowStockCount} Items</div>
          <span className="text-[10px] text-amber-700 font-medium">Below re-order threshold</span>
        </div>

        <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 shadow-2xs">
          <span className="text-[11px] font-bold text-sky-800 uppercase">Total Inventory Units</span>
          <div className="text-2xl font-black text-sky-700 mt-1">
            {medicines.reduce((acc, m) => acc + m.total_stock, 0)} Units
          </div>
          <span className="text-[10px] text-sky-700 font-medium">Across all active batches</span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "catalog" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Pill className="w-3.5 h-3.5 mr-1.5" />
          Catalog & Batches ({medicines.length})
        </button>
        <button
          onClick={() => setActiveTab("pos")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "pos" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
          POS Dispensation
        </button>
        <button
          onClick={() => setActiveTab("ledger")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "ledger" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <History className="w-3.5 h-3.5 mr-1.5" />
          Stock Audit Ledger
        </button>
      </div>

      {/* TAB CONTENT: CATALOG */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by brand name, generic formula, or pharmaceutical company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500 flex justify-center items-center">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-sky-600" />
              Loading pharmacy inventory...
            </div>
          ) : filteredMeds.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
              No medicines found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMeds.map((med) => {
                const isLow = med.total_stock <= med.min_stock_alert;
                return (
                  <div
                    key={med.id}
                    className={`bg-white rounded-2xl border p-5 shadow-xs space-y-3 ${
                      isLow ? "border-amber-300 ring-2 ring-amber-500/10" : "border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-sky-600 uppercase">
                          {med.dosage_form} • {med.strength}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900">{med.brand_name}</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Generic: {med.generic_name || "General formulation"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          isLow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isLow ? "Low Stock" : "In Stock"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1 text-slate-700">
                      <p>
                        <strong>Manufacturer:</strong> {med.manufacturer}
                      </p>
                      <p>
                        <strong>Total Available:</strong>{" "}
                        <span className="font-mono font-bold text-slate-900">{med.total_stock}</span> {med.unit_type}s
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Batches: {med.batches.length > 0 ? med.batches.map((b) => b.batch_number).join(", ") : "None"}
                      </p>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <button
                        onClick={() => setSelectedMedForBatch(med)}
                        className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center"
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1" />
                        Receive New Batch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: POS */}
      {activeTab === "pos" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-xl">
          <h2 className="text-base font-extrabold text-slate-900 mb-1">Point-of-Sale Medicine Dispensation</h2>
          <p className="text-xs text-slate-500 mb-4">
            Select a verified batch lot. System automatically validates stock before deducting and recording in the double-entry ledger.
          </p>

          {posSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-4 flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
              {posSuccessMsg}
            </div>
          )}

          <form onSubmit={handleDispenseMedicine} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Medicine Batch *</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-3 py-2.5 border rounded-xl bg-slate-50 font-semibold"
                required
              >
                {allAvailableBatches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.current_stock <= 0}>
                    {b.brand_name} ({b.strength}) — Lot: {b.batch_number} (Exp: {b.expiry_date}) • Stock:{" "}
                    {b.current_stock} • MRP: {formatCurrencyBDT(b.mrp)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Dispense Quantity *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={saleQty}
                  onChange={(e) => setSaleQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Patient Mobile (Optional)</label>
                <input
                  type="text"
                  placeholder="017XXXXXXXX"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={posLoading || !selectedBatchId}
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition flex items-center justify-center disabled:opacity-50 text-sm"
              >
                {posLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                Dispense & Print Cash Receipt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB CONTENT: LEDGER */}
      {activeTab === "ledger" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-extrabold text-sm text-slate-900">Double-Entry Stock Audit Ledger</h3>
            <button
              onClick={loadLedger}
              className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${ledgerLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Medicine & Strength</th>
                  <th className="py-3 px-4">Batch Lot</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">In (+ )</th>
                  <th className="py-3 px-4 text-right">Out (- )</th>
                  <th className="py-3 px-4 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      Loading audit entries...
                    </td>
                  </tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {entry.batch?.medicine?.brand_name || "Medicine"} ({entry.batch?.medicine?.strength || ""})
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{entry.batch?.batch_number || "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            entry.transaction_type === "PURCHASE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {entry.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        {entry.quantity_in > 0 ? `+${entry.quantity_in}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {entry.quantity_out > 0 ? `-${entry.quantity_out}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        {entry.running_balance}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD MEDICINE MODAL */}
      {showAddMedModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Add Medicine Brand</h3>
            <p className="text-slate-500 mb-4">Register a new drug into the hospital master inventory.</p>

            <form onSubmit={handleCreateMedicine} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Napa Extra / Seclo"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Generic Formula</label>
                <input
                  type="text"
                  placeholder="e.g. Paracetamol + Caffeine"
                  value={newGenericName}
                  onChange={(e) => setNewGenericName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Form</label>
                  <select
                    value={newDosageForm}
                    onChange={(e) => setNewDosageForm(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Suspension">Suspension</option>
                    <option value="Ointment">Ointment</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Strength</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 500mg / 20mg"
                    value={newStrength}
                    onChange={(e) => setNewStrength(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Manufacturer *</label>
                <input
                  type="text"
                  required
                  placeholder="Square / Beximco / Incepta"
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMedModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
                >
                  Save Brand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIVE BATCH MODAL */}
      {selectedMedForBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">
              Receive Batch: {selectedMedForBatch.brand_name}
            </h3>
            <p className="text-slate-500 mb-4">Record stock intake lot with purchase rate, MRP, and shelf expiry.</p>

            <form onSubmit={handleCreateBatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Batch / Lot No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SQ-2026-X1"
                    value={newBatchNumber}
                    onChange={(e) => setNewBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Buy Rate (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPurchaseRate}
                    onChange={(e) => setNewPurchaseRate(Number(e.target.value))}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">MRP (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMrp}
                    onChange={(e) => setNewMrp(Number(e.target.value))}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newBatchQty}
                    onChange={(e) => setNewBatchQty(Number(e.target.value))}
                    className="w-full px-2 py-2 border rounded-xl bg-slate-50 font-semibold font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMedForBatch(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                >
                  Confirm Intake
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
