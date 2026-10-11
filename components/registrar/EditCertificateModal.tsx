"use client";

import React, { useState, useEffect } from "react";
import { X, Award, AlertCircle, Loader2, Save } from "lucide-react";
import { updateMedicalCertificateAction, MedicalCertificate } from "@/lib/registrar/actions";

interface EditCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: MedicalCertificate | null;
  onSuccess: (updatedCert: MedicalCertificate) => void;
}

export function EditCertificateModal({
  isOpen,
  onClose,
  certificate,
  onSuccess,
}: EditCertificateModalProps) {
  const [certType, setCertType] = useState<MedicalCertificate["certificate_type"]>("medical_fitness");
  const [purpose, setPurpose] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [idMark, setIdMark] = useState("");
  const [examinationDate, setExaminationDate] = useState("");
  const [restFromDate, setRestFromDate] = useState("");
  const [restToDate, setRestToDate] = useState("");
  const [fitToResumeDate, setFitToResumeDate] = useState("");
  const [fitnessStatus, setFitnessStatus] = useState<
    "FIT" | "UNFIT" | "TEMPORARILY_UNFIT" | "FIT_FOR_LIGHT_DUTY_ONLY"
  >("FIT");

  // Vitals
  const [bp, setBp] = useState("");
  const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");

  // Doctor Details
  const [doctorName, setDoctorName] = useState("");
  const [doctorDesignation, setDoctorDesignation] = useState("");
  const [doctorBmdc, setDoctorBmdc] = useState("");
  const [doctorDept, setDoctorDept] = useState("");
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!certificate) return;
    setCertType(certificate.certificate_type);
    const p = certificate.content_payload || {};
    setPurpose(p.purpose || "Official Clinical Certification");
    setDiagnosis(p.diagnosis || "Acute Febrile Illness with Systemic Exhaustion");
    setIdMark(p.identification_mark || "A scar/mole noted on physical examination");
    setExaminationDate(
      (typeof p.examination_date === "string" ? p.examination_date : null) || certificate.issue_date
    );
    setRestFromDate(p.rest_from_date || "");
    setRestToDate(p.rest_to_date || "");
    setFitToResumeDate(p.fit_to_resume_date || "");
    setFitnessStatus(
      (p.fitness_status as "FIT" | "UNFIT" | "TEMPORARILY_UNFIT" | "FIT_FOR_LIGHT_DUTY_ONLY") || "FIT"
    );

    if (p.vitals) {
      setBp(p.vitals.bp || "120/80");
      setPulse(p.vitals.pulse || "76");
      setTemp(p.vitals.temp || "98.4°F");
      setSpo2(p.vitals.spo2 || "99");
      setWeight(p.vitals.weight || "65");
    } else {
      setBp("120/80");
      setPulse("76");
      setTemp("98.4°F");
      setSpo2("99");
      setWeight("65");
    }

    setDoctorName(p.doctor_name || certificate.issued_by || "Prof. Dr. M. A. Jalil, FCPS, FRCP");
    setDoctorDesignation(p.doctor_designation || "Senior Consultant & Clinical Specialist");
    setDoctorBmdc(p.doctor_bmdc_reg || "BMDC Reg No: A-48291");
    setDoctorDept(p.doctor_department || "Department of Medicine & Critical Care");
    setRemarks(p.remarks || "Clinically examined and found physically sound.");
    setErrorMsg(null);
  }, [certificate]);

  if (!isOpen || !certificate) return null;

  // Auto calculate duration in days
  const durationDays = (() => {
    if (!restFromDate || !restToDate) return 0;
    const from = new Date(restFromDate);
    const to = new Date(restToDate);
    const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 3600 * 24)) + 1;
    return diff > 0 ? diff : 0;
  })();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!certificate) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // Cryptographically compute new verification hash
      const dataToHash = `${certificate.certificate_number}|${certificate.patient_id}|${diagnosis}|${restFromDate}|${restToDate}|${doctorBmdc}|${Date.now()}`;
      const msgBuffer = new TextEncoder().encode(dataToHash);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const res = await updateMedicalCertificateAction({
        certificate_id: certificate.id,
        certificate_type: certType,
        qr_verification_hash: hashHex,
        content_payload: {
          ...certificate.content_payload,
          purpose,
          diagnosis,
          identification_mark: idMark,
          examination_date: examinationDate,
          rest_from_date: restFromDate || undefined,
          rest_to_date: restToDate || undefined,
          rest_days_count: durationDays || undefined,
          fit_to_resume_date: fitToResumeDate || undefined,
          fitness_status: fitnessStatus,
          vitals: {
            bp,
            pulse,
            temp,
            spo2,
            weight,
          },
          doctor_name: doctorName,
          doctor_designation: doctorDesignation,
          doctor_bmdc_reg: doctorBmdc,
          doctor_department: doctorDept,
          remarks,
        },
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to update certificate.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving updates");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                সনদপত্র সম্পাদনা ও সংশোধন (Edit Medical Certificate)
              </h2>
              <p className="text-xs text-slate-300 font-mono">
                Cert No: {certificate.certificate_number} • Patient: {certificate.patients?.full_name} ({certificate.patients?.patient_code})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 text-sm">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Certificate Type & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                সনদপত্রের ধরন (Certificate Category) *
              </label>
              <select
                value={certType}
                onChange={(e) => setCertType(e.target.value as MedicalCertificate["certificate_type"])}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="medical_fitness">Medical Fitness Certificate (সুস্থতা সনদপত্র)</option>
                <option value="sick_leave">Sick Leave & Bed Rest (ছুটি ও বিশ্রাম সনদপত্র)</option>
                <option value="fitness_to_work">Fitness to Resume Duty (কর্মে যোগদানের সুস্থতা)</option>
                <option value="treatment">Treatment & Illness (চিকিৎসা গ্রহণ ও অসুস্থতা)</option>
                <option value="overseas_clearance">Overseas Travel Clearance (আন্তর্জাতিক স্বাস্থ্য ছাড়পত্র)</option>
                <option value="discharge">Hospital Discharge Certificate (ছাড়পত্র)</option>
                <option value="birth">Birth Certificate (জন্ম সনদপত্র)</option>
                <option value="death">Death Certificate (মৃত্যু সনদপত্র)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                সনদপত্রের উদ্দেশ্য (Certificate Purpose)
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Sick Leave / Pre-employment / Visa / Court"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Identification Mark & Examination Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                রোগীর সনাক্তকরণ চিহ্ন (Identification Mark) *
              </label>
              <input
                type="text"
                value={idMark}
                onChange={(e) => setIdMark(e.target.value)}
                placeholder="e.g. Scar on right forearm, mole on collarbone"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                শারীরিক পরীক্ষার তারিখ (Examination Date)
              </label>
              <input
                type="date"
                value={examinationDate}
                onChange={(e) => setExaminationDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ক্লিনিকাল ডায়াগনোসিস (Clinical Diagnosis & Condition) *
            </label>
            <textarea
              rows={2}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Acute Febrile Illness with Severe Physical Exhaustion, Bronchial Asthma..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          {/* Vitals */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              শারীরিক পরীক্ষার ভাইটালস (Physical Examination Vitals)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block">BP (mmHg)</label>
                <input
                  type="text"
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Pulse (bpm)</label>
                <input
                  type="text"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Temp (°F)</label>
                <input
                  type="text"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">SpO2 (%)</label>
                <input
                  type="text"
                  value={spo2}
                  onChange={(e) => setSpo2(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Weight (kg)</label>
                <input
                  type="text"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* Rest Duration & Fitness Assessment */}
          <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950">
                ছুটি ও বিশ্রামের মেয়াদ (Prescribed Bed Rest & Duty Resumption)
              </span>
              {durationDays > 0 && (
                <span className="px-2 py-0.5 bg-amber-200 text-amber-950 text-xs font-bold rounded">
                  মোট ছুটি: {durationDays} দিন
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  বিশ্রাম শুরু (Rest From)
                </label>
                <input
                  type="date"
                  value={restFromDate}
                  onChange={(e) => setRestFromDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  বিশ্রাম শেষ (Rest To)
                </label>
                <input
                  type="date"
                  value={restToDate}
                  onChange={(e) => setRestToDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  কর্মে যোগদানের তারিখ (Fit to Resume)
                </label>
                <input
                  type="date"
                  value={fitToResumeDate}
                  onChange={(e) => setFitToResumeDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                শারীরিক সুস্থতার স্ট্যাটাস (Duty Fitness Assessment)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "FIT", label: "FIT FOR NORMAL DUTY" },
                  { id: "TEMPORARILY_UNFIT", label: "TEMPORARILY UNFIT" },
                  { id: "FIT_FOR_LIGHT_DUTY_ONLY", label: "LIGHT DUTY ONLY" },
                  { id: "UNFIT", label: "UNFIT FOR DUTY" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFitnessStatus(s.id as typeof fitnessStatus)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-colors ${
                      fitnessStatus === s.id
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Doctor BMDC Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                চিকিৎসকের নাম (Doctor Name) *
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                BMDC রেজিস্ট্রেশন নম্বর (BMDC Reg No) *
              </label>
              <input
                type="text"
                value={doctorBmdc}
                onChange={(e) => setDoctorBmdc(e.target.value)}
                placeholder="e.g. BMDC Reg No: A-48291"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                পদবী (Designation & Degrees)
              </label>
              <input
                type="text"
                value={doctorDesignation}
                onChange={(e) => setDoctorDesignation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                বিভাগ (Department)
              </label>
              <input
                type="text"
                value={doctorDept}
                onChange={(e) => setDoctorDept(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              বিশেষ পরামর্শ / মন্তব্য (Medical Advice & Remarks)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Strict rest advised. Avoid heavy lifting."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  সংরক্ষণ করা হচ্ছে...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  পরিবর্তন সংরক্ষণ করুন (Save Updates)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
