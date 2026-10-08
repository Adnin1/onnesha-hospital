"use client";

import React, { useState, useEffect } from "react";
import { X, Bed, DoorOpen, Save, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { BedRecord, CabinRecord, WardRecord } from "@/types/beds-ot";
import {
  updateBedDetailsAction,
  deleteBedAction,
  updateCabinDetailsAction,
  deleteCabinAction,
} from "@/lib/ipd/bed-actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bed: BedRecord | null;
  cabin: CabinRecord | null;
  wards: WardRecord[];
  onUpdated: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function EditBedOrCabinModal({
  isOpen,
  onClose,
  bed,
  cabin,
  wards,
  onUpdated,
  onToast,
}: Props) {
  const isBed = !!bed;
  const isCabin = !!cabin;

  // Bed Edit Form
  const [bedNumber, setBedNumber] = useState("");
  const [wardId, setWardId] = useState("");
  const [dailyRate, setDailyRate] = useState("500");
  const [bedStatus, setBedStatus] = useState<"VACANT" | "CLEANING" | "MAINTENANCE">("VACANT");

  // Cabin Edit Form
  const [cabinNumber, setCabinNumber] = useState("");
  const [cabinType, setCabinType] = useState<"AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE">("AC_DELUXE");
  const [floorNumber, setFloorNumber] = useState("5th Floor");
  const [cabinRate, setCabinRate] = useState("2500");
  const [cabinStatus, setCabinStatus] = useState<"VACANT" | "CLEANING" | "MAINTENANCE">("VACANT");
  const [amenities, setAmenities] = useState("Split AC, TV, Attendant Bed, Attached Bath");

  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (bed) {
      setBedNumber(bed.bed_number || "");
      setWardId(bed.ward_id || wards[0]?.id || "");
      setDailyRate(String(bed.daily_rate || 500));
      const s = bed.status?.toUpperCase();
      setBedStatus(s === "CLEANING" || s === "MAINTENANCE" ? s : "VACANT");
    } else if (cabin) {
      setCabinNumber(cabin.cabin_number || "");
      setCabinType(
        (cabin.cabin_type as "AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE") || "AC_DELUXE"
      );
      setFloorNumber(cabin.floor_number || "5th Floor");
      setCabinRate(String(cabin.daily_rate || 2500));
      const s = cabin.status?.toUpperCase();
      setCabinStatus(s === "CLEANING" || s === "MAINTENANCE" ? s : "VACANT");
      setAmenities(cabin.amenities || "Split AC, TV, Attendant Bed, Attached Bath");
    }
  }, [bed, cabin, wards]);

  if (!isOpen || (!bed && !cabin)) return null;

  const handleUpdateBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bed) return;
    if (!bedNumber.trim()) {
      onToast("বেড নম্বর প্রদান করুন", "error");
      return;
    }
    setSubmitting(true);
    const res = await updateBedDetailsAction({
      bedId: bed.id,
      bed_number: bedNumber.trim(),
      ward_id: wardId,
      daily_rate: Number(dailyRate) || 500,
      status: bedStatus,
    });
    setSubmitting(false);

    if (res.success) {
      onToast(`বেড ${bedNumber} সফলভাবে আপডেট করা হয়েছে।`, "success");
      onUpdated();
      onClose();
    } else {
      onToast(res.error || "বেড আপডেট ব্যর্থ হয়েছে", "error");
    }
  };

  const handleUpdateCabin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cabin) return;
    if (!cabinNumber.trim()) {
      onToast("কেবিন নম্বর প্রদান করুন", "error");
      return;
    }
    setSubmitting(true);
    const res = await updateCabinDetailsAction({
      cabinId: cabin.id,
      cabin_number: cabinNumber.trim(),
      cabin_type: cabinType,
      floor_number: floorNumber.trim(),
      daily_rate: Number(cabinRate) || 2500,
      status: cabinStatus,
      amenities: amenities.trim(),
    });
    setSubmitting(false);

    if (res.success) {
      onToast(`কেবিন ${cabinNumber} সফলভাবে আপডেট করা হয়েছে।`, "success");
      onUpdated();
      onClose();
    } else {
      onToast(res.error || "কেবিন আপডেট ব্যর্থ হয়েছে", "error");
    }
  };

  const handleDelete = async () => {
    setShowConfirmDelete(false);
    setIsDeleting(true);
    try {
      if (bed) {
        const res = await deleteBedAction(bed.id);
        if (res.success) {
          onToast(`বেড ${bed.bed_number} ইনভেন্টরি থেকে মুছে ফেলা হয়েছে।`, "success");
          onUpdated();
          onClose();
        } else {
          onToast(res.error || "বেড মুছতে ব্যর্থ হয়েছে", "error");
        }
      } else if (cabin) {
        const res = await deleteCabinAction(cabin.id);
        if (res.success) {
          onToast(`কেবিন ${cabin.cabin_number} ইনভেন্টরি থেকে মুছে ফেলা হয়েছে।`, "success");
          onUpdated();
          onClose();
        } else {
          onToast(res.error || "কেবিন মুছতে ব্যর্থ হয়েছে", "error");
        }
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-2xl">
                {isBed ? <Bed className="w-5 h-5 stroke-[2.5]" /> : <DoorOpen className="w-5 h-5 stroke-[2.5]" />}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {isBed ? `বেড বিবরণ ও মূল্য পরিবর্তন (${bed?.bed_number})` : `কেবিন বিবরণ ও ভাড়া পরিবর্তন (${cabin?.cabin_number})`}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  সার্ভিস ইনফরমেশন, দৈনিক চার্জ ও স্ট্যাটাস এডিট বা ডিলিট করুন
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-6 overflow-y-auto space-y-4">
            {isBed && bed && (
              <form onSubmit={handleUpdateBed} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">বেড নম্বর (Bed Code / Number)</label>
                  <input
                    type="text"
                    required
                    value={bedNumber}
                    onChange={(e) => setBedNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ওয়ার্ড / বিভাগ (Ward)</label>
                    <select
                      value={wardId}
                      onChange={(e) => setWardId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.ward_type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">দৈনিক ভাড়া / ট্যারিফ (BDT/day)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={dailyRate}
                      onChange={(e) => setDailyRate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">স্ট্যাটাস (Current Status)</label>
                  <select
                    value={bedStatus}
                    onChange={(e) => setBedStatus(e.target.value as typeof bedStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="VACANT">🟢 VACANT (খালি / ভর্তির উপযুক্ত)</option>
                    <option value="CLEANING">🟡 CLEANING (হাউসকিপিং ক্লিনিং)</option>
                    <option value="MAINTENANCE">⚙️ MAINTENANCE (মেরামত / বন্ধ)</option>
                  </select>
                </div>

                {bed.status === "OCCUPIED" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>এই বেডে বর্তমানে রোগী ভর্তি আছেন। মুছে ফেলার আগে রোগীকে ছাড়পত্র দিন বা অন্য বেডে স্থানান্তর করুন।</span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={bed.status === "OCCUPIED" || isDeleting}
                    onClick={() => setShowConfirmDelete(true)}
                    className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>বেড মুছুন (Delete)</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      বাতিল
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <Save className="w-4 h-4" />
                      <span>পরিবর্তন সংরক্ষণ করুন</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {isCabin && cabin && (
              <form onSubmit={handleUpdateCabin} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">কেবিন নম্বর (Cabin #)</label>
                    <input
                      type="text"
                      required
                      value={cabinNumber}
                      onChange={(e) => setCabinNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">কেবিন টাইপ</label>
                    <select
                      value={cabinType}
                      onChange={(e) => setCabinType(e.target.value as typeof cabinType)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="AC_DELUXE">AC Deluxe Cabin</option>
                      <option value="NON_AC_STANDARD">Non-AC Standard Cabin</option>
                      <option value="VIP_SUITE">VIP Suite</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ফ্লোর নম্বর (Floor)</label>
                    <input
                      type="text"
                      value={floorNumber}
                      onChange={(e) => setFloorNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">দৈনিক ভাড়া (BDT/day)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={cabinRate}
                      onChange={(e) => setCabinRate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">সুযোগ-সুবিধা (Amenities)</label>
                  <input
                    type="text"
                    value={amenities}
                    onChange={(e) => setAmenities(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">স্ট্যাটাস (Current Status)</label>
                  <select
                    value={cabinStatus}
                    onChange={(e) => setCabinStatus(e.target.value as typeof cabinStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="VACANT">🟢 VACANT (খালি / ভর্তির উপযুক্ত)</option>
                    <option value="CLEANING">🟡 CLEANING (হাউসকিপিং ক্লিনিং)</option>
                    <option value="MAINTENANCE">⚙️ MAINTENANCE (মেরামত / বন্ধ)</option>
                  </select>
                </div>

                {cabin.status === "OCCUPIED" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>এই কেবিনে বর্তমানে রোগী ভর্তি আছেন। মুছে ফেলার আগে রোগীকে ছাড়পত্র দিন।</span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={cabin.status === "OCCUPIED" || isDeleting}
                    onClick={() => setShowConfirmDelete(true)}
                    className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>কেবিন মুছুন (Delete)</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      বাতিল
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <Save className="w-4 h-4" />
                      <span>পরিবর্তন সংরক্ষণ করুন</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmDialog
          isOpen={showConfirmDelete}
          title={isBed ? `বেড ${bed?.bed_number} মুছে ফেলবেন?` : `কেবিন ${cabin?.cabin_number} মুছে ফেলবেন?`}
          description="আপনি কি নিশ্চিত যে এই ইউনিটটি ইনভেন্টরি থেকে অপসারণ করতে চান? এর ফলে এটি আর রোগী বরাদ্দের তালিকায় প্রদর্শিত হবে না।"
          confirmLabel="হ্যাঁ, মুছে ফেলুন"
          isDestructive={true}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </>
  );
}
