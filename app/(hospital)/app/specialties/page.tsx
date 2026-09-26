"use client";

import React, { useState, useEffect } from "react";
import {
  Smile,
  Eye,
  Activity,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  getDentalExaminationsAction,
  getEyeExaminationsAction,
  getPhysiotherapySessionsAction,
  createDentalExaminationAction,
  createEyeExaminationAction,
  createPhysiotherapySessionAction,
  DentalExaminationRecord,
  EyeExaminationRecord,
  PhysiotherapySessionRecord,
} from "@/lib/specialties/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function SpecialtiesClinicalPage() {
  const [activeTab, setActiveTab] = useState<"dental" | "eye" | "physio">("dental");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data states
  const [dentalRecords, setDentalRecords] = useState<DentalExaminationRecord[]>([]);
  const [eyeRecords, setEyeRecords] = useState<EyeExaminationRecord[]>([]);
  const [physioRecords, setPhysioRecords] = useState<PhysiotherapySessionRecord[]>([]);

  // Modal form states
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Dental form state
  const [patientId, setPatientId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [toothNumber, setToothNumber] = useState("");
  const [caries, setCaries] = useState(false);
  const [gingivitis, setGingivitis] = useState(false);
  const [calculus, setCalculus] = useState(false);
  const [dentalDiagnosis, setDentalDiagnosis] = useState("");
  const [dentalProcedure, setDentalProcedure] = useState("");
  const [dentalFee, setDentalFee] = useState<number>(500);

  // Eye form state
  const [eyeComplaint, setEyeComplaint] = useState("");
  const [visualAcuityOd, setVisualAcuityOd] = useState("6/6");
  const [visualAcuityOs, setVisualAcuityOs] = useState("6/6");
  const [iopOd, setIopOd] = useState<number>(14);
  const [iopOs, setIopOs] = useState<number>(15);
  const [eyeDiagnosis, setEyeDiagnosis] = useState("");
  const [eyeProcedure, setEyeProcedure] = useState("");
  const [eyeFee, setEyeFee] = useState<number>(600);

  // Physio form state
  const [physioComplaint, setPhysioComplaint] = useState("");
  const [painInitial, setPainInitial] = useState<number>(7);
  const [painPost, setPainPost] = useState<number>(3);
  const [physioAssessment, setPhysioAssessment] = useState("");
  const [physioPlan, setPhysioPlan] = useState("");
  const [modalities, setModalities] = useState<string[]>(["TENS", "Therapeutic Exercise"]);
  const [sessionNum, setSessionNum] = useState<number>(1);
  const [totalSessions, setTotalSessions] = useState<number>(5);
  const [physioFee, setPhysioFee] = useState<number>(400);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      try {
        if (activeTab === "dental") {
          const res = await getDentalExaminationsAction();
          if (isMounted && res.success && res.data) setDentalRecords(res.data);
        } else if (activeTab === "eye") {
          const res = await getEyeExaminationsAction();
          if (isMounted && res.success && res.data) setEyeRecords(res.data);
        } else {
          const res = await getPhysiotherapySessionsAction();
          if (isMounted && res.success && res.data) setPhysioRecords(res.data);
        }
      } catch (err: unknown) {
        if (isMounted) setErrorMsg(err instanceof Error ? err.message : "Failed to load records");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  async function handleCreateRecord(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (activeTab === "dental") {
        const res = await createDentalExaminationAction({
          patient_id: patientId || "00000000-0000-0000-0000-000000000001",
          chief_complaint: chiefComplaint,
          tooth_number: toothNumber,
          dental_findings: { caries, gingivitis, calculus },
          diagnosis: dentalDiagnosis,
          procedure_done: dentalProcedure,
          procedure_fee: dentalFee,
        });
        if (!res.success) throw new Error(res.error);
        setDentalRecords((prev) => [res.data!, ...prev]);
        setSuccessMsg("Dental examination recorded successfully");
      } else if (activeTab === "eye") {
        const res = await createEyeExaminationAction({
          patient_id: patientId || "00000000-0000-0000-0000-000000000001",
          chief_complaint: eyeComplaint,
          visual_acuity_od: visualAcuityOd,
          visual_acuity_os: visualAcuityOs,
          intraocular_pressure_od: iopOd,
          intraocular_pressure_os: iopOs,
          diagnosis: eyeDiagnosis,
          procedure_done: eyeProcedure,
          procedure_fee: eyeFee,
        });
        if (!res.success) throw new Error(res.error);
        setEyeRecords((prev) => [res.data!, ...prev]);
        setSuccessMsg("Eye examination recorded successfully");
      } else {
        const res = await createPhysiotherapySessionAction({
          patient_id: patientId || "00000000-0000-0000-0000-000000000001",
          chief_complaint: physioComplaint,
          pain_score_initial: painInitial,
          pain_score_post: painPost,
          assessment_findings: physioAssessment,
          treatment_plan: physioPlan,
          modalities_applied: modalities,
          session_number: sessionNum,
          total_sessions_prescribed: totalSessions,
          session_fee: physioFee,
        });
        if (!res.success) throw new Error(res.error);
        setPhysioRecords((prev) => [res.data!, ...prev]);
        setSuccessMsg("Physiotherapy session recorded successfully");
      }
      setShowModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Activity className="h-7 w-7 text-sky-600" />
            Specialty Clinical Consoles
          </h1>
          <p className="text-sm text-slate-500">
            Dedicated Clinical Infrastructure for Dental, Ophthalmology & Physiotherapy
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <PlusCircle className="h-4 w-4" />
          New {activeTab === "dental" ? "Dental Exam" : activeTab === "eye" ? "Eye Exam" : "Physio Session"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("dental")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === "dental"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Smile className="h-4 w-4" />
          Dental Clinic
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("eye")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === "eye"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Eye className="h-4 w-4" />
          Ophthalmology / Eye Clinic
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("physio")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === "physio"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Activity className="h-4 w-4" />
          Physiotherapy & Rehab
        </button>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-xs">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab} records by patient code, name, or diagnosis...`}
          className="w-full text-xs text-slate-800 focus:outline-none"
        />
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            Loading specialty records...
          </div>
        ) : activeTab === "dental" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-bold">Exam Code</th>
                  <th className="py-3 px-4 font-bold">Patient</th>
                  <th className="py-3 px-4 font-bold">Tooth #</th>
                  <th className="py-3 px-4 font-bold">Chief Complaint</th>
                  <th className="py-3 px-4 font-bold">Diagnosis</th>
                  <th className="py-3 px-4 font-bold">Procedure</th>
                  <th className="py-3 px-4 font-bold text-right">Fee</th>
                  <th className="py-3 px-4 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dentalRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                      No dental records found. Click &quot;New Dental Exam&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  dentalRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-sky-600">{r.exam_code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {r.patients?.full_name || "Patient"} ({r.patients?.patient_code || "P-001"})
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{r.tooth_number || "—"}</td>
                      <td className="py-3 px-4">{r.chief_complaint}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{r.diagnosis}</td>
                      <td className="py-3 px-4 text-slate-600">{r.procedure_done || "Consultation"}</td>
                      <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700">
                        {formatCurrencyBDT(r.procedure_fee)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 uppercase">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === "eye" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-bold">Exam Code</th>
                  <th className="py-3 px-4 font-bold">Patient</th>
                  <th className="py-3 px-4 font-bold">Visual Acuity (OD / OS)</th>
                  <th className="py-3 px-4 font-bold">IOP (OD / OS)</th>
                  <th className="py-3 px-4 font-bold">Diagnosis</th>
                  <th className="py-3 px-4 font-bold">Procedure</th>
                  <th className="py-3 px-4 font-bold text-right">Fee</th>
                  <th className="py-3 px-4 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {eyeRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                      No eye examination records found. Click &quot;New Eye Exam&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  eyeRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-sky-600">{r.exam_code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {r.patients?.full_name || "Patient"} ({r.patients?.patient_code || "P-001"})
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {r.visual_acuity_od || "—"} / {r.visual_acuity_os || "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {r.intraocular_pressure_od ? `${r.intraocular_pressure_od} mmHg` : "—"} /{" "}
                        {r.intraocular_pressure_os ? `${r.intraocular_pressure_os} mmHg` : "—"}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{r.diagnosis}</td>
                      <td className="py-3 px-4 text-slate-600">{r.procedure_done || "Slit Lamp Eval"}</td>
                      <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700">
                        {formatCurrencyBDT(r.procedure_fee)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 uppercase">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-bold">Session Code</th>
                  <th className="py-3 px-4 font-bold">Patient</th>
                  <th className="py-3 px-4 font-bold">Pain Score (Pre / Post)</th>
                  <th className="py-3 px-4 font-bold">Session</th>
                  <th className="py-3 px-4 font-bold">Modalities Applied</th>
                  <th className="py-3 px-4 font-bold">Assessment Findings</th>
                  <th className="py-3 px-4 font-bold text-right">Fee</th>
                  <th className="py-3 px-4 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {physioRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                      No physiotherapy records found. Click &quot;New Physio Session&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  physioRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-sky-600">{r.session_code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {r.patients?.full_name || "Patient"} ({r.patients?.patient_code || "P-001"})
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-amber-600 font-bold">{r.pain_score_initial ?? "—"}/10</span> &rarr;{" "}
                        <span className="text-emerald-600 font-bold">{r.pain_score_post ?? "—"}/10</span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {r.session_number} / {r.total_sessions_prescribed}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {Array.isArray(r.modalities_applied) ? r.modalities_applied.join(", ") : "Manual Therapy"}
                      </td>
                      <td className="py-3 px-4">{r.assessment_findings}</td>
                      <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700">
                        {formatCurrencyBDT(r.session_fee)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 uppercase">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">
              New {activeTab === "dental" ? "Dental Examination" : activeTab === "eye" ? "Eye Examination" : "Physiotherapy Session"}
            </h2>

            <form onSubmit={handleCreateRecord} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Patient Identifier (UUID / ID)</label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000000000001"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {activeTab === "dental" ? (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Chief Complaint *</label>
                    <input
                      type="text"
                      required
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="e.g. Acute pain in lower left molar"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Tooth Number (FDI / Universal)</label>
                      <input
                        type="text"
                        value={toothNumber}
                        onChange={(e) => setToothNumber(e.target.value)}
                        placeholder="e.g. 36 (FDI) or #19"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Procedure Fee (BDT)</label>
                      <input
                        type="number"
                        min="0"
                        value={dentalFee}
                        onChange={(e) => setDentalFee(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Findings Checklist</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={caries} onChange={(e) => setCaries(e.target.checked)} />
                        <span>Dental Caries</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={gingivitis} onChange={(e) => setGingivitis(e.target.checked)} />
                        <span>Gingivitis</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={calculus} onChange={(e) => setCalculus(e.target.checked)} />
                        <span>Calculus / Plaque</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Diagnosis *</label>
                    <input
                      type="text"
                      required
                      value={dentalDiagnosis}
                      onChange={(e) => setDentalDiagnosis(e.target.value)}
                      placeholder="e.g. Irreversible Pulpitis"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Procedure Performed</label>
                    <input
                      type="text"
                      value={dentalProcedure}
                      onChange={(e) => setDentalProcedure(e.target.value)}
                      placeholder="e.g. Root Canal Treatment Step 1 & Dressing"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </>
              ) : activeTab === "eye" ? (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Chief Complaint *</label>
                    <input
                      type="text"
                      required
                      value={eyeComplaint}
                      onChange={(e) => setEyeComplaint(e.target.value)}
                      placeholder="e.g. Blurring of vision in both eyes"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Visual Acuity OD (Right)</label>
                      <input
                        type="text"
                        value={visualAcuityOd}
                        onChange={(e) => setVisualAcuityOd(e.target.value)}
                        placeholder="e.g. 6/6"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Visual Acuity OS (Left)</label>
                      <input
                        type="text"
                        value={visualAcuityOs}
                        onChange={(e) => setVisualAcuityOs(e.target.value)}
                        placeholder="e.g. 6/9"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">IOP OD (mmHg)</label>
                      <input
                        type="number"
                        value={iopOd}
                        onChange={(e) => setIopOd(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">IOP OS (mmHg)</label>
                      <input
                        type="number"
                        value={iopOs}
                        onChange={(e) => setIopOs(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Diagnosis *</label>
                    <input
                      type="text"
                      required
                      value={eyeDiagnosis}
                      onChange={(e) => setEyeDiagnosis(e.target.value)}
                      placeholder="e.g. Simple Myopia / Early Immature Cataract"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Procedure Done</label>
                      <input
                        type="text"
                        value={eyeProcedure}
                        onChange={(e) => setEyeProcedure(e.target.value)}
                        placeholder="e.g. Slit lamp examination"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Procedure Fee (BDT)</label>
                      <input
                        type="number"
                        min="0"
                        value={eyeFee}
                        onChange={(e) => setEyeFee(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Chief Complaint *</label>
                    <input
                      type="text"
                      required
                      value={physioComplaint}
                      onChange={(e) => setPhysioComplaint(e.target.value)}
                      placeholder="e.g. Chronic lower back pain radiating to left leg"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Initial Pain Score (0-10)</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={painInitial}
                        onChange={(e) => setPainInitial(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Post-Therapy Pain (0-10)</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={painPost}
                        onChange={(e) => setPainPost(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Assessment Findings *</label>
                    <textarea
                      required
                      rows={2}
                      value={physioAssessment}
                      onChange={(e) => setPhysioAssessment(e.target.value)}
                      placeholder="e.g. Lumbar spine restricted flexion, SLR positive at 45 deg"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Treatment Plan *</label>
                    <input
                      type="text"
                      required
                      value={physioPlan}
                      onChange={(e) => setPhysioPlan(e.target.value)}
                      placeholder="e.g. Lumbar traction + IFT 15 mins + Core strengthening"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Modalities Applied</label>
                    <div className="flex flex-wrap gap-3">
                      {["TENS", "Ultrasound", "Therapeutic Exercise", "Cervical Traction", "Hot Pack"].map((mod) => (
                        <label key={mod} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={modalities.includes(mod)}
                            onChange={(e) => {
                              if (e.target.checked) setModalities((prev) => [...prev, mod]);
                              else setModalities((prev) => prev.filter((m) => m !== mod));
                            }}
                          />
                          <span>{mod}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Session #</label>
                      <input
                        type="number"
                        min="1"
                        value={sessionNum}
                        onChange={(e) => setSessionNum(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Total Prescribed</label>
                      <input
                        type="number"
                        min="1"
                        value={totalSessions}
                        onChange={(e) => setTotalSessions(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Fee (BDT)</label>
                      <input
                        type="number"
                        min="0"
                        value={physioFee}
                        onChange={(e) => setPhysioFee(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
