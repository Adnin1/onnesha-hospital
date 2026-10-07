"use client";

import React, { useState, useEffect } from "react";
import { X, UserPlus, Search, Check, Loader2, Stethoscope, FileText, Calendar, DollarSign, UserCheck } from "lucide-react";
import { BedRecord, CabinRecord } from "@/types/beds-ot";
import { PatientMaster } from "@/types/clinical";
import { searchPatientsAction } from "@/lib/patient/actions";
import { assignBedAction } from "@/lib/ipd/bed-actions";
import { searchReferralAgentsAction } from "@/lib/referrals/actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedBed?: BedRecord | null;
  selectedCabin?: CabinRecord | null;
  onAssigned: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function AssignBedModal({
  isOpen,
  onClose,
  selectedBed,
  selectedCabin,
  onAssigned,
  onToast,
}: Props) {
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [admissionType, setAdmissionType] = useState("IPD Admission");
  const [consultantName, setConsultantName] = useState("Dr. Inpatient Consultant");
  const [admissionReason, setAdmissionReason] = useState("Acute observation and treatment");
  const defaultRate = String(selectedBed?.bed_type?.daily_rate || selectedBed?.daily_rate || selectedCabin?.daily_rate || 600);
  const [customDailyRate, setCustomDailyRate] = useState<string | null>(null);
  const dailyRate = customDailyRate !== null ? customDailyRate : defaultRate;
  const [submitting, setSubmitting] = useState(false);
  const [referralAgents, setReferralAgents] = useState<{ id: string; agent_code: string; full_name: string; agent_type: string; phone: string }[]>([]);
  const [selectedReferralAgentId, setSelectedReferralAgentId] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchReferrals() {
      const res = await searchReferralAgentsAction();
      if (active && res.success && res.data) {
        setReferralAgents(res.data);
      }
    }
    fetchReferrals();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchPatients() {
      setLoadingPatients(true);
      const res = await searchPatientsAction({ query: searchQuery, pageSize: 30 });
      if (active && res.success && res.data?.patients) {
        setPatients(res.data.patients);
        if (res.data.patients.length > 0 && !selectedPatientId) {
          setSelectedPatientId(res.data.patients[0].id);
        }
      }
      if (active) setLoadingPatients(false);
    }
    const timer = setTimeout(fetchPatients, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedPatientId]);

  if (!isOpen) return null;

  const targetTitle = selectedBed
    ? `${selectedBed.bed_number} — ${selectedBed.ward?.name || "General Ward"}`
    : selectedCabin
    ? `Cabin ${selectedCabin.cabin_number} (Floor ${selectedCabin.floor_number})`
    : "বেড বরাদ্দ";

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      onToast("অনুগ্রহ করে একজন রোগী নির্বাচন করুন", "error");
      return;
    }
    setSubmitting(true);
    const res = await assignBedAction({
      patientId: selectedPatientId,
      bedId: selectedBed?.id,
      cabinId: selectedCabin?.id,
      dailyCharge: Number(dailyRate) || 600,
      admissionType: admissionType,
      admissionReason: admissionReason.trim(),
      doctorName: consultantName.trim(),
      referralAgentId: selectedReferralAgentId || undefined,
    });
    setSubmitting(false);

    if (res.success) {
      onToast("রোগীর জন্য সফলভাবে বেড বরাদ্দ ও ভর্তি সম্পন্ন হয়েছে।", "success");
      onAssigned();
      onClose();
    } else {
      onToast(res.error || "বেড বরাদ্দ ব্যর্থ হয়েছে", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <UserPlus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                রোগী ভর্তি ও বেড বরাদ্দ (Assign Bed / Admit Patient)
              </h2>
              <p className="text-xs text-slate-500 font-medium">{targetTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleAssign} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Patient Search */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              রোগী নির্বাচন করুন (Search OH-ID / Patient Name) *
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="রোগীর নাম বা OH-ID বা মোবাইল নম্বর দিয়ে খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
              {loadingPatients ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>লোড হচ্ছে...</span>
                </div>
              ) : patients.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  কোনো রোগী পাওয়া যায়নি।
                </div>
              ) : (
                patients.map((pat) => (
                  <div
                    key={pat.id}
                    onClick={() => setSelectedPatientId(pat.id)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition text-xs ${
                      selectedPatientId === pat.id
                        ? "bg-emerald-50 text-emerald-900 font-bold"
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{pat.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {pat.patient_code} • {pat.gender} • {pat.phone}
                      </p>
                    </div>
                    {selectedPatientId === pat.id && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Admission Type & Ward/Bed Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ভর্তির ধরন (Admission Type)
              </label>
              <select
                value={admissionType}
                onChange={(e) => setAdmissionType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="IPD Admission">IPD Admission (সাধারণ ভর্তি)</option>
                <option value="Emergency IPD">Emergency IPD (জরুরি ভর্তি)</option>
                <option value="Post-Operative">Post-Operative (অপারেশন পরবর্তী)</option>
                <option value="Observation Daycare">Daycare Observation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                নির্ধারিত স্থান (Allocated Bed / Ward)
              </label>
              <input
                type="text"
                readOnly
                value={targetTitle}
                className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-xl text-xs text-slate-700 font-semibold cursor-not-allowed"
              />
            </div>
          </div>

          {/* Consultant Doctor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
              দায়িত্বপ্রাপ্ত কনসালট্যান্ট (Consultant Doctor) *
            </label>
            <input
              type="text"
              required
              value={consultantName}
              onChange={(e) => setConsultantName(e.target.value)}
              placeholder="Dr. Consultant Name, MBBS, FCPS"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Reference / Referral Partner */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                রেফারেন্স / কার মাধ্যমে ভর্তি (Referred By / Reference) (ঐচ্ছিক)
              </span>
              {selectedReferralAgentId && (
                <button
                  type="button"
                  onClick={() => setSelectedReferralAgentId("")}
                  className="text-[10px] text-rose-500 hover:underline font-semibold"
                >
                  মুছে ফেলুন (Clear)
                </button>
              )}
            </label>
            <select
              value={selectedReferralAgentId}
              onChange={(e) => setSelectedReferralAgentId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">সরাসরি ভর্তি / কোনো রেফারেন্স নেই (Direct Admission / None)</option>
              {referralAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.full_name} ({ag.agent_code}) — {ag.agent_type === "DOCTOR" ? "ডাক্তার" : ag.agent_type === "COMMUNITY_PC" ? "পিসি / সিপিসি" : ag.agent_type}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              * এখানে রেফারেন্স নির্বাচন করলে বিলিংয়ের সময় স্বয়ংক্রিয়ভাবে তার কমিশন হিসাব ও নাম সাজেস্ট করবে।
            </p>
          </div>

          {/* Admission Reason / Diagnosis */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              ভর্তির কারণ / প্রাথমিক পর্যবেক্ষণ (Admission Reason) *
            </label>
            <input
              type="text"
              required
              value={admissionReason}
              onChange={(e) => setAdmissionReason(e.target.value)}
              placeholder="যেমন: Severe abdominal pain, suspected appendicitis"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Date and Daily Bed Charge */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                ভর্তির সময় (Admission Date/Time)
              </label>
              <input
                type="text"
                readOnly
                value={new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-xl text-xs text-slate-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                দৈনিক ভাড়া (Daily Bed Charge - ৳) *
              </label>
              <input
                type="number"
                min="0"
                required
                value={dailyRate}
                onChange={(e) => setCustomDailyRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white font-mono font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800">
            ✓ নিশ্চিত করলে এক ক্লিকে রোগীর IPD এডমিশন, বেড এসাইনমেন্ট, বেড OCCUPIED স্ট্যাটাস এবং অডিট লগ স্বয়ংক্রিয় অ্যাটমিক ট্রানজেকশনে সম্পন্ন হবে।
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>ভর্তি ও বরাদ্দ নিশ্চিত করুন (Confirm Admission)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
