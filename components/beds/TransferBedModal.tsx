"use client";

import React, { useState } from "react";
import { X, ArrowRightLeft, Loader2, Bed as BedIcon, Building } from "lucide-react";
import { BedRecord, CabinRecord, WardRecord } from "@/types/beds-ot";
import { transferBedAction } from "@/lib/ipd/bed-actions";
import { formatCurrencyBDT } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceBed?: BedRecord | null;
  sourceCabin?: CabinRecord | null;
  wards: WardRecord[];
  allBeds: BedRecord[];
  allCabins: CabinRecord[];
  onTransferComplete: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function TransferBedModal({
  isOpen,
  onClose,
  sourceBed,
  sourceCabin,
  allBeds,
  allCabins,
  onTransferComplete,
  onToast,
}: Props) {
  const [targetType, setTargetType] = useState<"bed" | "cabin">("bed");
  const [selectedDestBedId, setSelectedDestBedId] = useState("");
  const [selectedDestCabinId, setSelectedDestCabinId] = useState("");
  const [reason, setReason] = useState("Step-down transfer to general ward");
  const [doctorName, setDoctorName] = useState("Dr. Inpatient Consultant");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || (!sourceBed && !sourceCabin)) return null;

  const vacantBeds = allBeds.filter((b) => b.status === "VACANT" && b.id !== sourceBed?.id);
  const vacantCabins = allCabins.filter((c) => c.status === "VACANT" && c.id !== sourceCabin?.id);

  const sourceName = sourceBed ? sourceBed.bed_number : `Cabin ${sourceCabin?.cabin_number}`;
  const patient = sourceBed?.current_assignment?.patient || sourceCabin?.current_assignment?.patient;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetType === "bed" && !selectedDestBedId) {
      onToast("অনুগ্রহ করে গন্তব্য বেড নির্বাচন করুন", "error");
      return;
    }
    if (targetType === "cabin" && !selectedDestCabinId) {
      onToast("অনুগ্রহ করে গন্তব্য কেবিন নির্বাচন করুন", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await transferBedAction({
        sourceBedId: sourceBed?.id,
        sourceCabinId: sourceCabin?.id,
        destinationBedId: targetType === "bed" ? selectedDestBedId : undefined,
        destinationCabinId: targetType === "cabin" ? selectedDestCabinId : undefined,
        reason: reason.trim(),
        doctorName: doctorName.trim(),
      });

      setSubmitting(false);
      if (res.success) {
        onToast(`রোগী ${patient?.full_name || ""} সফলভাবে নতুন বেডে স্থানান্তর করা হয়েছে।`, "success");
        onTransferComplete();
        onClose();
      } else {
        onToast(res.error || "স্থানান্তর সম্পন্ন করা যায়নি", "error");
      }
    } catch {
      setSubmitting(false);
      onToast("বেড স্থানান্তর প্রক্রিয়ায় ত্রুটি ঘটেছে", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
              <ArrowRightLeft className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                বেড / কেবিন স্থানান্তর (Bed Transfer)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                বর্তমান অবস্থান: {sourceName} • রোগী: {patient?.full_name || "Inpatient"}
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

        {/* Form Body */}
        <form onSubmit={handleTransfer} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Destination Type Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              স্থানান্তরের ধরন নির্বাচন করুন (Destination Type)
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTargetType("bed")}
                className={`py-2 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                  targetType === "bed" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BedIcon className="w-4 h-4 text-sky-600" />
                <span>ওয়ার্ড বেড ({vacantBeds.length} খালি)</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType("cabin")}
                className={`py-2 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                  targetType === "cabin" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Building className="w-4 h-4 text-emerald-600" />
                <span>কেবিন ({vacantCabins.length} খালি)</span>
              </button>
            </div>
          </div>

          {/* Select Destination */}
          {targetType === "bed" ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                খালি ওয়ার্ড বেড নির্বাচন করুন (Select Vacant Bed) *
              </label>
              {vacantBeds.length === 0 ? (
                <p className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-medium">
                  বর্তমানে অন্য কোনো সাধারণ বেড খালি নেই।
                </p>
              ) : (
                <select
                  value={selectedDestBedId}
                  onChange={(e) => setSelectedDestBedId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  <option value="">-- খালি বেড নির্বাচন করুন --</option>
                  {vacantBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bed_number} — {b.ward?.name || "General Ward"} ({formatCurrencyBDT(b.daily_rate || 600)}/দিন)
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                খালি কেবিন নির্বাচন করুন (Select Vacant Cabin) *
              </label>
              {vacantCabins.length === 0 ? (
                <p className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-medium">
                  বর্তমানে কোনো কেবিন খালি নেই।
                </p>
              ) : (
                <select
                  value={selectedDestCabinId}
                  onChange={(e) => setSelectedDestCabinId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  <option value="">-- খালি কেবিন নির্বাচন করুন --</option>
                  {vacantCabins.map((c) => (
                    <option key={c.id} value={c.id}>
                      Cabin {c.cabin_number} — Floor {c.floor_number} ({formatCurrencyBDT(c.daily_rate)}/দিন)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Transfer Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              স্থানান্তরের ক্লিনিক্যাল কারণ (Clinical Reason) *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="যেমন: Step-down transfer, Patient request for AC Cabin"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          {/* Attending Doctor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              অনুমোদনকারী চিকিৎসক (Approving Consultant)
            </label>
            <input
              type="text"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Dr. Consultant Name"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <p>• বর্তমান বেড ({sourceName}) স্বয়ংক্রিয়ভাবে <strong>CLEANING</strong> মোডে যাবে।</p>
            <p>• নতুন বেড অবিলম্বে <strong>OCCUPIED</strong> হবে এবং নতুন দৈনিক চার্জ প্রযোজ্য হবে।</p>
            <p>• স্থানান্তর সম্পূর্ণ করতে ডাটাবেজে একটি একক অ্যাটমিক ট্রানজেকশন সম্পন্ন হবে।</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>স্থানান্তর নিশ্চিত করুন (Confirm Transfer)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
