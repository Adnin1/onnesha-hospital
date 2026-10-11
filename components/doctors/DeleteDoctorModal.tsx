"use client";

import React, { useState } from "react";
import { X, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { DoctorRecord } from "@/types/appointments";
import { deleteDoctorAction } from "@/lib/appointments/actions";

export interface DeleteDoctorModalProps {
  doctor: DoctorRecord;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deletedId: string) => void;
}

export function DeleteDoctorModal({
  doctor,
  isOpen,
  onClose,
  onSuccess,
}: DeleteDoctorModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setErrorMsg(null);

    try {
      const res = await deleteDoctorAction(doctor.id);
      if (res.success && res.data?.deletedDoctorId) {
        onSuccess(res.data.deletedDoctorId);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to remove doctor.");
      }
    } catch (err: unknown) {
      console.error("[DeleteDoctorModal] error:", err);
      setErrorMsg("Network error deleting doctor profile.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-doctor-title"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-800">
        <div className="flex justify-between items-start pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-doctor-title" className="text-base font-bold text-slate-900">
                Delete Doctor Profile
              </h2>
              <p className="text-[11px] text-slate-500">ডাক্তার প্রোফাইল অপসারণ নিশ্চিতকরণ</p>
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

        {errorMsg && (
          <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <div className="py-4 space-y-3 text-xs text-slate-600">
          <p>
            Are you sure you want to remove <strong>{doctor.full_name}</strong> ({doctor.specialization})?
          </p>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] space-y-1">
            <p><strong>BMDC Reg No:</strong> {doctor.bmdc_reg_number}</p>
            <p><strong>Chamber:</strong> {doctor.room_number || "Unassigned"}</p>
            <p><strong>Department:</strong> {doctor.department_name || "General Medicine"}</p>
          </div>
          <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
            <strong>Clinical Safety Protocol:</strong> If this doctor has patient appointments, prescriptions, or clinical encounters, their profile will be safely deactivated from active booking while preserving full forensic and medical audit trails.
          </p>
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-xs disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
            {deleting ? "Removing..." : "Confirm Delete / নিশ্চিত মুছুন"}
          </button>
        </div>
      </div>
    </div>
  );
}
