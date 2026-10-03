"use client";

import React, { useState, useEffect } from "react";
import { X, Award, AlertCircle, Loader2 } from "lucide-react";
import { issueMedicalCertificateAction, MedicalCertificate } from "@/lib/registrar/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface IssueCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (certificate: MedicalCertificate) => void;
  defaultCertType?: string;
}

export function IssueCertificateModal({
  isOpen,
  onClose,
  onSuccess,
  defaultCertType = "medical_fitness",
}: IssueCertificateModalProps) {
  const [certType, setCertType] = useState<
    "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance"
  >((defaultCertType === "ALL" ? "medical_fitness" : defaultCertType) as "medical_fitness");

  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [doctorName, setDoctorName] = useState("Prof. Dr. M. A. Jalil, FCPS, FRCP");
  const [doctorDesignation, setDoctorDesignation] = useState("Chief Medical Officer & Professor of Medicine");
  const [remarks, setRemarks] = useState("Clinically examined and found physically and mentally sound.");

  // Type specific states
  const [childName, setChildName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [birthWeight, setBirthWeight] = useState(3.1);
  const [timeOfBirth, setTimeOfBirth] = useState("06:30 AM");
  const [causeOfDeath, setCauseOfDeath] = useState("");
  const [timeOfDeath, setTimeOfDeath] = useState("10:15 PM");
  const [destinationCountry, setDestinationCountry] = useState("Kingdom of Saudi Arabia (KSA)");
  const [fitStatus, setFitStatus] = useState<"FIT" | "UNFIT" | "TEMPORARILY_UNFIT">("FIT");

  const [loadingPatients, setLoadingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      } catch (err: unknown) {
        console.error("[IssueCertificateModal] fetchPatients error:", err);
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

  function generateCertNumber(): string {
    const prefixMap = {
      birth: "BC",
      death: "DC",
      medical_fitness: "FC",
      discharge: "DSC",
      overseas_clearance: "OC",
    };
    const prefix = prefixMap[certType] || "MC";
    const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
    const randomSuffix = (crypto.getRandomValues(new Uint16Array(1))[0] % 9000) + 1000;
    return `OH-${prefix}-${dateStr}-${randomSuffix}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে একজন নিবন্ধিত রোগী নির্বাচন করুন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const certNum = generateCertNumber();
    const certPayloadForHash = `${certNum}:${selectedPatient.id}:${doctorName}:${Date.now()}`;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(certPayloadForHash)
    );
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const hash = `sha256:${hashHex}`;

    const content_payload: MedicalCertificate["content_payload"] = {
      doctor_name: doctorName,
      doctor_designation: doctorDesignation,
      remarks: remarks.trim(),
    };

    if (certType === "birth") {
      content_payload.child_name = childName || selectedPatient.full_name;
      content_payload.father_name = fatherName;
      content_payload.mother_name = motherName;
      content_payload.birth_weight_kg = birthWeight;
      content_payload.time_of_birth = timeOfBirth;
    } else if (certType === "death") {
      content_payload.cause_of_death = causeOfDeath;
      content_payload.time_of_death = timeOfDeath;
    } else if (certType === "medical_fitness") {
      content_payload.fitness_status = fitStatus;
    } else if (certType === "overseas_clearance") {
      content_payload.destination_country = destinationCountry;
      content_payload.fit_for_travel = true;
    }

    const res = await issueMedicalCertificateAction({
      certificate_number: certNum,
      patient_id: selectedPatient.id,
      patient_code: selectedPatient.patient_code,
      patient_name: selectedPatient.full_name,
      certificate_type: certType,
      qr_verification_hash: hash,
      content_payload,
      doctor_name: doctorName,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMsg(res.error || "সার্টিফিকেট ইস্যু করতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">নতুন অফিসিয়াল সনদপত্র প্রদান (Issue Medical Certificate)</h2>
              <p className="text-xs text-amber-200">
                হাসপাতালের অ্যান্টি-টেম্পার QR কোড ও ডিজিটাল সিগনেচার যুক্ত সনদ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-amber-200 hover:text-white hover:bg-white/10 transition-colors"
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

          {/* Certificate Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              সনদপত্রের ধরন (Certificate Type) <span className="text-rose-500">*</span>
            </label>
            <select
              value={certType}
              onChange={(e) =>
                setCertType(
                  e.target.value as "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance"
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="medical_fitness">Medical Fitness Certificate (শারীরিক সুস্থতা সনদ)</option>
              <option value="birth">Official Birth Certificate (হাসপাতাল জন্ম সনদ)</option>
              <option value="death">Official Death Certificate (হাসপাতাল মৃত্যু সনদ)</option>
              <option value="discharge">Hospital Discharge Certificate (ছাড়পত্র সনদ)</option>
              <option value="overseas_clearance">Overseas Health Clearance (বিদেশগামী স্বাস্থ্য ছাড়পত্র)</option>
            </select>
          </div>

          {/* Patient Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              সনদপ্রাপক রোগী (Patient) <span className="text-rose-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                  <p className="text-xs font-mono text-slate-500">
                    ID: {selectedPatient.patient_code} • {selectedPatient.phone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-amber-700 hover:text-amber-900 font-semibold"
                >
                  পরিবর্তন করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="রোগীর নাম বা মোবাইল নম্বর দিয়ে সার্চ করুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {loadingPatients ? (
                    <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> লোড হচ্ছে...
                    </div>
                  ) : patients.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">কোন রোগী পাওয়া যায়নি</div>
                  ) : (
                    patients.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setSelectedPatient(pat)}
                        className="w-full p-2.5 text-left hover:bg-amber-50/50 flex items-center justify-between text-xs"
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

          {/* Conditional Type Fields */}
          {certType === "birth" && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <p className="text-xs font-bold text-amber-900">নবজাতকের তথ্য (Newborn Details)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">শিশুর নাম</label>
                  <input
                    type="text"
                    placeholder="Baby of..."
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">জন্মের ওজন (কেজি)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={birthWeight}
                    onChange={(e) => setBirthWeight(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">পিতার নাম</label>
                  <input
                    type="text"
                    placeholder="Father Name"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">মাতার নাম</label>
                  <input
                    type="text"
                    placeholder="Mother Name"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">জন্মের সময় (Time of Birth)</label>
                  <input
                    type="text"
                    placeholder="e.g. 06:30 AM"
                    value={timeOfBirth}
                    onChange={(e) => setTimeOfBirth(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {certType === "death" && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <p className="text-xs font-bold text-rose-900">মৃত্যুর তথ্য (Death Confirmation)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">মৃত্যুর মূল কারণ (Primary Cause of Death)</label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiopulmonary arrest due to Acute Myocardial Infarction"
                    value={causeOfDeath}
                    onChange={(e) => setCauseOfDeath(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">মৃত্যুর সময় (Time of Death)</label>
                  <input
                    type="text"
                    placeholder="e.g. 10:15 PM"
                    value={timeOfDeath}
                    onChange={(e) => setTimeOfDeath(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {certType === "medical_fitness" && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <label className="block text-xs font-bold text-emerald-900 mb-1">ফিটনেস স্ট্যাটাস (Medical Assessment)</label>
              <select
                value={fitStatus}
                onChange={(e) => setFitStatus(e.target.value as "FIT" | "UNFIT" | "TEMPORARILY_UNFIT")}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="FIT">✅ FIT (সম্পূর্ণ শারীরিক ও মানসিকভাবে সুস্থ)</option>
                <option value="TEMPORARILY_UNFIT">⚠️ TEMPORARILY UNFIT (সাময়িক অসুস্থ)</option>
                <option value="UNFIT">❌ UNFIT (চিকিৎসাগতভাবে অনুপযুক্ত)</option>
              </select>
            </div>
          )}

          {certType === "overseas_clearance" && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
              <label className="block text-xs font-bold text-blue-900 mb-1">গন্তব্য দেশ (Destination Country)</label>
              <input
                type="text"
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                placeholder="e.g. Kingdom of Saudi Arabia / UAE / UK / Canada"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
          )}

          {/* Doctor Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ইস্যুকারী চিকিৎসক (Doctor Name)</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">পদবী (Designation)</label>
              <input
                type="text"
                value={doctorDesignation}
                onChange={(e) => setDoctorDesignation(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">সার্টিফিকেট মন্তব্য / বিবরণ (Medical Remarks)</label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
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
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ইস্যু হচ্ছে...
                </>
              ) : (
                "সনদপত্র ইস্যু করুন (Issue Certificate)"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
