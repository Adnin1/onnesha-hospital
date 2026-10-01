"use client";

import React, { useState, useEffect } from "react";
import { Droplet, Plus, ShieldCheck, Loader2, CheckCircle2, Lock } from "lucide-react";
import {
  getBloodInventoryAction,
  BloodBagItem,
} from "@/lib/blood-bank/actions";
import { DonorRegistrationModal } from "@/components/blood-bank/DonorRegistrationModal";
import { CrossMatchIssueModal } from "@/components/blood-bank/CrossMatchIssueModal";

export default function BloodBankPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [bloodBags, setBloodBags] = useState<BloodBagItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals
  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [isCrossMatchModalOpen, setIsCrossMatchModalOpen] = useState(false);
  const [preselectedBag, setPreselectedBag] = useState<BloodBagItem | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
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
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedGroup, refreshKey]);

  function showSuccess(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  // Group counts calculation
  const groupCounts = bloodBags.reduce((acc, bag) => {
    if (bag.status === "available") {
      acc[bag.blood_group] = (acc[bag.blood_group] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const availableBags = bloodBags.filter((b) => b.status === "available");

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
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
            onClick={() => setIsDonorModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Register Donor
          </button>
          <button
            type="button"
            onClick={() => {
              setPreselectedBag(null);
              setIsCrossMatchModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
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
                : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
            }`}
          >
            <span className="text-xs font-bold text-slate-500 block">GROUP</span>
            <span className="text-xl font-black text-red-600 block my-0.5">{grp}</span>
            <span className="text-xs font-semibold text-slate-700 block">
              {groupCounts[grp] || 0} Units
            </span>
          </button>
        ))}
      </div>

      {/* Inventory & Safe Traceability Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Available Blood Bags ({selectedGroup === "ALL" ? "All Groups" : selectedGroup})
          </h2>
          <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
            <Lock className="h-3.5 w-3.5 text-slate-600" /> Cold-Chain Temperature Regulated (2°C - 6°C)
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
                <th className="px-4 py-3">Donor / Source</th>
                <th className="px-4 py-3">Storage Location</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-red-500" />
                    <p className="mt-2 text-xs">Loading blood bank inventory...</p>
                  </td>
                </tr>
              ) : bloodBags.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Droplet className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No blood bags in stock for group {selectedGroup}.</p>
                    <p className="text-xs text-slate-400">Click &ldquo;Register Donor&rdquo; to add collected blood units to inventory.</p>
                  </td>
                </tr>
              ) : (
                bloodBags.map((bag) => (
                  <tr key={bag.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{bag.bag_number}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 text-xs bg-red-100 text-red-800 rounded font-black">
                        {bag.blood_group}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase text-xs font-semibold text-slate-700">
                      {bag.component_type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs">{bag.donor_name || "Screened Voluntary Donor"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{bag.storage_location || "Central Blood Bank"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-700">{bag.expiry_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded font-medium capitalize ${
                        bag.status === "available"
                          ? "bg-emerald-100 text-emerald-800"
                          : bag.status === "reserved"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {bag.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {bag.status === "available" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPreselectedBag(bag);
                            setIsCrossMatchModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          ক্রস-ম্যাচ ও ইস্যু
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">প্রদত্ত</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Donor Registration Modal */}
      <DonorRegistrationModal
        isOpen={isDonorModalOpen}
        onClose={() => setIsDonorModalOpen(false)}
        defaultBloodGroup={selectedGroup}
        onSuccess={(newBag) => {
          setBloodBags((prev) => [newBag, ...prev]);
          showSuccess("রক্তদাতার ব্যাগ সফলভাবে ইনভেন্টরিতে যুক্ত করা হয়েছে।");
        }}
      />

      {/* Cross Match & Issue Modal */}
      <CrossMatchIssueModal
        isOpen={isCrossMatchModalOpen}
        onClose={() => {
          setIsCrossMatchModalOpen(false);
          setPreselectedBag(null);
        }}
        availableBags={availableBags}
        preselectedBag={preselectedBag}
        onSuccess={() => {
          showSuccess("রক্তের ব্যাগ রোগীটির জন্য সফলভাবে ক্রস-ম্যাচ করে ইস্যু করা হয়েছে।");
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
