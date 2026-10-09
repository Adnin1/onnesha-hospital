"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Printer,
  Edit,
  Loader2,
  AlertCircle,
  User,
  Heart,
  ShieldCheck,
  BedDouble,
  Activity,
  Scissors,
  DollarSign,
  FileText,
} from "lucide-react";

import { PatientMaster, PatientIntakeDossier } from "@/types/clinical";
import { getPatientIntakeDossierAction } from "@/lib/patient/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import { EditPatientModal } from "./EditPatientModal";



interface PatientIntakeDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onPatientUpdated?: (updated: PatientMaster) => void;
}

export function PatientIntakeDossierModal({
  isOpen,
  onClose,
  patientId,
  onPatientUpdated,
}: PatientIntakeDossierModalProps) {
  const [dossier, setDossier] = useState<PatientIntakeDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const loadDossier = async () => {
    if (!patientId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getPatientIntakeDossierAction(patientId);
      if (res.success && res.data) {
        setDossier(res.data);
      } else {
        setErrorMsg(res.error || "রেজিস্ট্রেশন ফাইল লোড করা সম্ভব হয়নি। (Failed to load intake dossier)");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error connecting to clinical database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && patientId) {
      void loadDossier();
    }
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handlePatientUpdated = (updated: PatientMaster) => {
    if (dossier) {
      setDossier({
        ...dossier,
        patient: updated,
      });
    }
    if (onPatientUpdated) {
      onPatientUpdated(updated);
    }
  };

  const p = dossier?.patient;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-dossier-title"
      >
        <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
          {/* Header */}
          <div className="no-print flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-500/20 rounded-xl border border-sky-400/30">
                <FileText className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black bg-sky-500/30 text-sky-200 px-2.5 py-0.5 rounded border border-sky-400/40">
                    {p?.patient_code || "OH-PATIENT"}
                  </span>
                  <h2 id="intake-dossier-title" className="text-base font-black tracking-tight">
                    রোগীর ভর্তি ও রেজিস্ট্রেশন ফাইল (Patient Registration & Intake File)
                  </h2>
                </div>
                <p className="text-[11px] text-sky-200/80 mt-0.5">
                  রেজিস্ট্রেশন, কেবিন/বেড, আইসিইউ, ওটি এবং ছাড়/কমিশন সংক্রান্ত তথ্য
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/20"
                title="Print Registration Dossier"
              >
                <Printer className="w-3.5 h-3.5" />
                প্রিন্ট (Print)
              </button>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs"
                title="Edit Patient Details"
              >
                <Edit className="w-3.5 h-3.5" />
                তথ্য সংশোধন (Edit)
              </button>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
                <p className="text-xs text-slate-500 font-semibold">
                  রেজিস্ট্রেশন ও ইনটেক ফাইল লোড হচ্ছে... (Loading complete patient dossier...)
                </p>
              </div>
            ) : errorMsg || !p ? (
              <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="text-xs font-bold text-rose-800">{errorMsg || "Dossier not found"}</p>
                <button
                  onClick={loadDossier}
                  className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  আবার চেষ্টা করুন (Retry)
                </button>
              </div>
            ) : (
              <div className="space-y-6 printable-dossier">
                {/* Registration Overview Strip */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      রোগীর নাম (Patient Name)
                    </span>
                    <h3 className="text-lg font-black text-slate-900">{p.full_name}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      মোবাইল: <span className="font-mono font-bold text-slate-800">{p.phone}</span>
                      {p.alternate_phone && (
                        <span> • বিকল্প: <span className="font-mono">{p.alternate_phone}</span></span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-right">
                      <span className="text-[10px] font-bold text-slate-500 block">রেজিস্ট্রেশন সিরিয়াল</span>
                      <span className="font-mono font-black text-sky-700 text-sm">
                        {dossier?.registrationDetails.registrationSerial || p.patient_code}
                      </span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-right">
                      <span className="text-[10px] font-bold text-slate-500 block">রেজিস্ট্রেশনের তারিখ</span>
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {new Date(p.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Demographics & Identification Grid */}
                <div className="border border-slate-200 rounded-2xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-sky-600" /> ১. ব্যক্তিগত বিবরণ ও পরিচয়পত্র (Demographics & Identification)
                    </h4>
                    <button
                      onClick={() => setIsEditModalOpen(true)}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3 h-3" /> তথ্য পরিবর্তন করুন
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 bg-slate-50/80 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-semibold block">লিঙ্গ (Gender)</span>
                      <span className="font-bold text-slate-800">
                        {p.gender === "MALE" ? "পুরুষ (Male)" : p.gender === "FEMALE" ? "মহিলা (Female)" : "অন্যান্য (Other)"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50/80 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-semibold block">রক্তের গ্রুপ (Blood Group)</span>
                      <span className="font-black text-rose-700 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-500" />
                        {p.blood_group || "অজানা (Unknown)"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50/80 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-semibold block">জন্ম তারিখ (DOB)</span>
                      <span className="font-mono font-bold text-slate-800">
                        {p.dob ? new Date(p.dob).toLocaleDateString("en-GB") : "উল্লেখ নেই"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50/80 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-semibold block">বৈবাহিক অবস্থা</span>
                      <span className="font-bold text-slate-800">{p.marital_status || "SINGLE"}</span>
                    </div>

                    <div className="p-2.5 bg-slate-50/80 rounded-xl sm:col-span-2">
                      <span className="text-[10px] text-slate-500 font-semibold block">জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন (NID/BRN)</span>
                      <span className="font-mono font-bold text-slate-800">{p.nid || "সংরক্ষিত নেই"}</span>
                    </div>

                    <div className="p-2.5 bg-slate-50/80 rounded-xl sm:col-span-2">
                      <span className="text-[10px] text-slate-500 font-semibold block">বর্তমান ঠিকানা (Address)</span>
                      <span className="font-semibold text-slate-800">{p.address || "ঠিকানা উল্লেখ নেই"}</span>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-700" />
                      <div>
                        <span className="font-bold text-amber-950">জরুরি যোগাযোগ / অভিভাবক: </span>
                        <span className="font-extrabold text-slate-900">
                          {p.emergency_contact_name || "উল্লেখ নেই"}
                        </span>
                        {p.emergency_contact_relation && (
                          <span className="text-slate-600"> ({p.emergency_contact_relation})</span>
                        )}
                      </div>
                    </div>
                    {p.emergency_contact_phone && (
                      <div className="font-mono font-bold text-slate-800">
                        ফোন: {p.emergency_contact_phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Dual Commission & Concession Record */}
                <div className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-4.5 space-y-3">
                  <h4 className="text-xs font-black uppercase text-emerald-950 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> ২. দ্বিমুখী কমিশন ও ছাড়ের তথ্য (Dual Concession & Commission Ledger)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* 1. Patient Discount */}
                    <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                        ১. রোগীর ছাড় / কমিশন (Patient Concession / Discount)
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-emerald-700 text-sm">
                          {dossier?.inpatientAdmission?.admissionDiscountPercent
                            ? `${dossier.inpatientAdmission.admissionDiscountPercent}% ছাড়`
                            : "কোনো ছাড় কার্যকর হয়নি"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        কারণ: {dossier?.inpatientAdmission?.admissionDiscountReason || "নিয়মিত চিকিৎসা"}
                      </p>
                    </div>

                    {/* 2. Referral Agent Attribution */}
                    <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                        ২. রেফারেল এজেন্ট কমিশন (Referral Agent Attribution)
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">
                          {dossier?.inpatientAdmission?.referralAgentName ? (
                            <>
                              {dossier.inpatientAdmission.referralAgentName}
                              {dossier.inpatientAdmission.referralAgentCode && (
                                <span className="font-mono text-emerald-700 text-[11px] ml-1">
                                  ({dossier.inpatientAdmission.referralAgentCode})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-500 font-semibold">সরাসরি রোগী (No Referral)</span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        * নিয়ম: রোগীর ছাড় দেওয়ার পর অবশিষ্ট নিট টাকার ওপর কমিশন কার্যকর।
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section: Inpatient / Bed / Unit Allocation */}
                {dossier?.inpatientAdmission && (
                  <div className="border border-sky-200 bg-sky-50/40 rounded-2xl p-4.5 space-y-3">
                    <h4 className="text-xs font-black uppercase text-sky-950 flex items-center gap-1.5">
                      <BedDouble className="w-3.5 h-3.5 text-sky-600" /> ৩. ইনপেশেন্ট ভর্তি ও সিট বরাদ্দ (IPD Bed & Cabin Allocation)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">ভর্তির অবস্থা</span>
                        <span className="font-extrabold text-sky-700">
                          {dossier.inpatientAdmission.status}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">বরাদ্দকৃত বেড/সিট</span>
                        <span className="font-black text-slate-900">
                          {dossier.inpatientAdmission.assignedBedNumber || "N/A"}
                          {dossier.inpatientAdmission.wardName && ` (${dossier.inpatientAdmission.wardName})`}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">কেবিন নম্বর</span>
                        <span className="font-bold text-slate-800">
                          {dossier.inpatientAdmission.assignedCabinNumber || "কেবিন নেওয়া হয়নি"}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-sky-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">ভর্তির সময়</span>
                        <span className="font-mono text-[11px] text-slate-700">
                          {new Date(dossier.inpatientAdmission.admissionDate).toLocaleString("en-GB")}
                        </span>
                      </div>
                    </div>
                    {dossier.inpatientAdmission.provisionalDiagnosis && (
                      <div className="p-2.5 bg-white rounded-xl border border-sky-100 text-xs">
                        <span className="text-[10px] text-slate-500 font-bold block">প্রাথমিক রোগ নির্ণয় (Provisional Diagnosis):</span>
                        <span className="font-semibold text-slate-800">{dossier.inpatientAdmission.provisionalDiagnosis}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Section: Critical Care (CCU/ICU) if present */}
                {dossier?.criticalCareAdmission && (
                  <div className="border border-rose-200 bg-rose-50/40 rounded-2xl p-4.5 space-y-3">
                    <h4 className="text-xs font-black uppercase text-rose-950 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-rose-600" /> ৪. ক্রিটিক্যাল কেয়ার ইউনিট (ICU / CCU / HDU Record)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-rose-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">ইউনিটের নাম</span>
                        <span className="font-black text-rose-700">
                          {dossier.criticalCareAdmission.unitName || "ICU"}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-rose-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">বেড নম্বর</span>
                        <span className="font-bold text-slate-900">{dossier.criticalCareAdmission.bedNumber}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-rose-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">ভেন্টিলেটর প্রয়োজন</span>
                        <span className="font-bold text-slate-800">
                          {dossier.criticalCareAdmission.ventilatorRequired ? "হ্যাঁ (Required)" : "না (No)"}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-rose-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">দায়িত্বরত চিকিৎসক</span>
                        <span className="font-bold text-slate-800">{dossier.criticalCareAdmission.doctorName || "অন কল স্পেশালিস্ট"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section: Operation Theatre (OT) if present */}
                {dossier?.otBooking && (
                  <div className="border border-purple-200 bg-purple-50/40 rounded-2xl p-4.5 space-y-3">
                    <h4 className="text-xs font-black uppercase text-purple-950 flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-purple-600" /> ৫. অপারেশন থিয়েটার বুকিং (OT Surgery Booking)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-purple-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">অপারেশনের নাম</span>
                        <span className="font-black text-purple-700">{dossier.otBooking.procedureName}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-purple-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">ওটি রুম</span>
                        <span className="font-bold text-slate-800">{dossier.otBooking.roomName || dossier.otBooking.roomNumber || "OT Suite"}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-purple-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">সার্জন</span>
                        <span className="font-bold text-slate-800">{dossier.otBooking.surgeonName || "চিফ সার্জন"}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-purple-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">অ্যানেস্থেশিয়া</span>
                        <span className="font-bold text-slate-800">{dossier.otBooking.anesthesiaType || "GENERAL"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section: Linked Invoices */}
                {dossier?.recentInvoices && dossier.recentInvoices.length > 0 && (
                  <div className="border border-slate-200 rounded-2xl p-4.5 space-y-3">
                    <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-600" /> ৬. সংযুক্ত বিল ও ইনভয়েস (Linked Invoices)
                    </h4>
                    <div className="divide-y divide-slate-100 text-xs">
                      {dossier.recentInvoices.map((inv) => (
                        <div key={inv.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-sky-700">{inv.invoiceNumber}</span>
                            <span className="text-slate-500 text-[11px] ml-2">
                              {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {inv.discountAmount > 0 && (
                              <span className="text-emerald-700 font-bold text-[11px]">
                                ছাড়: {formatCurrencyBDT(inv.discountAmount)}
                              </span>
                            )}
                            <span className="font-bold text-slate-900">
                              মোট: {formatCurrencyBDT(inv.totalAmount)}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.paymentStatus === "PAID"
                                ? "bg-emerald-100 text-emerald-800"
                                : inv.paymentStatus === "PARTIAL"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}>
                              {inv.paymentStatus}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="no-print px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-500 font-medium">
              অন্বেষা হসপিটাল ম্যানেজমেন্ট সিস্টেম • অফিসিয়াল রোগী ইনটেক ফাইল
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition shadow-2xs"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Edit Patient Modal */}
      {p && (
        <EditPatientModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          patient={p}
          onSuccess={handlePatientUpdated}
        />
      )}
    </>
  );
}
