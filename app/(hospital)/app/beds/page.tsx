"use client";

import React, { useState, useEffect } from "react";
import {
  Bed as BedIcon,
  CheckCircle2,
  Sparkles,
  Building,
  Wrench,
  Loader2,
  RefreshCw,
  Plus,
  ShieldAlert,
  Edit2,
} from "lucide-react";
import { BedRecord, CabinRecord, WardRecord } from "@/types/beds-ot";
import {
  getBedsAndCabinsAction,
  updateBedStatusAction,
  updateCabinStatusAction,
} from "@/lib/ipd/bed-actions";
// Clinical bed vacating and discharge is orchestrated via vacateBedAction in OccupiedBedPanel
import { formatCurrencyBDT } from "@/lib/utils";
import { AddBedOrCabinModal } from "@/components/beds/AddBedOrCabinModal";
import { EditBedOrCabinModal } from "@/components/beds/EditBedOrCabinModal";
import { AssignBedModal } from "@/components/beds/AssignBedModal";
import { OccupiedBedPanel } from "@/components/beds/OccupiedBedPanel";
import { TransferBedModal } from "@/components/beds/TransferBedModal";
import { Toast } from "@/components/ui/Toast";

type FilterTab = "all" | "ward" | "cabin" | "icu" | "ccu" | "beds";

