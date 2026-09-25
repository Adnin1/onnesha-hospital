"use client";

import React, { useState, useEffect } from "react";
import { Droplet, Plus, ShieldCheck, Loader2 } from "lucide-react";
import {
  getBloodInventoryAction,
  BloodBagItem,
} from "@/lib/blood-bank/actions";

export default function BloodBankPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [bloodBags, setBloodBags] = useState<BloodBagItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      const res = await getBloodInventoryAction(selectedGroup);
      if (!isMounted) return;
      if (res.success && res.data) {
        setBloodBags(res.data);
      } else {
        setErrorMsg(res.error || "Failed to load blood inventory.");
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [selectedGroup]);

  // Group counts calculation
  const groupCounts = bloodBags.reduce((acc, bag) => {
    acc[bag.blood_group] = (acc[bag.blood_group] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Register Donor
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
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
            className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
              selectedGroup === grp
                ? "bg-red-50 border-red-300 ring-2 ring-red-500/20"
                : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            }`}
          >
            <span className="text-xs font-bold text-slate-500 block">GROUP</span>
            <span className="text-xl font-black text-red-600 block my-0.5">{grp}</span>
            <span className="text-xs font-medium text-slate-600 block">
              {groupCounts[grp] || 0} Units
            </span>
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

        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Bag Number</th>
                <th className="px-4 py-3">Blood Group</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Collected Date</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-red-500" />
                    <p className="mt-2 text-xs">Loading blood inventory...</p>
                  </td>
                </tr>
              ) : bloodBags.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <Droplet className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No blood bags in storage for {selectedGroup}.</p>
                    <p className="text-xs text-slate-400">Register new donor blood bags or component collections to populate stock.</p>
                  </td>
                </tr>
              ) : (
                bloodBags.map((bag) => (
                  <tr key={bag.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{bag.bag_number}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{bag.blood_group}</td>
                    <td className="px-4 py-3 capitalize">{bag.component_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-xs">{bag.collection_date}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{bag.expiry_date}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-medium capitalize">
                        {bag.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
