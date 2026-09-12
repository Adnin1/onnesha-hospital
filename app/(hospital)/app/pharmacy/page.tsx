"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { MOCK_MEDICINES, MOCK_PATIENTS } from "@/lib/mock-data";
import { Medicine } from "@/types";
import { formatCurrencyBDT } from "@/lib/utils";

export default function PharmacyPage() {
  const [medicines, setMedicines] = useState<Medicine[]>(MOCK_MEDICINES);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"catalog" | "pos" | "ledger">("catalog");

  // POS Sale State
  const [posPatientId, setPosPatientId] = useState(MOCK_PATIENTS[0].id);
  const [selectedMedId, setSelectedMedId] = useState(medicines[0].id);
  const [saleQty, setSaleQty] = useState(10);
  const [saleSuccess, setSaleSuccess] = useState(false);

  // Stock Ledger state
  const [ledgerEntries, setLedgerEntries] = useState([
    { id: "tx-1", med: "Napa Extra", type: "purchase_in", qty: 1000, batch: "BEX-9821", date: "2026-09-01", balance: 1250 },
    { id: "tx-2", med: "Napa Extra", type: "sale_out", qty: -20, batch: "BEX-9821", date: "2026-09-12", balance: 1230 },
    { id: "tx-3", med: "Ciprocin 500", type: "sale_out", qty: -15, batch: "SQ-1102", date: "2026-09-12", balance: 45 },
    { id: "tx-4", med: "Seclo 20", type: "purchase_in", qty: 500, batch: "SQ-4491", date: "2026-09-05", balance: 840 },
  ]);

  const filteredMeds = medicines.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.brand_name.toLowerCase().includes(q) ||
      m.generic_name.toLowerCase().includes(q) ||
      m.manufacturer.toLowerCase().includes(q)
    );
  });

  const handleDispenseMedicine = (e: React.FormEvent) => {
    e.preventDefault();
    const med = medicines.find((m) => m.id === selectedMedId);
    if (!med) return;

    if (med.current_stock < saleQty) {
      alert(`Insufficient stock! Available stock is only ${med.current_stock}.`);
      return;
    }

    // Deduct stock in memory
    const newStock = med.current_stock - saleQty;
    setMedicines((prev) =>
      prev.map((m) => (m.id === selectedMedId ? { ...m, current_stock: newStock } : m))
    );

    // Record in ledger
    setLedgerEntries([
      {
        id: `tx-${Date.now()}`,
        med: med.brand_name,
        type: "sale_out",
        qty: -saleQty,
        batch: med.batches[0]?.batch_number || "BATCH-01",
        date: "2026-09-12",
        balance: newStock,
      },
      ...ledgerEntries,
    ]);

    setSaleSuccess(true);
    setTimeout(() => setSaleSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Hospital Pharmacy & FIFO Stock Ledger
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Medicine Inventory & POS Dispensing
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime batch expiration monitoring, stock transaction ledger (+Purchase, -Sale), and low-stock alerts.
          </p>
        </div>

        {/* Tab Toggle Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "catalog"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Medicine Inventory
          </button>
          <button
            onClick={() => setActiveTab("pos")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "pos"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            POS Dispensing
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "ledger"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Stock Ledger (+/-)
          </button>
        </div>
      </div>

      {/* 1. CATALOG TAB */}
      {activeTab === "catalog" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search brand, generic, or pharma..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
              />
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                1 Low Stock Item
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Brand & Generic</th>
                  <th className="py-3 px-4">Type / Strength</th>
                  <th className="py-3 px-4">Manufacturer</th>
                  <th className="py-3 px-4">Active Batch / Expiry</th>
                  <th className="py-3 px-4 text-right">Unit MRP</th>
                  <th className="py-3 px-4 text-right">Current Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMeds.map((m) => {
                  const isLowStock = m.current_stock <= m.reorder_level;
                  const batch = m.batches[0];

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {m.brand_name}
                        <span className="block text-[11px] text-slate-500 font-normal">
                          {m.generic_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {m.category} ({m.strength})
                      </td>
                      <td className="py-3 px-4 text-slate-600">{m.manufacturer}</td>
                      <td className="py-3 px-4">
                        {batch ? (
                          <div className="font-mono text-[11px]">
                            <span className="text-slate-800 font-semibold block">
                              {batch.batch_number}
                            </span>
                            <span className="text-slate-500">Exp: {batch.expiry_date}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBDT(m.unit_price)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-mono font-bold text-sm inline-block px-2.5 py-0.5 rounded ${
                            isLowStock
                              ? "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                              : "text-emerald-700 bg-emerald-50"
                          }`}
                        >
                          {m.current_stock}
                        </span>
                        {isLowStock && (
                          <span className="block text-[9px] font-bold text-amber-700 mt-0.5">
                            LOW STOCK ALERT
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. POS COUNTER TAB */}
      {activeTab === "pos" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-2xl mx-auto">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center">
            <ShoppingCart className="w-4 h-4 mr-2 text-sky-600" />
            Direct Pharmacy Point of Sale (POS)
          </h2>

          {saleSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold mb-4 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Medicine dispensed and stock deducted successfully!</span>
            </div>
          )}

          <form onSubmit={handleDispenseMedicine} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Patient
              </label>
              <select
                value={posPatientId}
                onChange={(e) => setPosPatientId(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
              >
                {MOCK_PATIENTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patient_id} - {p.full_name} ({p.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Medicine to Dispense
              </label>
              <select
                value={selectedMedId}
                onChange={(e) => setSelectedMedId(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
              >
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.brand_name} ({m.strength}) - Stock: {m.current_stock} pcs • {formatCurrencyBDT(m.unit_price)}/pc
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Quantity to Dispense (Pieces)
              </label>
              <input
                type="number"
                min="1"
                required
                value={saleQty}
                onChange={(e) => setSaleQty(parseInt(e.target.value) || 1)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-bold text-slate-900"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition"
              >
                Dispense & Record Stock Deduction
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. STOCK LEDGER TAB (+Purchase, -Sale, -Damage, +Return) */}
      {activeTab === "ledger" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="pb-4 border-b border-slate-100 mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center">
              <History className="w-4 h-4 mr-2 text-sky-600" />
              FIFO Stock Transaction Ledger (Audit Trail)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculates current available stock mathematically through chronological audit transactions.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Medicine Name</th>
                  <th className="py-2.5 px-3">Transaction Type</th>
                  <th className="py-2.5 px-3">Batch Number</th>
                  <th className="py-2.5 px-3 text-right">Quantity Delta</th>
                  <th className="py-2.5 px-3 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.map((log) => {
                  const isPositive = log.qty > 0;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-600 font-mono">{log.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{log.med}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                            log.type === "purchase_in"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {log.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{log.batch}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          isPositive ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {isPositive ? `+${log.qty}` : log.qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {log.balance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
