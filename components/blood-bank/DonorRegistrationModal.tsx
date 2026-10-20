"use client";

import React, { useState } from "react";
import { X, Droplet, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { registerBloodBagAction, BloodBagItem } from "@/lib/blood-bank/actions";

interface DonorRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bag: BloodBagItem) => void;
  defaultBloodGroup?: string;
}

export function DonorRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  defaultBloodGroup = "A+",
}: DonorRegistrationModalProps) {
  const [donorName, setDonorName] = useState("");
  const [donorAge, setDonorAge] = useState<number | "">("");
  const [donorPhone, setDonorPhone] = useState("");
  const [bloodGroup, setBloodGroup] = useState<
    "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"
  >((defaultBloodGroup === "ALL" ? "A+" : defaultBloodGroup) as "A+");
  const [componentType, setComponentType] = useState<
    "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate"
  >("prbc");
  const [donorType, setDonorType] = useState<"voluntary" | "replacement" | "directed">("voluntary");
  const [sourcingBloodBank, setSourcingBloodBank] = useState<string>(
    "Annesha Central Blood Bank (In-House)"
  );
  const [customBloodBank, setCustomBloodBank] = useState<string>("");
  const [storageLocation, setStorageLocation] = useState(
    "Cold Storage Refrigerator 1 (Shelf A)"
  );
  const [donorDetails, setDonorDetails] = useState("");
  const [screenedPassed, setScreenedPassed] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!donorName.trim()) {
      setErrorMsg("রক্তদাতার নাম আবশ্যক (Donor Name Required)।");
      return;
    }
    if (!donorPhone.trim()) {
      setErrorMsg("রক্তদাতার মোবাইল নম্বর আবশ্যক (Donor Phone Required)।");
      return;
    }
    if (!donorAge || Number(donorAge) < 18 || Number(donorAge) > 65) {
      setErrorMsg("রক্তদাতার বয়স ১৮ থেকে ৬৫ বছরের মধ্যে হতে হবে (Age must be between 18 and 65)।");
      return;
    }
    if (!screenedPassed) {
      setErrorMsg("স্ক্রীনিং টেস্ট পাস ব্যতীত রক্তের ব্যাগ গ্রহণ করা নিষিদ্ধ (TTI Screening Mandatory)।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const grpCode = bloodGroup.replace("+", "P").replace("-", "N");
    const bagNum = `BB-${new Date().toISOString().slice(0, 7).replace("-", "")}-${grpCode}${(crypto.getRandomValues(new Uint16Array(1))[0] % 900) + 100}`;

    const collectionDate = new Date().toISOString().split("T")[0];
    const expiry = new Date(Date.now() + (componentType === "platelets" ? 5 : 42) * 86400000)
      .toISOString()
      .split("T")[0];

    const effectiveBloodBank =
      sourcingBloodBank === "OTHER"
        ? customBloodBank.trim() || "External Blood Bank"
        : sourcingBloodBank;

    const res = await registerBloodBagAction({
      bag_number: bagNum,
      donor_name: donorName.trim(),
      donor_age: Number(donorAge),
      donor_phone: donorPhone.trim(),
      donor_type: donorType,
      sourcing_blood_bank: effectiveBloodBank,
      donor_details: donorDetails.trim(),
      blood_group: bloodGroup,
      component_type: componentType,
      collection_date: collectionDate,
      expiry_date: expiry,
      storage_location: storageLocation,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMsg(res.error || "রক্তের ব্যাগ সংরক্ষণ করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-600 via-rose-700 to-red-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <Droplet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">রক্তদাতা নিবন্ধন ও ব্যাগ অন্তর্ভুক্তি (Register Donor Bag)</h2>
              <p className="text-xs text-red-100">
                WHO ও DGHS হেমাটোলজি স্ক্রীনিং ও নিরাপদ রক্ত সঞ্চালন স্ট্যান্ডার্ড
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-red-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Donor Information */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                রক্তদাতার নাম (Donor Full Name) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="যেমন: মোঃ কামরুল হাসান"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                বয়স (Age) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={18}
                max={65}
                placeholder="১৮-৬৫"
                value={donorAge}
                onChange={(e) => setDonorAge(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                মোবাইল নম্বর (Phone Number) <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="017XXXXXXXX"
                value={donorPhone}
                onChange={(e) => setDonorPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ডোনারের ধরন (Donor Type)
              </label>
              <select
                value={donorType}
                onChange={(e) => setDonorType(e.target.value as "voluntary" | "replacement" | "directed")}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              >
                <option value="voluntary">স্বেচ্ছাসেবী রক্তদাতা (Voluntary)</option>
                <option value="replacement">রিপ্লেসমেন্ট ডোনার (Replacement)</option>
                <option value="directed">নির্দিষ্ট রোগীর জন্য (Directed)</option>
              </select>
            </div>
          </div>

          {/* Sourcing Blood Bank */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              উৎস / ব্লাড ব্যাংকের নাম (Sourcing Blood Bank) <span className="text-rose-500">*</span>
            </label>
            <select
              value={sourcingBloodBank}
              onChange={(e) => setSourcingBloodBank(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 font-medium"
            >
              <option value="Annesha Central Blood Bank (In-House)">অন্বেষা সেন্ট্রাল ব্লাড ব্যাংক (In-House)</option>
              <option value="Quantum Foundation Blood Lab">কোয়ান্টাম ফাউন্ডেশন (Quantum Foundation)</option>
              <option value="Bangladesh Red Crescent Society">বাংলাদেশ রেড ক্রিসেন্ট সোসাইটি (Red Crescent)</option>
              <option value="Sandhani Blood Bank">সন্ধানী কেন্দ্রীয় ব্লাড ব্যাংক (Sandhani)</option>
              <option value="Badhan Blood Transfusion Unit">বাঁধন রক্ত সঞ্চালন কেন্দ্র (Badhan)</option>
              <option value="OTHER">অন্যান্য বহিরাগত ব্লাড ব্যাংক (Other External)</option>
            </select>
            {sourcingBloodBank === "OTHER" && (
              <input
                type="text"
                placeholder="ব্লাড ব্যাংকের নাম লিখুন..."
                value={customBloodBank}
                onChange={(e) => setCustomBloodBank(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            )}
          </div>

          {/* Blood Group & Component */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                রক্তের গ্রুপ (Blood Group) <span className="text-rose-500">*</span>
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-")}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-bold text-red-600 focus:ring-2 focus:ring-red-500"
              >
                <option value="A+">A Positive (A+)</option>
                <option value="A-">A Negative (A-)</option>
                <option value="B+">B Positive (B+)</option>
                <option value="B-">B Negative (B-)</option>
                <option value="O+">O Positive (O+)</option>
                <option value="O-">O Negative (O-)</option>
                <option value="AB+">AB Positive (AB+)</option>
                <option value="AB-">AB Negative (AB-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                কম্পোনেন্টের ধরন (Component)
              </label>
              <select
                value={componentType}
                onChange={(e) => setComponentType(e.target.value as "whole_blood" | "prbc" | "ffp" | "platelets" | "cryoprecipitate")}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 font-medium"
              >
                <option value="prbc">Packed Red Blood Cells (PRBC)</option>
                <option value="whole_blood">Whole Blood</option>
                <option value="platelets">Platelet Concentrate (প্লাটিলেট)</option>
                <option value="ffp">Fresh Frozen Plasma (FFP)</option>
                <option value="cryoprecipitate">Cryoprecipitate</option>
              </select>
            </div>
          </div>

          {/* Storage Location & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                সংরক্ষণ চেম্বার / শেলফ (Storage Location)
              </label>
              <input
                type="text"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                অতিরিক্ত বিবরণ / এনআইডি (Details)
              </label>
              <input
                type="text"
                placeholder="NID বা স্বাস্থ্য বিবরণ..."
                value={donorDetails}
                onChange={(e) => setDonorDetails(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Screening Checklist */}
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-950">TTI সংক্রমণ মুক্ত স্ক্রীনিং সনদ</p>
                <p className="text-[11px] text-emerald-800">HIV 1/2, HBsAg, HCV, VDRL ও Malaria টেস্ট ফলাফল নেগেটিভ?</p>
              </div>
              <input
                type="checkbox"
                checked={screenedPassed}
                onChange={(e) => setScreenedPassed(e.target.checked)}
                className="h-5 w-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </div>
            <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> ৫টি বাধ্যতামূলক সংক্রামক ব্যাধি পরীক্ষা উত্তীর্ণ
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  সংরক্ষণ হচ্ছে...
                </>
              ) : (
                "ব্যাগ ইনভেন্টরিতে যুক্ত করুন (Add to Bank)"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
