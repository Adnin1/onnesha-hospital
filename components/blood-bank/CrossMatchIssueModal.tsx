"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  User,
} from "lucide-react";
import {
  issueBloodBagAction,
  registerAndIssueBloodBagAction,
  BloodBagItem,
} from "@/lib/blood-bank/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface CrossMatchIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBags: BloodBagItem[];
  preselectedBag?: BloodBagItem | null;
  onSuccess: () => void;
}

export function CrossMatchIssueModal({
  isOpen,
  onClose,
  availableBags,
  preselectedBag,
  onSuccess,
}: CrossMatchIssueModalProps) {
  // Mode: "INVENTORY" or "DIRECT_DONOR"
  const [issueMode, setIssueMode] = useState<"INVENTORY" | "DIRECT_DONOR">(
    availableBags.length > 0 ? "INVENTORY" : "DIRECT_DONOR"
  );

  const [selectedBagId, setSelectedBagId] = useState<string>(
    preselectedBag?.id || availableBags[0]?.id || ""
  );

  // Direct Donor / External Blood Bank Fields
  const [donorName, setDonorName] = useState("");
  const [donorAge, setDonorAge] = useState<number | "">("");
  const [donorPhone, setDonorPhone] = useState("");
  const [donorBloodGroup, setDonorBloodGroup] = useState<
    "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"
  >("A+");
  const [donorType, setDonorType] = useState<"voluntary" | "replacement" | "directed">("replacement");
  const [sourcingBloodBank, setSourcingBloodBank] = useState<string>(
    "Annesha Central Blood Bank (In-House)"
  );
  const [customBloodBank, setCustomBloodBank] = useState<string>("");
  const [componentType, setComponentType] = useState<
    "prbc" | "whole_blood" | "platelets" | "ffp" | "cryoprecipitate"
  >("prbc");
  const [bagNumber, setBagNumber] = useState<string>("");
  const [donorDetails, setDonorDetails] = useState<string>("");
  const [ttiPassed, setTtiPassed] = useState<boolean>(true);

  // Recipient Patient
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);

  // Cross-Match Compatibility
  const [majorMatch, setMajorMatch] = useState<"compatible" | "incompatible">("compatible");
  const [minorMatch, setMinorMatch] = useState<"compatible" | "incompatible">("compatible");
  const [technologistVerified, setTechnologistVerified] = useState<boolean>(true);
  const [transfusionNotes, setTransfusionNotes] = useState<string>("");

  const [loadingPatients, setLoadingPatients] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (availableBags.length === 0) {
      setIssueMode("DIRECT_DONOR");
    }
  }, [availableBags.length]);

  useEffect(() => {
    if (issueMode === "DIRECT_DONOR" && !bagNumber) {
      const grp = donorBloodGroup.replace("+", "P").replace("-", "N");
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      setBagNumber(`BB-${new Date().toISOString().slice(0, 7).replace("-", "")}-${grp}-${randomCode}`);
    }
  }, [issueMode, donorBloodGroup, bagNumber]);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function fetchPatients() {
      setLoadingPatients(true);
      try {
        const res = await searchPatientsAction({ query: patientSearch, pageSize: 20 });
        if (isMounted && res.success && res.data?.patients) {
          setPatients(res.data.patients);
        }
      } catch (err: unknown) {
        console.error("[CrossMatchIssueModal] fetchPatients error:", err);
      } finally {
        if (isMounted) setLoadingPatients(false);
      }
    }
    const timer = setTimeout(() => {
      void fetchPatients();
    }, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, patientSearch]);

  if (!isOpen) return null;

  const activeStockBag = availableBags.find((b) => b.id === selectedBagId) || availableBags[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে গ্রহীতা রোগী নির্বাচন করুন (Select Recipient Patient)।");
      return;
    }
    if (majorMatch !== "compatible" || minorMatch !== "compatible") {
      setErrorMsg("ক্রস-ম্যাচ ইনকম্প্যাটিবল হলে রক্ত প্রদান নিষিদ্ধ (Cross-match Incompatible).");
      return;
    }
    if (!technologistVerified) {
      setErrorMsg("ল্যাব টেকনোলজিস্টের ক্রস-ম্যাচ ভেরিফিকেশন ও রিলিজ সম্মতি আবশ্যক।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const effectiveBloodBank =
      sourcingBloodBank === "OTHER"
        ? customBloodBank.trim() || "External Blood Bank"
        : sourcingBloodBank;

    try {
      if (issueMode === "INVENTORY") {
        if (!selectedBagId) {
          setErrorMsg("অনুগ্রহ করে রক্তের ব্যাগ নির্বাচন করুন।");
          setSubmitting(false);
          return;
        }

        const res = await issueBloodBagAction({
          bag_id: selectedBagId,
          patient_id: selectedPatient.id,
          patient_name: selectedPatient.full_name,
          cross_match_result: "compatible",
          major_crossmatch: majorMatch,
          minor_crossmatch: minorMatch,
          notes: transfusionNotes.trim() || "Issued from inventory after double cross-match verification.",
        });

        setSubmitting(false);
        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMsg(res.error || "রক্তের ব্যাগ ইস্যু করতে ব্যর্থ হয়েছে।");
        }
      } else {
        // DIRECT_DONOR mode
        if (!donorName.trim()) {
          setErrorMsg("রক্তদাতার নাম আবশ্যক (Donor Full Name is required)।");
          setSubmitting(false);
          return;
        }
        if (!donorPhone.trim()) {
          setErrorMsg("রক্তদাতার মোবাইল নম্বর আবশ্যক (Donor Phone is required)।");
          setSubmitting(false);
          return;
        }
        if (!donorAge || Number(donorAge) < 18 || Number(donorAge) > 65) {
          setErrorMsg("রক্তদাতার বয়স ১৮ থেকে ৬৫ বছরের মধ্যে হওয়া আবশ্যক (Donor Age 18-65)।");
          setSubmitting(false);
          return;
        }
        if (!ttiPassed) {
          setErrorMsg("বাধ্যতামূলক ৫টি সংক্রামক রোগ (TTI) স্ক্রীনিং নেগেটিভ ছাড়া রক্ত প্রদান সম্পূর্ণ নিষিদ্ধ।");
          setSubmitting(false);
          return;
        }

        const res = await registerAndIssueBloodBagAction({
          bag_number: bagNumber || `BB-${Date.now()}`,
          donor_name: donorName.trim(),
          donor_age: Number(donorAge),
          donor_phone: donorPhone.trim(),
          donor_blood_group: donorBloodGroup,
          donor_type: donorType,
          sourcing_blood_bank: effectiveBloodBank,
          donor_details: donorDetails.trim(),
          component_type: componentType,
          patient_id: selectedPatient.id,
          major_crossmatch: majorMatch,
          minor_crossmatch: minorMatch,
          technologist_verified: technologistVerified,
          notes: transfusionNotes.trim() || "Direct donor / external cross-match completed.",
        });

        setSubmitting(false);
        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMsg(res.error || "সরাসরি ডোনার ক্রস-ম্যাচ ও রক্ত ইস্যু ব্যর্থ হয়েছে।");
        }
      }
    } catch (err: unknown) {
      setSubmitting(false);
      setErrorMsg(err instanceof Error ? err.message : "ক্রস-ম্যাচ প্রসেসিংয়ে সমস্যা হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-700 via-rose-800 to-red-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white shadow-inner">
              <ShieldCheck className="h-6 w-6 text-red-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                রক্ত ক্রস-ম্যাচ ও ইস্যু (Cross-Match & Issue Bag)
              </h2>
              <p className="text-xs text-red-100">
                WHO ও DGHS নিরাপদ রক্ত সঞ্চালন মানদণ্ড: রক্তদাতার পূর্ণ বিবরণ, ডাবল ক্রস-ম্যাচ ও ক্লিয়ারেন্স
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

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex gap-2 bg-slate-50">
          <button
            type="button"
            onClick={() => setIssueMode("INVENTORY")}
            disabled={availableBags.length === 0}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              issueMode === "INVENTORY"
                ? "bg-red-600 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            ১. স্টক ইনভেন্টরি থেকে ইস্যু ({availableBags.length} ব্যাগ উপলব্ধ)
          </button>
          <button
            type="button"
            onClick={() => setIssueMode("DIRECT_DONOR")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              issueMode === "DIRECT_DONOR"
                ? "bg-red-600 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            ২. সরাসরি ডোনার / বাহ্যিক ব্লাড ব্যাংক রিকুইজিশন
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section A: Blood Bag & Donor Dossier */}
          {issueMode === "INVENTORY" ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                স্টক থেকে রক্তের ব্যাগ নির্বাচন করুন (Select Stock Blood Unit) *
              </label>
              {availableBags.length === 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    বর্তমানে কোনো রক্তের ব্যাগ স্টকে উপলব্ধ নেই (0 Units Available)
                  </div>
                  <p className="text-[11px] text-amber-700">
                    রক্ত ইস্যু করার পূর্বে ব্লাড ব্যাংকে নতুন ডোনার নিবন্ধন করে রক্ত গ্রহণ করুন অথবা উপরে &ldquo;সরাসরি ডোনার / বাহ্যিক ব্লাড ব্যাংক&rdquo; অপশন নির্বাচন করুন।
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={selectedBagId}
                    onChange={(e) => setSelectedBagId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 font-semibold bg-white"
                  >
                    {availableBags.map((bag) => (
                      <option key={bag.id} value={bag.id}>
                        {bag.bag_number} — গ্রুপ: {bag.blood_group} ({bag.component_type.toUpperCase()}) • মেয়াদ: {bag.expiry_date}
                      </option>
                    ))}
                  </select>

                  {activeStockBag && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">রক্তদাতা (Donor):</span>
                        <span className="font-bold text-slate-800">{activeStockBag.donor_name || "Screened Donor"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">বয়স ও মোবাইল:</span>
                        <span className="font-medium text-slate-700">
                          {activeStockBag.donor_age ? `${activeStockBag.donor_age} Yrs` : "N/A"} • {activeStockBag.donor_phone || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">রক্তের গ্রুপ:</span>
                        <span className="font-black text-red-600">{activeStockBag.blood_group}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold">উৎস / ব্লাড ব্যাংক:</span>
                        <span className="font-medium text-slate-700 truncate block">
                          {activeStockBag.sourcing_blood_bank || "Annesha Blood Bank"}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="p-4 bg-rose-50/40 border border-rose-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                  <User className="h-4 w-4 text-rose-600" />
                  রক্তদাতার পূর্ণ তথ্য ও উৎস ব্লাড ব্যাংক (Donor & Sourcing Facility)
                </span>
                <span className="text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300">
                  সরাসরি ক্রস-ম্যাচ
                </span>
              </div>

              {/* Donor Name & Age */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    রক্তদাতার পুরো নাম (Donor Full Name) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: মোঃ কামরুল ইসলাম"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    বয়স (Donor Age) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={65}
                    placeholder="১৮-৬৫ বছর"
                    value={donorAge}
                    onChange={(e) => setDonorAge(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white font-mono"
                  />
                </div>
              </div>

              {/* Donor Phone & Blood Group */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    মোবাইল নম্বর (Contact Phone) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="01XXXXXXXXX"
                    value={donorPhone}
                    onChange={(e) => setDonorPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    ডোনারের রক্তের গ্রুপ (Blood Group) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={donorBloodGroup}
                    onChange={(e) => setDonorBloodGroup(e.target.value as "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-")}
                    className="w-full px-3 py-2 text-xs font-bold text-red-600 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
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
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    ডোনারের ধরন (Donor Type)
                  </label>
                  <select
                    value={donorType}
                    onChange={(e) => setDonorType(e.target.value as "voluntary" | "replacement" | "directed")}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white font-medium"
                  >
                    <option value="replacement">রিপ্লেসমেন্ট / আত্মীয় (Replacement)</option>
                    <option value="voluntary">স্বেচ্ছাসেবী রক্তদাতা (Voluntary)</option>
                    <option value="directed">নির্দিষ্ট রোগীর জন্য (Directed)</option>
                  </select>
                </div>
              </div>

              {/* Sourcing Blood Bank & Component Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    ব্লাড ব্যাংক / সংগ্রহের উৎস (Sourcing Blood Bank) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sourcingBloodBank}
                    onChange={(e) => setSourcingBloodBank(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white font-semibold"
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
                      className="mt-1.5 w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    রক্তের উপাদান (Blood Component) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={componentType}
                    onChange={(e) => setComponentType(e.target.value as "prbc" | "whole_blood" | "platelets" | "ffp" | "cryoprecipitate")}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white font-semibold"
                  >
                    <option value="prbc">PRBC (Packed Red Blood Cells)</option>
                    <option value="whole_blood">Whole Blood (সম্পূর্ণ রক্ত)</option>
                    <option value="platelets">Platelet Concentrate (প্লাটিলেট)</option>
                    <option value="ffp">Fresh Frozen Plasma (FFP)</option>
                    <option value="cryoprecipitate">Cryoprecipitate</option>
                  </select>
                </div>
              </div>

              {/* Bag Number & Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    ব্যাগ বা সেগমেন্ট নম্বর (Bag / Segment ID)
                  </label>
                  <input
                    type="text"
                    value={bagNumber}
                    onChange={(e) => setBagNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    অতিরিক্ত নোট বা ডোনার বিবরণ (Details)
                  </label>
                  <input
                    type="text"
                    placeholder="হিমোগ্লোবিন, প্রেসার বা বিশেষ তথ্য..."
                    value={donorDetails}
                    onChange={(e) => setDonorDetails(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>
              </div>

              {/* TTI Mandatory Screening Certificate */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    WHO বাধ্যতামূলক ৫টি সংক্রামক ব্যাধি স্ক্রীনিং নেগেটিভ
                  </p>
                  <p className="text-[10px] text-emerald-800">
                    HIV 1/2, HBsAg, Anti-HCV, VDRL (Syphilis) ও Malarial Parasite টেস্ট ক্লিয়ার্ড
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={ttiPassed}
                  onChange={(e) => setTtiPassed(e.target.checked)}
                  className="h-5 w-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Section B: Recipient Patient Selection */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <label className="block text-xs font-bold text-slate-800">
              গ্রহীতা রোগী (Recipient Patient) <span className="text-rose-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {selectedPatient.full_name}
                    {selectedPatient.blood_group && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-200">
                        গ্রুপ: {selectedPatient.blood_group}
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    ID: {selectedPatient.patient_code} • মোবাইল: {selectedPatient.phone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  পরিবর্তন করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="রোগীর নাম বা মোবাইল বা আইডি দিয়ে খুঁজুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 bg-white"
                />
                {loadingPatients ? (
                  <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                    রোগীর তালিকা লোড হচ্ছে...
                  </div>
                ) : patients.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                    {patients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatient(p)}
                        className="w-full text-left p-2.5 hover:bg-red-50 flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{p.full_name}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {p.patient_code} • {p.phone}
                          </span>
                        </div>
                        <span className="font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded text-[11px]">
                          {p.blood_group || "Group Unknown"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : patientSearch ? (
                  <p className="text-xs text-slate-400 p-2 text-center">কোনো রোগী পাওয়া যায়নি।</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Section C: Double Cross-Match Compatibility */}
          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
            <span className="text-xs font-bold text-amber-950 block">
              ল্যাবরেটরি ক্রস-ম্যাচিং রেজাল্ট (CROSS-MATCH COMPATIBILITY)
            </span>

            {/* Clinical Laboratory Responsibility Notice */}
            <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-xl text-xs space-y-1">
              <p className="font-bold text-amber-950 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
                ক্লিনিক্যাল দায়িত্ববিধি (CLINICAL TRANSFUSION RESPONSIBILITY NOTICE):
              </p>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                সফটওয়্যার ওয়ার্কফ্লো আসল ল্যাবরেটরি ক্রস-ম্যাচ পরীক্ষার বিকল্প নয়। রক্ত ইস্যু করার পূর্বে সরাসরি টিউব/জেল কার্ডে অ্যাগ্লুটিনেশন ও অ্যান্টি-হিউম্যান গ্লোবুলিন (AHG) পরীক্ষা সম্পন্ন করা বাধ্যতামূলক।
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Major Cross-match (Donor RBCs + Patient Serum)
                </label>
                <select
                  value={majorMatch}
                  onChange={(e) => setMajorMatch(e.target.value as "compatible" | "incompatible")}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                    majorMatch === "compatible"
                      ? "border-emerald-300 text-emerald-800 bg-emerald-50"
                      : "border-rose-300 text-rose-800 bg-rose-50"
                  }`}
                >
                  <option value="compatible">COMPATIBLE (সঙ্গতিপূর্ণ)</option>
                  <option value="incompatible">INCOMPATIBLE (অসঙ্গতিপূর্ণ / নিষিদ্ধ)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Minor Cross-match (Patient RBCs + Donor Plasma)
                </label>
                <select
                  value={minorMatch}
                  onChange={(e) => setMinorMatch(e.target.value as "compatible" | "incompatible")}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                    minorMatch === "compatible"
                      ? "border-emerald-300 text-emerald-800 bg-emerald-50"
                      : "border-rose-300 text-rose-800 bg-rose-50"
                  }`}
                >
                  <option value="compatible">COMPATIBLE (সঙ্গতিপূর্ণ)</option>
                  <option value="incompatible">INCOMPATIBLE (অসঙ্গতিপূর্ণ / নিষিদ্ধ)</option>
                </select>
              </div>
            </div>

            {/* Transfusion Clinical Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                ট্রান্সফিউশন ও ইস্যু নোট (Clinical Notes)
              </label>
              <input
                type="text"
                placeholder="যেমন: জরুরি রক্ত পরিসঞ্চালন / ওয়ার্ড বা কেবিন..."
                value={transfusionNotes}
                onChange={(e) => setTransfusionNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Technologist Verified Release */}
            <div className="pt-2 flex items-center justify-between border-t border-amber-200/60">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  টেকনোলজিস্ট প্রত্যয়ন ও ক্লিনিক্যাল রিলিজ
                </p>
                <p className="text-[10px] text-slate-500">
                  অ্যাগ্লুটিনেশন ও হেমোলাইসিস অনুপস্থিতি নিশ্চিত হয়ে রক্ত ত্যাগের অনুমতি
                </p>
              </div>
              <input
                type="checkbox"
                checked={technologistVerified}
                onChange={(e) => setTechnologistVerified(e.target.checked)}
                className="h-5 w-5 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
            {issueMode === "INVENTORY" ? (
              <button
                type="submit"
                disabled={submitting || availableBags.length === 0}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    প্রসেসিং হচ্ছে...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    ব্যাগ প্রদান নিশ্চিত করুন (Issue Blood Unit)
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    প্রসেসিং হচ্ছে...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    সরাসরি ডোনার ক্রস-ম্যাচ ও রক্ত ইস্যু (Issue Blood Unit)
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
