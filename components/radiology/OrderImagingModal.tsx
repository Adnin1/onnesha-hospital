"use client";

import React, { useState, useEffect } from "react";
import { X, Scan, AlertCircle, Loader2 } from "lucide-react";
import { createRadiologyStudyAction, RadiologyStudy } from "@/lib/radiology/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface OrderImagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (study: RadiologyStudy) => void;
  defaultModality?: string;
}

const COMMON_STUDIES: Record<string, string[]> = {
  XRAY: [
    "Chest X-Ray P/A View (Digital)",
    "X-Ray KUB (Kidney, Ureter, Bladder)",
    "X-Ray Cervical Spine A/P & Lateral",
    "X-Ray Lumbo-Sacral Spine A/P & Lateral",
    "X-Ray Both Knee Joints A/P & Lateral",
  ],
  CT: [
    "CT Scan of Brain (Plain 128-Slice)",
    "HRCT of Chest (High Resolution CT)",
    "CT Abdomen with Pelvis (Triple Phase Contrast)",
    "CT Angiogram of Coronary Arteries",
  ],
  MRI: [
    "MRI of Brain (Plain & Contrast 1.5 Tesla)",
    "MRI of Lumbo-Sacral Spine",
    "MRI of Cervical Spine",
    "MRI of Knee Joint (Musculoskeletal)",
  ],
  USG: [
    "USG of Whole Abdomen with KUB & PVR",
    "USG of Pregnancy (Anomaly Scan & Doppler)",
    "USG of Thyroid Gland with Neck Nodes",
    "USG of Both Breasts (Sono-mammography)",
  ],
  ECG: [
    "12-Lead Electrocardiogram (ECG)",
    "Computerized Rhythm Strip Analysis",
  ],
  ECHO: [
    "2D Echocardiography with Color Doppler",
    "Tissue Doppler Imaging (TDI) & Strain",
  ],
};

export function OrderImagingModal({
  isOpen,
  onClose,
  onSuccess,
  defaultModality = "XRAY",
}: OrderImagingModalProps) {
  const [modality, setModality] = useState<
    "XRAY" | "CT" | "MRI" | "USG" | "ECG" | "ECHO"
  >((defaultModality === "ALL" ? "XRAY" : defaultModality) as "XRAY");

  const [studyName, setStudyName] = useState<string>(
    COMMON_STUDIES[defaultModality === "ALL" ? "XRAY" : defaultModality]?.[0] || "Chest X-Ray P/A View (Digital)"
  );
  const [clinicalIndication, setClinicalIndication] = useState<string>("");

  const [patientSearch, setPatientSearch] = useState<string>("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);

  const [loadingPatients, setLoadingPatients] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে একজন রোগী নির্বাচন করুন।");
      return;
    }
    if (!studyName.trim()) {
      setErrorMsg("ইমেজিং পরীক্ষার নাম উল্লেখ করুন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createRadiologyStudyAction({
      patient_id: selectedPatient.id,
      patient_code: selectedPatient.patient_code,
      patient_name: selectedPatient.full_name,
      patient_phone: selectedPatient.phone,
      patient_gender: selectedPatient.gender,
      modality_code: modality,
      study_name: studyName.trim(),
      clinical_indication: clinicalIndication.trim(),
    });

    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMsg(res.error || "ইমেজিং পরীক্ষা অর্ডার করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-600 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <Scan className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">নতুন রেডিওলজি পরীক্ষা অর্ডার (Order Imaging Study)</h2>
              <p className="text-xs text-indigo-200">
                DICOM/PACS ও ডিজিটাল মডালিটি শিডিউলিং কনসোল
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
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
                    ID: {selectedPatient.patient_code} • {selectedPatient.phone} • {selectedPatient.gender}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  পরিবর্তন করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="রোগীর নাম বা মোবাইল সার্চ করুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {loadingPatients ? (
                    <div className="p-2.5 text-center text-xs text-slate-400">খোঁজা হচ্ছে...</div>
                  ) : patients.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-slate-400">কোন রোগী পাওয়া যায়নি</div>
                  ) : (
                    patients.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setSelectedPatient(pat)}
                        className="w-full p-2.5 text-left hover:bg-indigo-50/50 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-slate-900">{pat.full_name}</span>
                        <span className="font-mono text-slate-500">{pat.patient_code}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modality & Study Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                মডালিটি (Modality Type)
              </label>
              <select
                value={modality}
                onChange={(e) => {
                  const m = e.target.value as "XRAY" | "CT" | "MRI" | "USG" | "ECG" | "ECHO";
                  setModality(m);
                  if (COMMON_STUDIES[m]?.[0]) setStudyName(COMMON_STUDIES[m][0]);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-700"
              >
                <option value="XRAY">X-Ray (ডিজিটাল এক্স-রে)</option>
                <option value="CT">CT Scan (১২৮-স্লাইস সিটি স্ক্যান)</option>
                <option value="MRI">MRI (১.৫ টেসলা এমআরআই)</option>
                <option value="USG">USG (৪ডি কালার আল্ট্রাসাউন্ড)</option>
                <option value="ECG">ECG (১২-লিড ইসিজি)</option>
                <option value="ECHO">Echocardiography (ইকোকার্ডিওগ্রাফি)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                সাধারণ পরীক্ষাগুলো (Quick Select)
              </label>
              <select
                value={studyName}
                onChange={(e) => setStudyName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                {(COMMON_STUDIES[modality] || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Study Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              পরীক্ষার সম্পূর্ণ নাম (Investigation Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={studyName}
              onChange={(e) => setStudyName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Clinical Indication */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ক্লিনিক্যাল লক্ষণ / উপসর্গ (Clinical Indication)
            </label>
            <textarea
              rows={2}
              value={clinicalIndication}
              onChange={(e) => setClinicalIndication(e.target.value)}
              placeholder="e.g. Persistent productive cough, fever for 5 days, severe low back pain radiating to left leg..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  অর্ডার হচ্ছে...
                </>
              ) : (
                <>
                  <Scan className="h-4 w-4" />
                  অর্ডার সম্পন্ন করুন (Submit Study Order)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
