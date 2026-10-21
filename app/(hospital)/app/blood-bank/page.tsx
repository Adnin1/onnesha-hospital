"use client";

import React, { useState, useEffect } from "react";
import {
  Droplet,
  Plus,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Lock,
  History,
  Trash2,
  Edit3,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  getBloodInventoryAction,
  BloodBagItem,
  getBloodTransfusionRecordsAction,
  cancelOrVoidBloodTransfusionAction,
  updateBloodTransfusionNotesAction,
  BloodTransfusionRecord,
} from "@/lib/blood-bank/actions";
import { DonorRegistrationModal } from "@/components/blood-bank/DonorRegistrationModal";
import { CrossMatchIssueModal } from "@/components/blood-bank/CrossMatchIssueModal";
import { formatDateBDT } from "@/lib/utils";

export default function BloodBankPage() {
  const [activeTab, setActiveTab] = useState<"INVENTORY" | "TRANSFUSIONS">("INVENTORY");
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [bloodBags, setBloodBags] = useState<BloodBagItem[]>([]);
  const [transfusions, setTransfusions] = useState<BloodTransfusionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [transfusionsLoading, setTransfusionsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modals
  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [isCrossMatchModalOpen, setIsCrossMatchModalOpen] = useState(false);
  const [preselectedBag, setPreselectedBag] = useState<BloodBagItem | null>(null);

  // Void Modal State
  const [voidRecord, setVoidRecord] = useState<BloodTransfusionRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  // Edit Notes Modal State
  const [editRecord, setEditRecord] = useState<BloodTransfusionRecord | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

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

  useEffect(() => {
    let isMounted = true;
    async function fetchTransfusions() {
      if (activeTab !== "TRANSFUSIONS") return;
      setTransfusionsLoading(true);
      const res = await getBloodTransfusionRecordsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setTransfusions(res.data);
      }
      setTransfusionsLoading(false);
    }
    void fetchTransfusions();
    return () => {
      isMounted = false;
    };
  }, [activeTab, refreshKey]);

  function showSuccess(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  // Handle Void Transfusion
  async function handleVoidTransfusion(e: React.FormEvent) {
    e.preventDefault();
    if (!voidRecord) return;
    setVoidSubmitting(true);
    const res = await cancelOrVoidBloodTransfusionAction({
      transfusionId: voidRecord.id,
      reason: voidReason.trim() || "Mistake cross-match cancelled by user",
    });
    setVoidSubmitting(false);
    if (res.success) {
      showSuccess(res.message || "ক্রস-ম্যাচ রেকর্ড বাতিল ও রক্তের ব্যাগ ইনভেন্টরিতে ফেরত দেওয়া হয়েছে।");
      setVoidRecord(null);
      setVoidReason("");
      setRefreshKey((k) => k + 1);
    } else {
      setErrorMsg(res.error || "ক্রস-ম্যাচ বাতিল করতে সমস্যা হয়েছে।");
    }
  }

  // Handle Edit Transfusion Notes
  async function handleUpdateNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!editRecord) return;
    setEditSubmitting(true);
    const res = await updateBloodTransfusionNotesAction({
      transfusionId: editRecord.id,
      notes: editNotes,
    });
    setEditSubmitting(false);
    if (res.success) {
      showSuccess("নোট সফলভাবে আপডেট করা হয়েছে।");
      setEditRecord(null);
      setEditNotes("");
      setRefreshKey((k) => k + 1);
    } else {
      setErrorMsg(res.error || "নোট আপডেট করতে ব্যর্থ হয়েছে।");
    }
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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("INVENTORY")}
          className={`px-4 py-2 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === "INVENTORY"
              ? "bg-red-600 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Droplet className="h-4 w-4" />
          রক্তের ব্যাগ ইনভেন্টরি (Available Inventory)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("TRANSFUSIONS")}
          className={`px-4 py-2 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === "TRANSFUSIONS"
              ? "bg-red-600 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <History className="h-4 w-4" />
          ক্রস-ম্যাচ ও রক্ত সঞ্চালন লগ (Transfusions & Cross-Matches)
        </button>
      </div>

      {activeTab === "INVENTORY" && (
        <>
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
                        <td className="px-4 py-3 text-xs">
                          <div className="font-bold text-slate-800">{bag.donor_name || "Screened Donor"}</div>
                          <div className="text-[10px] text-slate-500">
                            {bag.donor_age ? `Age: ${bag.donor_age} Yrs` : "Age: N/A"} • {bag.donor_phone || "Contact: N/A"}
                          </div>
                          <div className="text-[10px] text-red-700 font-medium truncate max-w-[180px]">
                            {bag.sourcing_blood_bank || "Annesha Central Blood Bank"}
                          </div>
                        </td>
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
        </>
      )}

      {activeTab === "TRANSFUSIONS" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <History className="h-5 w-5 text-red-600" />
              ক্রস-ম্যাচ ও রক্ত সঞ্চালন হিস্ট্রি (Transfusion Records & Haemovigilance Log)
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              মোট রেকর্ড: {transfusions.length} টি
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">রক্তের ব্যাগ ও গ্রুপ</th>
                  <th className="px-4 py-3">রোগীর বিবরণ</th>
                  <th className="px-4 py-3">ডোনার ও সোর্স</th>
                  <th className="px-4 py-3">ক্রস-ম্যাচ ফলাফল</th>
                  <th className="px-4 py-3">টেকনোলজিস্ট ও সময়</th>
                  <th className="px-4 py-3">স্ট্যাটাস</th>
                  <th className="px-4 py-3">নোট / প্রতিক্রিয়া</th>
                  <th className="px-4 py-3 text-right">একশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transfusionsLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-red-500" />
                      <p className="mt-2 text-xs">Loading transfusion logs...</p>
                    </td>
                  </tr>
                ) : transfusions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      <Droplet className="h-8 w-8 mx-auto text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-600">কোনো ক্রস-ম্যাচ বা রক্ত সঞ্চালন লগ পাওয়া যায়নি।</p>
                    </td>
                  </tr>
                ) : (
                  transfusions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono font-bold text-slate-900">{t.blood_inventory?.bag_number || "Direct"}</div>
                        <span className="inline-block px-2 py-0.5 mt-0.5 text-[10px] bg-red-100 text-red-800 rounded font-black">
                          {t.donor_blood_group || t.blood_inventory?.blood_group || "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-bold text-slate-900">{t.patients?.full_name || "Unknown Patient"}</div>
                        <div className="font-mono text-[10px] text-slate-500">ID: {t.patients?.patient_code || "N/A"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-slate-800">{t.donor_name || "Screened Donor"}</div>
                        <div className="text-[10px] text-slate-500">{t.sourcing_blood_bank || "In-House"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{t.crossmatch_result}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Major: {t.major_crossmatch || "compatible"} • Minor: {t.minor_crossmatch || "compatible"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-slate-800">{t.technologist_name || "Technologist"}</div>
                        <div className="text-[10px] text-slate-500">{formatDateBDT(t.transfusion_start_time || t.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded font-bold ${
                          t.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}>
                          {t.status || "ACTIVE"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[200px] truncate text-slate-600">
                        {t.adverse_reaction_notes || "কোনো বিরূপ প্রতিক্রিয়া নেই (Uneventful)"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditRecord(t);
                              setEditNotes(t.adverse_reaction_notes || "");
                            }}
                            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                            title="Edit Notes / প্রতিক্রিয়া সংশোধন"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {t.status !== "VOIDED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidRecord(t);
                                setVoidReason("ভুল এন্ট্রি বাতিল (Mistake entry cancelled)");
                              }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Void Transfusion & Restore Bag to Inventory (বাতিল ও ইনভেন্টরিতে ফেরত)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Void Transfusion Confirmation Modal */}
      {voidRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">ক্রস-ম্যাচ ও রক্ত ইস্যু বাতিল করুন</h3>
                  <p className="text-xs text-slate-500">Void Transfusion & Restore Blood Bag</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoidRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVoidTransfusion} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-slate-700">
                  রোগী: <strong className="text-slate-900">{voidRecord.patients?.full_name}</strong>
                </p>
                <p className="text-slate-700">
                  ব্যাগ নম্বর: <strong className="font-mono text-slate-900">{voidRecord.blood_inventory?.bag_number || "Direct"}</strong> • রক্ত গ্রুপ: <strong>{voidRecord.donor_blood_group}</strong>
                </p>
                <p className="text-[11px] text-emerald-700 font-medium">
                  এই একশনটি রক্ত ব্যাগটিকে স্বয়ংক্রিয়ভাবে ইনভেন্টরিতে &ldquo;available&rdquo; হিসেবে ফেরত দেবে।
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  বাতিলের কারণ (Void Reason) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. ভুল রোগীতে সিলেক্ট হয়েছিল, রক্ত প্রদান প্রয়োজন হয়নি..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVoidRecord(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {voidSubmitting ? "বাতিল হচ্ছে..." : "বাতিল ও ইনভেন্টরিতে ফেরত নিন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Notes Modal */}
      {editRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900">ট্রান্সফিউশন নোট ও প্রতিক্রিয়া সংশোধন</h3>
                  <p className="text-xs text-slate-500">Edit Adverse Reactions & Notes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateNotes} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  নোট / বিরূপ প্রতিক্রিয়া পর্যবেক্ষণ (Adverse Reaction Notes)
                </label>
                <textarea
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="নোট বা প্রতিক্রিয়া লিখুন..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditRecord(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                  {editSubmitting ? "সংরক্ষণ হচ্ছে..." : "নোট সংরক্ষণ করুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
