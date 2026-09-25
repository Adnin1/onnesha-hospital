"use client";

import React, { useState } from "react";
import { Droplet, Plus, ShieldCheck } from "lucide-react";

export default function BloodBankPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Droplet className="h-7 w-7 text-red-600" />
            Blood Bank & Safe Transfusion Center
          </h1>
          <p className="text-sm text-slate-500">
            WHO-Compliant Haemovigilance, Donor Screening, Component Reservation & Cross-Match Guards
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register Donor
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            <ShieldCheck className="h-4 w-4" />
            Cross-Match & Issue
          </button>
        </div>
      </div>

      {/* Blood Group Matrix Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((grp) => (
          <button
            key={grp}
            type="button"
            onClick={() => setSelectedGroup(grp === selectedGroup ? "ALL" : grp)}
            className={`p-3.5 rounded-xl border text-center transition-all ${
              selectedGroup === grp
                ? "bg-red-50 border-red-300 ring-2 ring-red-500/20"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <span className="text-xs font-bold text-slate-500 block">GROUP</span>
            <span className="text-xl font-black text-red-600 block my-0.5">{grp}</span>
            <span className="text-xs font-medium text-slate-600 block">4 Units</span>
          </button>
        ))}
      </div>

      {/* Inventory & Safe Traceability Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Available Blood Bags ({selectedGroup === "ALL" ? "All Groups" : selectedGroup})
          </h2>
          <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Server-Enforced Compatibility
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Bag Number</th>
                <th className="px-4 py-3">Blood Group</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Collected Date</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Storage Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">BLD-2026-B-1001</td>
                <td className="px-4 py-3 font-bold text-red-600">B+</td>
                <td className="px-4 py-3">Packed Red Blood Cells (PRBC)</td>
                <td className="px-4 py-3">2026-09-20</td>
                <td className="px-4 py-3">2026-10-25</td>
                <td className="px-4 py-3 text-xs text-slate-500">Ref A - Shelf 2</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-medium">Available</span></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-red-600 hover:text-red-800 font-medium">Crossmatch</button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">BLD-2026-O-1002</td>
                <td className="px-4 py-3 font-bold text-red-600">O+</td>
                <td className="px-4 py-3">Fresh Frozen Plasma (FFP)</td>
                <td className="px-4 py-3">2026-09-22</td>
                <td className="px-4 py-3">2027-09-22</td>
                <td className="px-4 py-3 text-xs text-slate-500">Deep Freezer B</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">Reserved</span></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-xs text-slate-600 hover:text-slate-800 font-medium">View Details</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