export default function BedManagementPage() {
  const [loading, setLoading] = useState(true);
  const [beds, setBeds] = useState<BedRecord[]>([]);
  const [cabins, setCabins] = useState<CabinRecord[]>([]);
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals & Panels
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editTargetBed, setEditTargetBed] = useState<BedRecord | null>(null);
  const [editTargetCabin, setEditTargetCabin] = useState<CabinRecord | null>(null);
  const [assignTargetBed, setAssignTargetBed] = useState<BedRecord | null>(null);
  const [assignTargetCabin, setAssignTargetCabin] = useState<CabinRecord | null>(null);
  const [occupiedBed, setOccupiedBed] = useState<BedRecord | null>(null);
  const [occupiedCabin, setOccupiedCabin] = useState<CabinRecord | null>(null);
  const [transferSource, setTransferSource] = useState<{ bed?: BedRecord; cabin?: CabinRecord } | null>(null);
  const [housekeepingItem, setHousekeepingItem] = useState<{ bed?: BedRecord; cabin?: CabinRecord } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  const reloadData = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await getBedsAndCabinsAction();
        if (!isMounted) return;
        if (res.success && res.data) {
          setBeds(res.data.beds || []);
          setCabins(res.data.cabins || []);
          setWards(res.data.wards || []);
        } else {
          setErrorMsg(res.error || "Unable to load bed inventory from database.");
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Network error loading bed inventory";
        setErrorMsg(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  // Bed and Cabin counts
  const totalCabins = cabins.length;
  const icuBeds = beds.filter((b) => b.bed_number.startsWith("ICU-") || b.ward?.ward_type === "ICU");
  const ccuBeds = beds.filter((b) => b.bed_number.startsWith("CCU-") || b.ward?.ward_type === "CCU");
  const wardBeds = beds.filter(
    (b) => !b.bed_number.startsWith("ICU-") && !b.bed_number.startsWith("CCU-") && b.ward?.ward_type !== "ICU" && b.ward?.ward_type !== "CCU"
  );

  // Capacity metrics
  const allUnits = [...beds, ...cabins];
  const totalCapacity = allUnits.length;
  const vacantCount = allUnits.filter((u) => u.status === "VACANT").length;
  const occupiedCount = allUnits.filter((u) => u.status === "OCCUPIED").length;
  const cleaningCount = allUnits.filter((u) => u.status === "CLEANING").length;
  const maintenanceCount = allUnits.filter((u) => u.status === "MAINTENANCE").length;

  // Handle bed click according to state
  const handleBedClick = (bed: BedRecord) => {
    const status = bed.status.toUpperCase();
    if (status === "VACANT" || status === "AVAILABLE") {
      setAssignTargetBed(bed);
    } else if (status === "OCCUPIED") {
      setOccupiedBed(bed);
    } else {
      setHousekeepingItem({ bed });
    }
  };

  // Handle cabin click according to state
  const handleCabinClick = (cabin: CabinRecord) => {
    const status = cabin.status.toUpperCase();
    if (status === "VACANT" || status === "AVAILABLE") {
      setAssignTargetCabin(cabin);
    } else if (status === "OCCUPIED") {
      setOccupiedCabin(cabin);
    } else {
      setHousekeepingItem({ cabin });
    }
  };

  // Housekeeping transition: Complete cleaning -> VACANT
  const handleCompleteSanitization = async () => {
    if (!housekeepingItem) return;
    setActionLoading(true);
    try {
      if (housekeepingItem.bed) {
        const res = await updateBedStatusAction({ bedId: housekeepingItem.bed.id, status: "VACANT" });
        if (res.success) {
          showToast(`বেড ${housekeepingItem.bed.bed_number} পরিষ্কার সম্পন্ন ও প্রস্তুত (VACANT) করা হয়েছে।`, "success");
        } else {
          showToast(res.error || "স্ট্যাটাস পরিবর্তন করা যায়নি", "error");
        }
      } else if (housekeepingItem.cabin) {
        const res = await updateCabinStatusAction({ cabinId: housekeepingItem.cabin.id, status: "VACANT" });
        if (res.success) {
          showToast(`কেবিন ${housekeepingItem.cabin.cabin_number} প্রস্তুত (VACANT) করা হয়েছে।`, "success");
        } else {
          showToast(res.error || "স্ট্যাটাস পরিবর্তন করা যায়নি", "error");
        }
      }
      setHousekeepingItem(null);
      await reloadData();
    } catch (err: unknown) {
      console.error("[BedsPage] handleCompleteSanitization error:", err);
      showToast("স্ট্যাটাস আপডেট ব্যর্থ হয়েছে", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filter groups
  let displayedWards = wards;
  if (activeTab === "ward" || activeTab === "beds") {
    displayedWards = wards.filter((w) => w.ward_type !== "ICU" && w.ward_type !== "CCU" && w.ward_type !== "Cabin");
  } else if (activeTab === "icu") {
    displayedWards = wards.filter((w) => w.ward_type === "ICU" || w.name.includes("ICU"));
  } else if (activeTab === "ccu") {
    displayedWards = wards.filter((w) => w.ward_type === "CCU" || w.name.includes("CCU"));
  }

  const showCabins = activeTab === "all" || activeTab === "cabin";
  const showWards = activeTab !== "cabin";

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* TOP HEADER */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[11px] font-bold text-sky-600 uppercase tracking-widest flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5" />
            Hospital Capacity & Live Bed Allocation
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            বেড ও কেবিন ম্যানেজমেন্ট (Bed Inventory)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            জেনারেল ওয়ার্ড, কেবিন, আইসিইউ এবং সিসিইউ-এর রিয়েল-টাইম অকুপেন্সি ও রোগী ভর্তি ব্যবস্থাপনা।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ নতুন বেড / কেবিন</span>
          </button>
          <button
            onClick={reloadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ERROR STATE BANNER */}
      {errorMsg && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-900">
                Unable to load bed inventory
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                The hospital bed database relationship could not be loaded: {errorMsg}
              </p>
              <span className="text-[10px] font-mono font-bold text-rose-500 mt-1 inline-block">
                Reference: BED_DATA_LOAD_FAILED
              </span>
            </div>
          </div>
          <button
            onClick={reloadData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0 shadow-xs"
          >
            পুনরায় চেষ্টা করুন (Retry)
          </button>
        </div>
      )}

      {/* TOP TABS: Ward Beds (12) | Private Cabins (4) | ICU (6) | CCU (4) */}
      <div className="flex bg-slate-200/80 p-1.5 rounded-2xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          All Hospital Units ({totalCapacity})
        </button>
        <button
          onClick={() => setActiveTab("ward")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === "ward" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Ward Beds ({wardBeds.length})
        </button>
        <button
          onClick={() => setActiveTab("cabin")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === "cabin" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Private Cabins ({totalCabins})
        </button>
        <button
          onClick={() => setActiveTab("icu")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === "icu" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ICU ({icuBeds.length})
        </button>
        <button
          onClick={() => setActiveTab("ccu")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            activeTab === "ccu" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          CCU ({ccuBeds.length})
        </button>
      </div>

      {/* SUMMARY CAPACITY METRICS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Capacity</span>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {totalCapacity}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">All Units Registered</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Vacant (খালি)
          </span>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
            {vacantCount}
          </div>
          <span className="text-[10px] text-emerald-700 font-medium">ভর্তির জন্য প্রস্তুত</span>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 shadow-2xs">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            Occupied (ভর্তি রোগী)
          </span>
          <div className="text-2xl font-black text-rose-700 mt-1 font-mono">
            {occupiedCount}
          </div>
          <span className="text-[10px] text-rose-700 font-medium">বর্তমানে ভর্তি আছেন</span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-2xs">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Cleaning (জীবাণুমুক্তকরণ)
          </span>
          <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
            {cleaningCount}
          </div>
          <span className="text-[10px] text-amber-700 font-medium">হাউসকিপিং প্রক্রিয়াধীন</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
            Maintenance
          </span>
          <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
            {maintenanceCount}
          </div>
          <span className="text-[10px] text-slate-600 font-medium">মেরামত বা পরীক্ষা</span>
        </div>
      </div>

      {/* MAIN CONTENT: HIERARCHICAL WARD -> ROOM -> BED MATRIX */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          <p className="text-xs font-semibold text-slate-700">রিয়েল-টাইম বেড ইনভেন্টরি লোড হচ্ছে...</p>
        </div>
      ) : totalCapacity === 0 && !errorMsg ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-4">
          <div className="p-3 bg-slate-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-slate-400">
            <BedIcon className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            No wards or beds configured yet.
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            হাসপাতালে কোনো বেড বা ওয়ার্ড কনফিগার করা হয়নি। নিচের বাটনে ক্লিক করে ওয়ার্ড ও বেড যুক্ত করুন।
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              + Add Ward / Bed
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* HIERARCHICAL WARDS */}
          {showWards &&
            displayedWards.map((ward) => {
              const wardBedsList = beds.filter((b) => b.ward_id === ward.id);
              if (wardBedsList.length === 0 && activeTab !== "all") return null;

              return (
                <div key={ward.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
                  {/* Ward Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-slate-900 tracking-tight">
                          {ward.name}
                        </h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          Floor: {ward.floor_number}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-50 text-sky-700">
                          {ward.ward_type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        মোট ক্যাপাসিটি: {wardBedsList.length} টি বেড
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <span className="text-emerald-700 flex items-center gap-1 text-[11px]">
                        🟢 {wardBedsList.filter((b) => b.status === "VACANT").length} খালি
                      </span>
                      <span className="text-rose-700 flex items-center gap-1 text-[11px]">
                        🔴 {wardBedsList.filter((b) => b.status === "OCCUPIED").length} ভর্তি
                      </span>
                      <span className="text-amber-700 flex items-center gap-1 text-[11px]">
                        🟡 {wardBedsList.filter((b) => b.status === "CLEANING").length} ক্লিনিং
                      </span>
                    </div>
                  </div>

                  {/* Bed Grid inside this Ward */}
                  {wardBedsList.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 italic">এই ওয়ার্ডে কোনো বেড যুক্ত করা নেই।</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {wardBedsList.map((bed) => {
                        const isVacant = bed.status === "VACANT";
                        const isOccupied = bed.status === "OCCUPIED";
                        const isCleaning = bed.status === "CLEANING";
                        const isMaintenance = bed.status === "MAINTENANCE";

                        return (
                          <div
                            key={bed.id}
                            onClick={() => handleBedClick(bed)}
                            className={`p-4 rounded-2xl border transition shadow-2xs flex flex-col justify-between cursor-pointer hover:shadow-md ${
                              isVacant
                                ? "bg-white border-emerald-300 ring-2 ring-emerald-500/10 hover:border-emerald-500"
                                : isOccupied
                                ? "bg-rose-50/50 border-rose-300 hover:border-rose-500"
                                : isCleaning
                                ? "bg-amber-50/50 border-amber-300 hover:border-amber-500"
                                : "bg-slate-100 border-slate-300 hover:border-slate-500"
                            }`}
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  {bed.bed_type?.name || "General"}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditTargetBed(bed);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                    title="বেড পরিবর্তন বা ডিলিট করুন (Edit/Delete Bed)"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                      isVacant
                                        ? "bg-emerald-100 text-emerald-800"
                                        : isOccupied
                                        ? "bg-rose-100 text-rose-800"
                                        : isCleaning
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-200 text-slate-800"
                                    }`}
                                  >
                                    {isVacant ? "🟢 VACANT" : isOccupied ? "🔴 OCCUPIED" : isCleaning ? "🟡 CLEANING" : "⚫ MAINT"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 my-2">
                                <BedIcon
                                  className={`w-5 h-5 ${
                                    isVacant
                                      ? "text-emerald-600"
                                      : isOccupied
                                      ? "text-rose-600"
                                      : isCleaning
                                      ? "text-amber-600"
                                      : "text-slate-600"
                                  }`}
                                />
                                <h3 className="font-black text-base text-slate-900 font-mono">
                                  {bed.bed_number}
                                </h3>
                              </div>

                              <div className="text-[11px] text-slate-600 mt-1">
                                <span>দৈনিক ভাড়া: </span>
                                <strong className="font-mono text-slate-800">
                                  {formatCurrencyBDT(bed.bed_type?.daily_rate || bed.daily_rate || 600)}
                                </strong>
                              </div>
                            </div>

                            {/* Card Footer / Inpatient Info */}
                            <div className="pt-3 border-t border-slate-200/80 mt-3 text-xs">
                              {isOccupied && bed.current_assignment?.patient ? (
                                <div>
                                  <span className="font-bold text-slate-900 block truncate text-xs">
                                    {bed.current_assignment.patient.full_name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block font-mono">
                                    {bed.current_assignment.patient.patient_code} • {bed.current_assignment.patient.phone}
                                  </span>
                                </div>
                              ) : isCleaning ? (
                                <span className="text-[10px] text-amber-700 font-bold block flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  হাউসকিপিং ক্লিনিং চলছে
                                </span>
                              ) : isMaintenance ? (
                                <span className="text-[10px] text-slate-600 font-bold block flex items-center gap-1">
                                  <Wrench className="w-3 h-3" />
                                  মেরামতে আছে (Unusable)
                                </span>
                              ) : (
                                <span className="text-[11px] text-emerald-700 font-bold block hover:underline">
                                  + রোগী বরাদ্দ করুন (Assign Bed) →
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

          {/* PRIVATE CABINS GROUP */}
          {showCabins && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900 tracking-tight">
                      প্রাইভেট কেবিন কমপ্লেক্স (Private Cabins)
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      5th Floor
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700">
                      VIP & Deluxe
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    মোট কেবিন: {cabins.length} টি
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-emerald-700 flex items-center gap-1 text-[11px]">
                    🟢 {cabins.filter((c) => c.status === "VACANT").length} খালি
                  </span>
                  <span className="text-rose-700 flex items-center gap-1 text-[11px]">
                    🔴 {cabins.filter((c) => c.status === "OCCUPIED").length} ভর্তি
                  </span>
                </div>
              </div>

              {cabins.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 italic">কোনো কেবিন যুক্ত করা নেই।</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {cabins.map((cabin) => {
                    const isVacant = cabin.status === "VACANT";
                    const isOccupied = cabin.status === "OCCUPIED";
                    const isCleaning = cabin.status === "CLEANING";

                    return (
                      <div
                        key={cabin.id}
                        onClick={() => handleCabinClick(cabin)}
                        className={`p-4 rounded-2xl border transition shadow-2xs flex flex-col justify-between cursor-pointer hover:shadow-md ${
                          isVacant
                            ? "bg-white border-emerald-300 ring-2 ring-emerald-500/10 hover:border-emerald-500"
                            : isOccupied
                            ? "bg-rose-50/50 border-rose-300 hover:border-rose-500"
                            : "bg-amber-50/50 border-amber-300 hover:border-amber-500"
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              Floor {cabin.floor_number} • {cabin.cabin_type}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditTargetCabin(cabin);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="কেবিন পরিবর্তন বা ডিলিট করুন (Edit/Delete Cabin)"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  isVacant
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isOccupied
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {isVacant ? "🟢 VACANT" : isOccupied ? "🔴 OCCUPIED" : "🟡 CLEANING"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 my-2">
                            <Building className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-base text-slate-900 font-mono">
                              Cabin {cabin.cabin_number}
                            </h3>
                          </div>

                          <div className="text-[11px] text-slate-600 mt-1">
                            <span>ভাড়া: </span>
                            <strong className="font-mono text-slate-800">
                              {formatCurrencyBDT(cabin.daily_rate)}/দিন
                            </strong>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-200/80 mt-3 text-xs">
                          {isOccupied && cabin.current_assignment?.patient ? (
                            <div>
                              <span className="font-bold text-slate-900 block truncate text-xs">
                                {cabin.current_assignment.patient.full_name}
                              </span>
                              <span className="text-[10px] text-slate-500 block font-mono">
                                {cabin.current_assignment.patient.patient_code}
                              </span>
                            </div>
                          ) : isCleaning ? (
                            <span className="text-[10px] text-amber-700 font-bold block flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              হাউসকিপিং ক্লিনিং চলছে
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-bold block hover:underline">
                              + কেবিন বরাদ্দ করুন (Assign Cabin) →
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VACANT BED ASSIGNMENT MODAL */}
      {(assignTargetBed || assignTargetCabin) && (
        <AssignBedModal
          isOpen={true}
          onClose={() => {
            setAssignTargetBed(null);
            setAssignTargetCabin(null);
          }}
          selectedBed={assignTargetBed}
          selectedCabin={assignTargetCabin}
          onAssigned={reloadData}
          onToast={showToast}
        />
      )}

      {/* OCCUPIED BED PATIENT PANEL / DRAWER */}
      {(occupiedBed || occupiedCabin) && (
        <OccupiedBedPanel
          isOpen={true}
          onClose={() => {
            setOccupiedBed(null);
            setOccupiedCabin(null);
          }}
          bed={occupiedBed}
          cabin={occupiedCabin}
          wards={wards}
          allBeds={beds}
          allCabins={cabins}
          onActionComplete={reloadData}
          onOpenTransfer={(source) => {
            setOccupiedBed(null);
            setOccupiedCabin(null);
            setTransferSource(source);
          }}
          onToast={showToast}
        />
      )}

      {/* TRANSFER BED MODAL */}
      {transferSource && (
        <TransferBedModal
          isOpen={true}
          onClose={() => setTransferSource(null)}
          sourceBed={transferSource.bed}
          sourceCabin={transferSource.cabin}
          wards={wards}
          allBeds={beds}
          allCabins={cabins}
          onTransferComplete={reloadData}
          onToast={showToast}
        />
      )}

      {/* HOUSEKEEPING / MAINTENANCE STATUS DIALOG */}
      {housekeepingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              হাউসকিপিং ও স্যানিটাইজেশন কন্ট্রোলার
            </h3>
            <p className="text-slate-600 mb-4">
              ইউনিট: <strong>{housekeepingItem.bed?.bed_number || `Cabin ${housekeepingItem.cabin?.cabin_number}`}</strong> • স্ট্যাটাস:{" "}
              <strong className="uppercase text-amber-700">
                {housekeepingItem.bed?.status || housekeepingItem.cabin?.status}
              </strong>
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] mb-4 space-y-1">
              <p>• এই ইউনিটে এখন রোগী ভর্তি করা নিষিদ্ধ (Admission Disabled)।</p>
              <p>• বেড জীবাণুমুক্তকরণ ও বেডশীট পরিবর্তন শেষে প্রস্তুত ঘোষণা করতে নিচের বাটনে চাপুন।</p>
            </div>

            <div className="space-y-2">
              <button
                disabled={actionLoading}
                onClick={handleCompleteSanitization}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" />
                <span>জীবাণুমুক্তকরণ সম্পন্ন → প্রস্তুত (Mark as VACANT)</span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-right">
              <button
                disabled={actionLoading}
                onClick={() => setHousekeepingItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD BED/CABIN MODAL */}
      <AddBedOrCabinModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        wards={wards}
        onAdded={reloadData}
        onToast={showToast}
      />

      {/* EDIT BED/CABIN MODAL */}
      {(editTargetBed || editTargetCabin) && (
        <EditBedOrCabinModal
          isOpen={true}
          onClose={() => {
            setEditTargetBed(null);
            setEditTargetCabin(null);
          }}
          bed={editTargetBed}
          cabin={editTargetCabin}
          wards={wards}
          onUpdated={reloadData}
          onToast={showToast}
        />
      )}
    </div>
  );
}
