"use client";

import React, { useState, useEffect } from "react";
import { X, UserPlus, AlertCircle, Loader2, Bed } from "lucide-react";
import {
  createCriticalCareAdmissionAction,
  getCriticalCareUnitsAction,
  getAvailableCriticalCareBedsAction,
  CriticalCareAdmission,
  CriticalCareUnit,
} from "@/lib/critical-care/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface CriticalCareAdmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (admission: CriticalCareAdmission) => void;
  defaultUnitType?: string;
}

export function CriticalCareAdmissionModal({
  isOpen,
  onClose,
  onSuccess,
  defaultUnitType = "ICU",
}: CriticalCareAdmissionModalProps) {
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);

  const [units, setUnits] = useState<CriticalCareUnit[]>([]);
  const [unitType, setUnitType] = useState(defaultUnitType);
  const [availableBeds, setAvailableBeds] = useState<Array<{ id: string; bed_number: string }>>([]);
  const [bedNumber, setBedNumber] = useState("");
  const [customBed, setCustomBed] = useState(false);

  const [initialDiagnosis, setInitialDiagnosis] = useState("");
  const [ventilatorRequired, setVentilatorRequired] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Load units on mount
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function fetchUnits() {
      const res = await getCriticalCareUnitsAction();
      if (isMounted && res.success && res.data) {
        setUnits(res.data);
      }
    }
    void fetchUnits();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // 2. Load available beds for selected unit type
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function fetchBeds() {
      setLoadingBeds(true);
      const res = await getAvailableCriticalCareBedsAction(unitType);
      if (isMounted) {
        if (res.success && res.data && res.data.length > 0) {
          setAvailableBeds(res.data);
          setBedNumber(res.data[0].bed_number);
          setCustomBed(false);
        } else {
          setAvailableBeds([]);
          setBedNumber(`${unitType}-01`);
          setCustomBed(true);
        }
        setLoadingBeds(false);
      }
    }
    void fetchBeds();
    return () => {
      isMounted = false;
    };
  }, [isOpen, unitType]);

  // 3. Search patients debounced
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
      } catch {
        // fallback
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

  const currentUnit = units.find((u) => u.unit_type === unitType) || units[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে একজন রোগী নির্বাচন করুন (Please select a registered patient).");
      return;
    }
    if (!initialDiagnosis.trim()) {
      setErrorMsg("রোগীর প্রাথমিক রোগ নির্ণয় (Initial Diagnosis) উল্লেখ করুন।");
      return;
    }
    if (!bedNumber.trim()) {
      setErrorMsg("বেড নম্বর আবশ্যক।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createCriticalCareAdmissionAction({
      patient_id: selectedPatient.id,
      patient_code: selectedPatient.patient_code,
      patient_name: selectedPatient.full_name,
      unit_id: currentUnit?.id || `c0000000-0001-0000-0000-000000000001`,
      unit_type: unitType,
      bed_number: bedNumber.toUpperCase().trim(),
      initial_diagnosis: initialDiagnosis.trim(),
      ventilator_required: ventilatorRequired,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMsg(res.error || "ক্রিটিক্যাল কেয়ারে ভর্তি করাতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-rose-700 to-rose-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">নতুন ক্রিটিক্যাল কেয়ার ভর্তি (ICU/CCU Admission)</h2>
              <p className="text-xs text-rose-200">
                জীবন রক্ষাকারী নিবিড় পর্যবেক্ষণ ইউনিটে রোগী ভর্তি ও ভেন্টিলেটর বরাদ্দ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-rose-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Patient Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              রোগী নির্বাচন করুন (Select Patient) <span className="text-rose-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                  <p className="text-xs font-mono text-slate-500">
                    ID: {selectedPatient.patient_code} • Phone: {selectedPatient.phone} • {selectedPatient.gender}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                >
                  পরিবর্তন করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="রোগীর নাম বা মোবাইল নম্বর বা Patient ID দিয়ে খুঁজুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {loadingPatients ? (
                    <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> তালিকা লোড হচ্ছে...
                    </div>
                  ) : patients.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">কোন রোগী পাওয়া যায়নি</div>
                  ) : (
                    patients.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setSelectedPatient(pat)}
                        className="w-full p-2.5 text-left hover:bg-rose-50/50 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <span className="font-semibold text-slate-900">{pat.full_name}</span>
                        <span className="font-mono text-slate-500">{pat.patient_code} ({pat.phone})</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Unit & Bed Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ক্রিটিক্যাল ইউনিট (Unit Type)
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
              >
                {units.length > 0 ? (
                  units.map((u) => (
                    <option key={u.id} value={u.unit_type}>
                      {u.unit_name} ({u.unit_type})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="ICU">Intensive Care Unit (ICU)</option>
                    <option value="ICCU">Intensive Coronary Care Unit (ICCU)</option>
                    <option value="CCU">Coronary Care Unit (CCU)</option>
                    <option value="SICU">Surgical ICU (SICU)</option>
                    <option value="MICU">Medical ICU (MICU)</option>
                    <option value="PICU">Pediatric ICU (PICU)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  বেড নম্বর (Bed Number) <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomBed(!customBed)}
                  className="text-[11px] text-rose-600 hover:text-rose-800 underline"
                >
                  {customBed ? "তালিকা থেকে বাছুন" : "কাস্টম বেড টাইপ"}
                </button>
              </div>

              {!customBed && availableBeds.length > 0 ? (
                <div className="relative">
                  <select
                    value={bedNumber}
                    onChange={(e) => setBedNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  >
                    {availableBeds.map((b) => (
                      <option key={b.id} value={b.bed_number}>
                        {b.bed_number} (Vacant)
                      </option>
                    ))}
                  </select>
                  {loadingBeds && (
                    <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-slate-400" />
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={bedNumber}
                    onChange={(e) => setBedNumber(e.target.value)}
                    placeholder="e.g. ICU-01"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                  <Bed className="h-4 w-4 absolute right-3 top-3 text-slate-400" />
                </div>
              )}
            </div>
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              প্রাথমিক রোগ নির্ণয় / কারণ (Initial Diagnosis) <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={initialDiagnosis}
              onChange={(e) => setInitialDiagnosis(e.target.value)}
              placeholder="e.g. Acute Respiratory Distress Syndrome (ARDS), Septic shock, Myocardial Infarction..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
            />
          </div>

          {/* Ventilator Support Toggle */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-900">মেকানিক্যাল ভেন্টিলেটর সাপোর্ট (Invasive Ventilator)</p>
              <p className="text-[11px] text-amber-700">রোগীর কি তাৎক্ষণিক ভেন্টিলেটর সাপোর্টের প্রয়োজন আছে?</p>
            </div>
            <input
              type="checkbox"
              id="ventilator-toggle"
              checked={ventilatorRequired}
              onChange={(e) => setVentilatorRequired(e.target.checked)}
              className="h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
            />
          </div>

          {/* Modal Footer */}
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
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ভর্তি হচ্ছে...
                </>
              ) : (
                "ভর্তি সম্পন্ন করুন (Admit Patient)"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
