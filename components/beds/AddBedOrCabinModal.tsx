"use client";

import React, { useState } from "react";
import { X, Bed, DoorOpen, Plus, Check } from "lucide-react";
import { WardRecord } from "@/types/beds-ot";
import { addBedAction, addCabinAction } from "@/lib/ipd/bed-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wards: WardRecord[];
  onAdded: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function AddBedOrCabinModal({
  isOpen,
  onClose,
  wards,
  onAdded,
  onToast,
}: Props) {
  const [activeType, setActiveType] = useState<"bed" | "cabin">("bed");

  // Bed Form
  const [bedNumber, setBedNumber] = useState("");
  const [wardId, setWardId] = useState(wards[0]?.id || "");
  const [dailyRate, setDailyRate] = useState("500");
  const [bedCategory, setBedCategory] = useState("General Bed");

  // Cabin Form
  const [cabinNumber, setCabinNumber] = useState("");
  const [cabinType, setCabinType] = useState<"AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE">("AC_DELUXE");
  const [floorNumber, setFloorNumber] = useState("5th Floor");
  const [cabinRate, setCabinRate] = useState("2500");
  const [amenities, setAmenities] = useState("Split AC, TV, Attendant Bed, Attached Bath");

  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmitBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedNumber.trim()) {
      onToast("বেড নম্বর প্রদান করুন (যেমন: MW-105)", "error");
      return;
    }
    setSubmitting(true);
    const res = await addBedAction({
      bed_number: bedNumber.trim(),
      ward_id: wardId || wards[0]?.id || "ward-001-male",
      daily_rate: Number(dailyRate) || 500,
      bed_type: bedCategory,
    });
    setSubmitting(false);

    if (res.success) {
      onToast(`বেড ${bedNumber} সফলভাবে ইনভেন্টরিতে যুক্ত হয়েছে।`, "success");
      onAdded();
      onClose();
    } else {
      onToast(res.error || "বেড তৈরি ব্যর্থ হয়েছে", "error");
    }
  };

  const handleSubmitCabin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cabinNumber.trim()) {
      onToast("কেবিন নম্বর প্রদান করুন (যেমন: CAB-505)", "error");
      return;
    }
    setSubmitting(true);
    const res = await addCabinAction({
      cabin_number: cabinNumber.trim(),
      cabin_type: cabinType,
      floor_number: floorNumber.trim() || "5th Floor",
      daily_rate: Number(cabinRate) || 2500,
      amenities: amenities.trim(),
    });
    setSubmitting(false);

    if (res.success) {
      onToast(`কেবিন ${cabinNumber} সফলভাবে ইনভেন্টরিতে যুক্ত হয়েছে।`, "success");
      onAdded();
      onClose();
    } else {
      onToast(res.error || "কেবিন তৈরি ব্যর্থ হয়েছে", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                নতুন বেড অথবা কেবিন যুক্ত করুন
              </h2>
              <p className="text-xs text-slate-500">
                হাসপাতাল ওয়ার্ড বেড বা প্রাইভেট কেবিন ইনভেন্টরিতে যোগ করুন
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Switcher */}
        <div className="p-4 border-b border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveType("bed")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
              activeType === "bed"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Bed className="w-4 h-4" />
            <span>ওয়ার্ড বেড (Ward Bed)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType("cabin")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
              activeType === "cabin"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>প্রাইভেট কেবিন (Cabin)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {activeType === "bed" ? (
            <form onSubmit={handleSubmitBed} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  বেড নম্বর (Bed Number) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: MW-105, FW-205, PO-303"
                  value={bedNumber}
                  onChange={(e) => setBedNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ওয়ার্ড নির্বাচন করুন (Ward) *
                </label>
                <select
                  value={wardId}
                  onChange={(e) => setWardId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                >
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.floor_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    বেডের ধরন (Bed Category)
                  </label>
                  <select
                    value={bedCategory}
                    onChange={(e) => setBedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                  >
                    <option value="General Bed">General Bed (সাধারণ)</option>
                    <option value="Post-Op Bed">Post-Op (পোস্ট অপারেটিভ)</option>
                    <option value="Pediatric Bed">Pediatric (শিশু)</option>
                    <option value="ICU High-Dependency">ICU High-Dependency</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    দৈনিক ভাড়া (Daily Rate ৳) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? "সংরক্ষণ হচ্ছে..." : "বেড সেভ করুন"}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitCabin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কেবিন নম্বর / নাম (Cabin Number) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: CAB-505 (AC Deluxe)"
                  value={cabinNumber}
                  onChange={(e) => setCabinNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    কেবিনের ধরন (Cabin Type) *
                  </label>
                  <select
                    value={cabinType}
                    onChange={(e) => setCabinType(e.target.value as "AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE")}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                  >
                    <option value="AC_DELUXE">AC Deluxe (এসি ডিলাক্স)</option>
                    <option value="VIP_SUITE">VIP Suite (ভিআইপি সুইট)</option>
                    <option value="NON_AC_STANDARD">Non-AC Standard (নন-এসি)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ফ্লোর (Floor Number)
                  </label>
                  <input
                    type="text"
                    value={floorNumber}
                    onChange={(e) => setFloorNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  দৈনিক ভাড়া (Daily Rate ৳) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={cabinRate}
                  onChange={(e) => setCabinRate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সুবিধাসমূহ (Amenities)
                </label>
                <input
                  type="text"
                  value={amenities}
                  onChange={(e) => setAmenities(e.target.value)}
                  placeholder="AC, LED TV, Fridge, Attendant Bed, Attached Bath"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? "সংরক্ষণ হচ্ছে..." : "কেবিন সেভ করুন"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
