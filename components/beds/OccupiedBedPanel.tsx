"use client";

import React, { useState } from "react";
import {
  X,
  User,
  Calendar,
  Stethoscope,
  FileText,
  DollarSign,
  ArrowRightLeft,
  Sparkles,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { BedRecord, CabinRecord, WardRecord } from "@/types/beds-ot";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { vacateBedAction, updateBedStatusAction } from "@/lib/ipd/bed-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bed?: BedRecord | null;
  cabin?: CabinRecord | null;
  wards: WardRecord[];
  allBeds: BedRecord[];
  allCabins: CabinRecord[];
  onActionComplete: () => void;
  onOpenTransfer: (source: { bed?: BedRecord; cabin?: CabinRecord }) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function OccupiedBedPanel({
  isOpen,
  onClose,
  bed,
  cabin,
  onActionComplete,
  onOpenTransfer,
  onToast,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [dischargeNotes, setDischargeNotes] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");

  if (!isOpen || (!bed && !cabin)) return null;

  const assignment = bed?.current_assignment || cabin?.current_assignment;
  const patient = assignment?.patient;

  const targetIdentifier = bed ? bed.bed_number : `Cabin ${cabin?.cabin_number}`;
  const unitName = bed ? bed.ward?.name || "General Ward" : `Floor ${cabin?.floor_number} Cabin`;
  const dailyCharge = bed ? (bed.bed_type?.daily_rate || bed.daily_rate || 600) : (cabin?.daily_rate || 3500);

  const handleDischarge = async () => {
    if (!assignment?.id && !bed?.id && !cabin?.id) return;
    setSubmitting(true);
    try {
      const res = await vacateBedAction({
        assignmentId: assignment?.id,
        bedId: bed?.id,
        cabinId: cabin?.id,
        dischargeNotes: dischargeNotes || "Clinical discharge approved by consultant",
        finalDiagnosis: finalDiagnosis || "Condition improved upon inpatient admission",
      });

      setSubmitting(false);
      if (res.success) {
        onToast(`বেড ${targetIdentifier} সফলভাবে ডিসচার্জ ও জীবাণুমুক্তকরণের জন্য পাঠানো হয়েছে।`, "success");
        setShowDischargeDialog(false);
        onActionComplete();
        onClose();
      } else {
        onToast(res.error || "ডিসচার্জ সম্পন্ন করা যায়নি", "error");
      }
    } catch {
      setSubmitting(false);
      onToast("ডিসচার্জ প্রসেস চলাকালীন ত্রুটি হয়েছে", "error");
    }
  };

  const handleMarkCleaning = async () => {
    if (!bed && !cabin) return;
    if (!confirm("বেডটি কি অবিলম্বে জীবাণুমুক্তকরণ ও পরিষ্কারের (CLEANING) জন্য পাঠাবেন?")) return;
    setSubmitting(true);
    try {
      if (bed) {
        await updateBedStatusAction({ bedId: bed.id, status: "CLEANING" });
      }
      setSubmitting(false);
      onToast(`${targetIdentifier} হাউসকিপিং ক্লিনিং-এ পাঠানো হয়েছে`, "info");
      onActionComplete();
      onClose();
    } catch {
      setSubmitting(false);
      onToast("স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 font-mono tracking-tight">
                  {targetIdentifier}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 tracking-wider">
                  OCCUPIED (ভর্তি রোগী)
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">{unitName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Patient Profile Card */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-sky-600" />
                রোগীর বিবরণ (Patient Profile)
              </span>
              {patient?.id && (
                <Link
                  href={`/app/patient-records?id=${patient.id}`}
                  className="text-sky-600 hover:text-sky-700 font-bold inline-flex items-center gap-1 text-[11px]"
                >
                  <span>সম্পূর্ণ চার্ট</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            <h3 className="text-base font-black text-slate-900">
              {patient?.full_name || "ভর্তি রোগী (Patient Admitted)"}
            </h3>
            <div className="grid grid-cols-2 gap-2 mt-2 text-slate-600 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">OH-ID</span>
                <span className="font-mono font-bold text-slate-800">
                  {patient?.patient_code || "OH-INPATIENT"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Gender / Sex</span>
                <span className="font-semibold text-slate-800">{patient?.gender || "Not specified"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Mobile Phone</span>
                <span className="font-semibold text-slate-800">{patient?.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Tariff Rate</span>
                <span className="font-bold text-emerald-700">{formatCurrencyBDT(dailyCharge)} / day</span>
              </div>
            </div>
          </div>

          {/* Admission & Clinical Details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
              ক্লিনিক্যাল তথ্য ও ভর্তি রেকর্ড
            </span>

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">ভর্তির সময় (Admitted At)</span>
                  <span className="font-medium text-slate-800">
                    {assignment?.assigned_at ? formatDateBDT(assignment.assigned_at) : "সম্প্রতি ভর্তি করা হয়েছে"}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">দায়িত্বপ্রাপ্ত কনসালট্যান্ট</span>
                  <span className="font-medium text-slate-800">
                    কনসালট্যান্ট চিকিৎসক (Inpatient On-Duty Consultant)
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">ভর্তির কারণ / ডায়াগনোসিস</span>
                  <span className="font-medium text-slate-800">
                    ইনপেশেন্ট ওয়ার্ড মনিটরিং ও জরুরি পর্যবেক্ষণ
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Running Daily Charges */}
          <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-700" />
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">বর্তমান বেড চার্জ</span>
                <span className="text-xs text-emerald-700">দৈনিক ভাড়া স্বয়ংক্রিয়ভাবে বিলিং লেজারে যুক্ত হয়</span>
              </div>
            </div>
            <span className="text-sm font-black text-emerald-900 font-mono">
              {formatCurrencyBDT(dailyCharge)}/দিন
            </span>
          </div>

          {/* Discharge Confirmation Modal Overlay inside Drawer */}
          {showDischargeDialog && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                <LogOut className="w-4 h-4 text-rose-600" />
                রোগী ছাড়পত্র (Discharge Confirmation)
              </h4>
              <p className="text-[11px] text-rose-700">
                রোগীকে ছাড়পত্র দিলে বেডটি স্বয়ংক্রিয়ভাবে <strong>CLEANING</strong> মোডে চলে যাবে এবং হাউসকিপিং পরিষ্কার করার পূর্ব পর্যন্ত নতুন কোনো রোগী ভর্তি করা যাবে না।
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  চূড়ান্ত ডায়াগনোসিস (Final Diagnosis) *
                </label>
                <input
                  type="text"
                  placeholder="যেমন: Acute Appendicitis Post-op Recovery"
                  value={finalDiagnosis}
                  onChange={(e) => setFinalDiagnosis(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  ছাড়পত্র নোট / পরামর্শ (Discharge Notes)
                </label>
                <textarea
                  rows={2}
                  placeholder="ঔষধ গ্রহণের নিয়ম ও ৭ দিন পর ফলো-আপ..."
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowDischargeDialog(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDischarge}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition flex items-center gap-1 shadow-xs"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>ছাড়পত্র নিশ্চিত করুন (Discharge)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenTransfer({ bed: bed || undefined, cabin: cabin || undefined })}
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 text-sky-600" />
              <span>বেড পরিবর্তন (Transfer)</span>
            </button>

            <button
              onClick={handleMarkCleaning}
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>ক্লিনিং মার্ক করুন</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/app/ipd"
              className="w-full py-2.5 px-3 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>IPD এডমিশন দেখুন</span>
            </Link>

            <button
              onClick={() => setShowDischargeDialog(true)}
              disabled={submitting}
              className="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>ছাড়পত্র (Discharge)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
