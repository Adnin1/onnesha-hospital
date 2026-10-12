"use client";

import React, { useState, useEffect } from "react";
import { X, UserCheck, Stethoscope, Building, Loader2 } from "lucide-react";
import { DoctorRecord } from "@/types/appointments";
import { updateDoctorAction } from "@/lib/appointments/actions";

export interface EditDoctorModalProps {
  doctor: DoctorRecord;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: DoctorRecord) => void;
}

export function EditDoctorModal({
  doctor,
  isOpen,
  onClose,
  onSuccess,
}: EditDoctorModalProps) {
  const [fullName, setFullName] = useState(doctor.full_name);
  const [specialization, setSpecialization] = useState(doctor.specialization);
  const [bmdcRegNumber, setBmdcRegNumber] = useState(doctor.bmdc_reg_number || "");
  const [degrees, setDegrees] = useState(doctor.degrees || "MBBS");
  const [designation, setDesignation] = useState(doctor.designation || "Consultant");
  const [phone, setPhone] = useState(doctor.phone || "");
  const [roomNumber, setRoomNumber] = useState(doctor.room_number || "");
  const [consultationFee, setConsultationFee] = useState(doctor.opd_fee ? String(doctor.opd_fee) : "800");
  const [followupFee, setFollowupFee] = useState(doctor.followup_fee !== undefined ? String(doctor.followup_fee) : "400");
  const [reportFee, setReportFee] = useState(doctor.report_fee !== undefined ? String(doctor.report_fee) : "0");
  const [isActive, setIsActive] = useState(doctor.is_active !== false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setFullName(doctor.full_name);
    setSpecialization(doctor.specialization);
    setBmdcRegNumber(doctor.bmdc_reg_number || "");
    setDegrees(doctor.degrees || "MBBS");
    setDesignation(doctor.designation || "Consultant");
    setPhone(doctor.phone || "");
    setRoomNumber(doctor.room_number || "");
    setConsultationFee(doctor.opd_fee ? String(doctor.opd_fee) : "800");
    setFollowupFee(doctor.followup_fee !== undefined ? String(doctor.followup_fee) : "400");
    setReportFee(doctor.report_fee !== undefined ? String(doctor.report_fee) : "0");
    setIsActive(doctor.is_active !== false);
    setErrorMsg(null);
  }, [doctor]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !specialization.trim() || !roomNumber.trim()) {
      setErrorMsg("Full name, specialization, and chamber room number are mandatory.");
      return;
    }

    const feeNum = parseFloat(consultationFee);
    if (isNaN(feeNum) || feeNum < 0) {
      setErrorMsg("Please enter a valid OPD consultation fee.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await updateDoctorAction({
        doctorId: doctor.id,
        fullName: fullName.trim(),
        specialization: specialization.trim(),
        bmdcRegNumber: bmdcRegNumber.trim() || undefined,
        degrees: degrees.trim() || "MBBS",
        designation: designation.trim() || "Consultant",
        phone: phone.trim() || undefined,
        roomNumber: roomNumber.trim(),
        consultationFee: feeNum,
        followupFee: parseFloat(followupFee) || 0,
        reportFee: parseFloat(reportFee) || 0,
        isActive,
      });

      if (res.success && res.data?.doctor) {
        onSuccess(res.data.doctor);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to update doctor profile");
      }
    } catch (err: unknown) {
      console.error("[EditDoctorModal] error:", err);
      setErrorMsg("Network error saving doctor profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-doctor-title"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-slate-800 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 id="edit-doctor-title" className="text-base font-bold text-slate-900">
                Edit Doctor Profile / ডাক্তার বিবরণ পরিবর্তন
              </h2>
              <p className="text-[11px] text-slate-500">
                Update specialist credentials, consultation tariffs, and chamber allocation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 py-3 space-y-4 text-xs">
          {/* Full Name & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name (ডাক্তারের নাম) *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50 font-medium"
                placeholder="e.g. Dr. Mahin Khan"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Designation (পদবী) *</label>
              <input
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50"
                placeholder="e.g. Senior Consultant"
              />
            </div>
          </div>

          {/* Specialization & BMDC */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Specialization (বিশেষজ্ঞতা) *</label>
              <input
                type="text"
                required
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50"
                placeholder="e.g. Cardiology & Interventionalist"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">BMDC Reg No. (বিএমডিসি নম্বর - ঐচ্ছিক / Optional)</label>
              <input
                type="text"
                value={bmdcRegNumber}
                onChange={(e) => setBmdcRegNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50 font-mono"
                placeholder="e.g. A-45210 (ঐচ্ছিক)"
              />
            </div>
          </div>

          {/* Degrees & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Degrees / Qualifications (ডিগ্রী)</label>
              <input
                type="text"
                value={degrees}
                onChange={(e) => setDegrees(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50"
                placeholder="e.g. MBBS, FCPS (Cardiology), MD"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Contact Phone (যোগাযোগ ফোন)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-slate-50 font-mono"
                placeholder="e.g. +880 1712-345678"
              />
            </div>
          </div>

          {/* Chamber Room & Fees */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center text-slate-700 font-bold text-[11px] uppercase tracking-wide">
              <Building className="w-3.5 h-3.5 mr-1 text-sky-600" />
              Chamber & Consultation Tariffs
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Chamber Room *</label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-white"
                  placeholder="e.g. Room 204"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">OPD Fee (BDT) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="50"
                  value={consultationFee}
                  onChange={(e) => setConsultationFee(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-white font-mono font-bold text-emerald-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Follow-up Fee (BDT)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={followupFee}
                  onChange={(e) => setFollowupFee(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Report Show Fee (BDT)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={reportFee}
                  onChange={(e) => setReportFee(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 bg-white font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 pt-4">
                <input
                  type="checkbox"
                  id="doctor-is-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
                />
                <label htmlFor="doctor-is-active" className="font-bold text-slate-700 cursor-pointer">
                  Doctor is Active on OPD Roster
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <UserCheck className="w-4 h-4 mr-1.5" />}
              {saving ? "Updating..." : "Save Changes / পরিবর্তন সংরক্ষণ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
