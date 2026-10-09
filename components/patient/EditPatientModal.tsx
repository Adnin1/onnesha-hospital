"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Phone,
  Calendar,
  Heart,
  MapPin,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { PatientMaster, GenderType, BloodGroupType } from "@/types/clinical";
import { updatePatientAction } from "@/lib/patient/actions";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "@/lib/patient/phone";

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientMaster;
  onSuccess: (updated: PatientMaster) => void;
}

export function EditPatientModal({
  isOpen,
  onClose,
  patient,
  onSuccess,
}: EditPatientModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [gender, setGender] = useState<GenderType>("MALE");
  const [dob, setDob] = useState("");
  const [bloodGroup, setBloodGroup] = useState<BloodGroupType>("UNKNOWN");
  const [maritalStatus, setMaritalStatus] = useState("SINGLE");
  const [occupation, setOccupation] = useState("");
  const [nid, setNid] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Guardian");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync state whenever modal opens or patient changes
  useEffect(() => {
    if (patient && isOpen) {
      setFullName(patient.full_name || "");
      setPhone(patient.phone || "");
      setAlternatePhone(patient.alternate_phone || "");
      setGender(patient.gender || "MALE");
      setDob(patient.dob || "");
      setBloodGroup((patient.blood_group as BloodGroupType) || "UNKNOWN");
      setMaritalStatus(patient.marital_status || "SINGLE");
      setOccupation(patient.occupation || "");
      setNid(patient.nid || "");
      setAddress(patient.address || "");
      setEmergencyName(patient.emergency_contact_name || "");
      setEmergencyPhone(patient.emergency_contact_phone || "");
      setEmergencyRelation(patient.emergency_contact_relation || "Guardian");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [patient, isOpen]);

  if (!isOpen) return null;

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (errorMsg) setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    if (!fullName || fullName.trim().length < 2) {
      setErrorMsg("রোগীর পূর্ণ নাম আবশ্যক (কমপক্ষে ২ অক্ষর)। Full name is required (min 2 characters).");
      return;
    }

    const normalized = normalizeBDPhone(phone);
    if (!isValidNormalizedBDPhone(normalized)) {
      setErrorMsg("১১ ডিজিটের সঠিক বাংলাদেশী মোবাইল নম্বর দিন (013/014/015/016/017/018/019)। A valid 11-digit BD mobile number is required.");
      return;
    }

    if (nid.trim().length > 0) {
      const cleanNid = nid.trim().replace(/[\s-]/g, "");
      if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(cleanNid)) {
        setErrorMsg("জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন নম্বরটি সঠিক নয় (১০, ১৩ বা ১৭ ডিজিট হতে হবে)। Invalid NID/BRN length.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await updatePatientAction({
        patientId: patient.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        alternatePhone: alternatePhone.trim() || undefined,
        gender,
        dob: dob || undefined,
        bloodGroup,
        maritalStatus,
        occupation: occupation.trim() || undefined,
        nid: nid.trim() || undefined,
        address: address.trim() || undefined,
        emergencyName: emergencyName.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
        emergencyRelation: emergencyRelation.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setErrorMsg(res.error || "রোগীর তথ্য হালনাগাদ করা সম্ভব হয়নি। (Failed to update patient record)");
        setSaving(false);
        return;
      }

      setSuccessMsg("রোগীর তথ্য সফলভাবে সংশোধন ও সংরক্ষণ করা হয়েছে। (Patient record updated successfully!)");
      onSuccess(res.data.patient);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error connecting to clinical database.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition font-medium text-slate-800 placeholder:text-slate-400";
  const labelCls = "block text-[11px] font-bold text-slate-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-patient-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-sky-900 via-slate-900 to-sky-950 text-white shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black bg-sky-500/30 text-sky-200 px-2 py-0.5 rounded border border-sky-400/40">
                {patient.patient_code}
              </span>
              <h2 id="edit-patient-modal-title" className="text-base font-black tracking-tight">
                রোগীর তথ্য সংশোধন (Edit Patient Record)
              </h2>
            </div>
            <p className="text-[11px] text-sky-200/80 mt-0.5">
              রেজিস্ট্রেশনের ভুল সংশোধন ও নতুন তথ্য হালনাগাদ করুন (Update demographics & contacts)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-semibold leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="font-bold">{successMsg}</div>
            </div>
          )}

          {/* Immutable Identifiers Notice */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500" />
              <div>
                <span className="font-bold text-slate-800">অপরিবর্তনযোগ্য আইডি (Immutable Identifier): </span>
                <span className="font-mono font-bold text-sky-700">{patient.patient_code}</span>
                {patient.registration_serial && (
                  <span className="text-slate-500 ml-2">
                    (Serial: <span className="font-mono font-bold">{patient.registration_serial}</span>)
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              বিল ও পূর্ববর্তী রেকর্ড সুরক্ষিত
            </span>
          </div>

          {/* Section 1: Demographics */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sky-600" /> ১. রোগীর সাধারণ তথ্য (Basic Demographics)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelCls}>রোগীর পূর্ণ নাম (Full Name) *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Adib Arham"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>মোবাইল নম্বর (Phone Number) *</label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className={inputCls + " font-mono font-bold"}
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelCls}>বিকল্প মোবাইল নম্বর (Alternate Phone)</label>
                <input
                  type="tel"
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                  placeholder="018xxxxxxxx (ঐচ্ছিক)"
                  className={inputCls + " font-mono"}
                />
              </div>

              <div>
                <label className={labelCls}>লিঙ্গ (Gender) *</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderType)}
                  className={inputCls}
                >
                  <option value="MALE">পুরুষ (Male)</option>
                  <option value="FEMALE">মহিলা (Female)</option>
                  <option value="OTHER">অন্যান্য (Other)</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>জন্ম তারিখ (Date of Birth)</label>
                <div className="relative">
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={inputCls + " font-mono"}
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelCls}>রক্তের গ্রুপ (Blood Group)</label>
                <div className="relative">
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value as BloodGroupType)}
                    className={inputCls + " font-bold text-rose-700"}
                  >
                    <option value="UNKNOWN">অজানা (Unknown)</option>
                    <option value="A+">A Positive (A+)</option>
                    <option value="A-">A Negative (A-)</option>
                    <option value="B+">B Positive (B+)</option>
                    <option value="B-">B Negative (B-)</option>
                    <option value="AB+">AB Positive (AB+)</option>
                    <option value="AB-">AB Negative (AB-)</option>
                    <option value="O+">O Positive (O+)</option>
                    <option value="O-">O Negative (O-)</option>
                  </select>
                  <Heart className="w-3.5 h-3.5 text-rose-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelCls}>বৈবাহিক অবস্থা (Marital Status)</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className={inputCls}
                >
                  <option value="SINGLE">অবিবাহিত (Single)</option>
                  <option value="MARRIED">বিবাহিত (Married)</option>
                  <option value="WIDOWED">বিধবা/বিপত্নীক (Widowed)</option>
                  <option value="DIVORCED">তালাকপ্রাপ্ত (Divorced)</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>পেশা (Occupation)</label>
                <input
                  type="text"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. Service / Business / Student"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Identification & Address */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-600" /> ২. পরিচয়পত্র ও ঠিকানা (ID & Address)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelCls}>জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন (NID / BRN)</label>
                <input
                  type="text"
                  value={nid}
                  onChange={(e) => setNid(e.target.value)}
                  placeholder="১০, ১৩ বা ১৭ ডিজিটের সংখ্যা"
                  className={inputCls + " font-mono"}
                />
              </div>

              <div>
                <label className={labelCls}>বর্তমান ঠিকানা (Present Address)</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="বাড়ি/গ্রাম, রাস্তা, থানা, জেলা"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Emergency Contact */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> ৩. জরুরি যোগাযোগ (Emergency Contact / Guardian)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className={labelCls}>যোগাযোগের নাম (Contact Name)</label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="অভিভাবকের নাম"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>সম্পর্ক (Relationship)</label>
                <select
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  className={inputCls}
                >
                  <option value="Father">পিতা (Father)</option>
                  <option value="Mother">মাতা (Mother)</option>
                  <option value="Spouse">স্বামী / স্ত্রী (Spouse)</option>
                  <option value="Sibling">ভাই / বোন (Sibling)</option>
                  <option value="Child">সন্তান (Child)</option>
                  <option value="Guardian">অন্যান্য অভিভাবক (Guardian)</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>জরুরি ফোন (Emergency Phone)</label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className={inputCls + " font-mono"}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-50"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md hover:shadow-lg transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  সংরক্ষণ হচ্ছে... (Saving...)
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  তথ্য সংরক্ষণ করুন (Save Changes)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
