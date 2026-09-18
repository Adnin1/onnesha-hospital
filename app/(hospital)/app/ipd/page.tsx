"use client";

import React, { useState, useEffect } from "react";
import {
  Bed,
  FileCheck,
  Printer,
  Plus,
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import {
  createIpdAdmissionAction,
  dischargePatientAction,
  transferPatientAction,
} from "@/lib/patient/actions";

interface InpatientRecord {
  id: string; // visit_id
  visit_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  phone: string;
  gender: string;
  age?: number | string;
  bed_id?: string;
  bed_number?: string;
  ward_name?: string;
  admitted_at: string;
  doctor_name: string;
  provisional_diagnosis: string;
  status: string;
}

interface AvailableBed {
  id: string;
  bed_number: string;
  ward_name: string;
  bed_type?: string;
  status: string;
}

export default function IPDAdmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [inpatients, setInpatients] = useState<InpatientRecord[]>([]);
  const [availableBeds, setAvailableBeds] = useState<AvailableBed[]>([]);
  const [selectedAdmission, setSelectedAdmission] = useState<InpatientRecord | null>(null);

  // Modals
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);

  // Form states
  const [admissionForm, setAdmissionForm] = useState({
    patientCodeOrId: "",
    provisionalDiagnosis: "",
    bedId: "",
  });

  const [transferForm, setTransferForm] = useState({
    toBedId: "",
    reason: "",
  });

  const [dischargeForm, setDischargeForm] = useState({
    dischargeType: "NORMAL" as "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED",
    finalDiagnosis: "",
    hospitalCourse: "",
    dischargeAdvice: "",
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();

        // 1. Fetch active IPD visits
        const { data: visitsData, error: vErr } = await supabase
          .from("patient_visits")
          .select(`
            id,
            visit_number,
            patient_id,
            chief_complaint,
            admitted_at,
            status,
            patients (
              id,
              patient_code,
              full_name,
              phone,
              gender
            ),
            bed_assignments (
              id,
              bed_id,
              status,
              beds (
                id,
                bed_number,
                wards (
                  name
                )
              )
            )
          `)
          .eq("visit_type", "IPD")
          .eq("status", "ACTIVE")
          .order("admitted_at", { ascending: false });

        if (!vErr && visitsData) {
          interface VisitItem {
            id: string;
            visit_number: string;
            patient_id: string;
            chief_complaint: string | null;
            admitted_at: string;
            status: string;
            patients: {
              id: string;
              patient_code: string;
              full_name: string;
              phone: string;
              gender: string;
            } | null;
            bed_assignments: Array<{
              id: string;
              bed_id: string;
              status: string;
              beds: {
                id: string;
                bed_number: string;
                wards: { name: string } | null;
              } | null;
            }> | null;
          }

          const mapped: InpatientRecord[] = (visitsData as unknown as VisitItem[]).map((v) => {
            const activeBedAssign = v.bed_assignments?.find((ba) => ba.status === "ACTIVE");
            return {
              id: v.id,
              visit_number: v.visit_number || "IPD-V",
              patient_id: v.patient_id,
              patient_name: v.patients?.full_name || "Unknown Patient",
              patient_code: v.patients?.patient_code || "P-PENDING",
              phone: v.patients?.phone || "",
              gender: v.patients?.gender || "OTHER",
              bed_id: activeBedAssign?.beds?.id,
              bed_number: activeBedAssign?.beds?.bed_number || "UNASSIGNED",
              ward_name: activeBedAssign?.beds?.wards?.name || "General IPD",
              admitted_at: v.admitted_at,
              doctor_name: "Attending Consultant",
              provisional_diagnosis: v.chief_complaint || "Acute Condition Requiring Inpatient Care",
              status: "ADMITTED",
            };
          });

          setInpatients(mapped);
          if (mapped.length > 0) {
            setSelectedAdmission((prev) => prev || mapped[0]);
          }
        }

        // 2. Fetch available beds
        const { data: bedsData } = await supabase
          .from("beds")
          .select(`
            id,
            bed_number,
            status,
            wards (
              name
            )
          `)
          .order("bed_number");

        if (bedsData) {
          interface BedItem {
            id: string;
            bed_number: string;
            status: string;
            wards: { name: string } | null;
          }
          const mappedBeds: AvailableBed[] = (bedsData as unknown as BedItem[]).map((b) => ({
            id: b.id,
            bed_number: b.bed_number,
            ward_name: b.wards?.name || "General Ward",
            status: b.status,
          }));
          setAvailableBeds(mappedBeds);
        }
      } catch {
        // Handled gracefully
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [refreshIndex]);

  const handlePrintDischarge = () => {
    window.print();
  };

  // Handle Admission Submission
  const handleAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const trimmedInput = admissionForm.patientCodeOrId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedInput);
      let pQuery = supabase.from("patients").select("id");
      if (isUuid) {
        pQuery = pQuery.eq("id", trimmedInput);
      } else {
        pQuery = pQuery.eq("patient_code", trimmedInput.replace(/[^a-zA-Z0-9_-]/g, ""));
      }
      const { data: patient } = await pQuery.maybeSingle();

      if (!patient) {
        setActionError("Patient not found. Please provide a valid Patient Code or ID.");
        setSubmitting(false);
        return;
      }

      const res = await createIpdAdmissionAction({
        patientId: patient.id,
        bedId: admissionForm.bedId || undefined,
        provisionalDiagnosis: admissionForm.provisionalDiagnosis,
      });

      if (!res.success) {
        setActionError(res.error || "Admission failed.");
      } else {
        setActionSuccess("Patient successfully admitted to IPD.");
        setShowAdmissionModal(false);
        setAdmissionForm({ patientCodeOrId: "", provisionalDiagnosis: "", bedId: "" });
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error admitting patient.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Transfer Submission
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setActionError(null);
    setSubmitting(true);

    try {
      const res = await transferPatientAction({
        visitId: selectedAdmission.id,
        patientId: selectedAdmission.patient_id,
        fromBedId: selectedAdmission.bed_id,
        toBedId: transferForm.toBedId,
        reason: transferForm.reason,
      });

      if (!res.success) {
        setActionError(res.error || "Transfer failed.");
      } else {
        setActionSuccess("Patient transferred successfully.");
        setShowTransferModal(false);
        setTransferForm({ toBedId: "", reason: "" });
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error executing transfer.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Discharge Submission
  const handleDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setActionError(null);
    setSubmitting(true);

    try {
      const res = await dischargePatientAction({
        visitId: selectedAdmission.id,
        dischargeType: dischargeForm.dischargeType,
        finalDiagnosis: dischargeForm.finalDiagnosis,
        hospitalCourse: dischargeForm.hospitalCourse,
        dischargeAdvice: dischargeForm.dischargeAdvice,
      });

      if (!res.success) {
        setActionError(res.error || "Discharge failed.");
      } else {
        setActionSuccess("Patient discharged successfully.");
        setShowDischargeModal(false);
        setDischargeForm({
          dischargeType: "NORMAL",
          finalDiagnosis: "",
          hospitalCourse: "",
          dischargeAdvice: "",
        });
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error discharging patient.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Inpatient Care & Hospital Rounds
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            IPD Inpatient Admissions & Discharge Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time bed allocations, inter-ward transfers, clinical rounds, and computer-generated discharge certificates.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setShowAdmissionModal(true);
            }}
            className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New IPD Admission
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="no-print p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="no-print p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 text-rose-600 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active IPD Inpatients List (5 cols) */}
        <div className="lg:col-span-5 space-y-4 no-print">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Currently Admitted Inpatients ({inpatients.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading active inpatients...</div>
            ) : inpatients.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Bed className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-700">No active inpatient admissions</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;New IPD Admission&quot; above to admit a patient.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inpatients.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedAdmission(b)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex justify-between items-center ${
                      selectedAdmission?.id === b.id
                        ? "border-sky-500 bg-sky-50/70"
                        : "border-slate-200 hover:border-sky-300 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {b.bed_number}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 uppercase">
                          Inpatient
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 mt-1">{b.patient_name}</p>
                      <p className="text-[10px] text-slate-500">
                        {b.ward_name} • Code: {b.patient_code}
                      </p>
                    </div>
                    <Bed className={`w-5 h-5 ${selectedAdmission?.id === b.id ? "text-sky-600" : "text-slate-400"}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Admission Card & Discharge Summary (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            {selectedAdmission ? (
              <>
                <div className="flex flex-wrap justify-between items-center pb-4 border-b border-slate-100 mb-4 gap-2 no-print">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Inpatient Admission: {selectedAdmission.patient_name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Visit: {selectedAdmission.visit_number} • Bed: {selectedAdmission.bed_number}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setActionError(null);
                        setShowTransferModal(true);
                      }}
                      className="inline-flex items-center bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                      Bed Transfer
                    </button>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setDischargeForm((prev) => ({
                          ...prev,
                          finalDiagnosis: selectedAdmission.provisional_diagnosis || "",
                        }));
                        setShowDischargeModal(true);
                      }}
                      className="inline-flex items-center bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                      Discharge
                    </button>
                    <button
                      onClick={handlePrintDischarge}
                      className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
                      Print
                    </button>
                  </div>
                </div>

                <div className="print-pad">
                  <HospitalPrintHeader
                    documentTitle="INPATIENT ADMISSION & CLINICAL SUMMARY"
                    documentNumber={selectedAdmission.visit_number}
                    dateStr={formatDateBDT(selectedAdmission.admitted_at)}
                  />

                  <div className="grid grid-cols-2 gap-4 text-xs py-3 border-y border-slate-200 my-4">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Patient Demographics</span>
                      <strong className="text-slate-900 text-sm">{selectedAdmission.patient_name}</strong>
                      <span className="block text-slate-600 font-mono text-[11px]">
                        ID: {selectedAdmission.patient_code} | Gender: {selectedAdmission.gender}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[10px]">Bed / Ward Location</span>
                      <strong className="text-slate-800">
                        {selectedAdmission.bed_number} ({selectedAdmission.ward_name})
                      </strong>
                      <span className="block text-slate-500 text-[11px]">
                        Admitted: {formatDateBDT(selectedAdmission.admitted_at)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 uppercase tracking-wide block mb-1">
                        Provisional / Admission Diagnosis:
                      </span>
                      <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 font-semibold">
                        {selectedAdmission.provisional_diagnosis}
                      </p>
                    </div>

                    <div>
                      <span className="font-bold text-slate-900 uppercase tracking-wide block mb-1">
                        Inpatient Care Plan & Ward Protocol:
                      </span>
                      <p className="text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                        Continuous vital signs monitoring every 4 hours. Daily medical officer rounds. Nursing intake/output chart maintenance. Medications administered as per consultant orders.
                      </p>
                    </div>
                  </div>

                  <HospitalPrintFooter />
                </div>
              </>
            ) : (
              <div className="py-24 text-center text-slate-400">
                Select an admitted inpatient from the list on the left to view clinical records.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New IPD Admission Modal */}
      {showAdmissionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">New IPD Admission</h3>
            <p className="text-xs text-slate-500">
              Admit a registered patient to an inpatient ward or cabin bed.
            </p>

            <form onSubmit={handleAdmissionSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Patient Code or ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. P-202609-00001"
                  value={admissionForm.patientCodeOrId}
                  onChange={(e) => setAdmissionForm({ ...admissionForm, patientCodeOrId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Select Ward / Bed
                </label>
                <select
                  value={admissionForm.bedId}
                  onChange={(e) => setAdmissionForm({ ...admissionForm, bedId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                >
                  <option value="">-- Assign Bed Later --</option>
                  {availableBeds.map((b) => (
                    <option key={b.id} value={b.id} disabled={b.status === "OCCUPIED"}>
                      {b.bed_number} ({b.ward_name}) - {b.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Provisional Diagnosis / Admission Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Clinical reason for admission..."
                  value={admissionForm.provisionalDiagnosis}
                  onChange={(e) => setAdmissionForm({ ...admissionForm, provisionalDiagnosis: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdmissionModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl"
                >
                  {submitting ? "Admitting..." : "Confirm Admission"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bed Transfer Modal */}
      {showTransferModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Bed / Ward Transfer</h3>
            <p className="text-xs text-slate-500">
              Transfer patient <strong>{selectedAdmission.patient_name}</strong> from bed <strong>{selectedAdmission.bed_number}</strong>.
            </p>

            <form onSubmit={handleTransferSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Destination Bed <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={transferForm.toBedId}
                  onChange={(e) => setTransferForm({ ...transferForm, toBedId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                >
                  <option value="">-- Choose Vacant Bed --</option>
                  {availableBeds
                    .filter((b) => b.id !== selectedAdmission.bed_id && b.status !== "OCCUPIED")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bed_number} ({b.ward_name})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Reason for Transfer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Clinical deterioration to ICU / Patient upgraded to cabin"
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl"
                >
                  {submitting ? "Transferring..." : "Complete Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discharge Summary Modal */}
      {showDischargeModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Prepare Inpatient Discharge</h3>
            <p className="text-xs text-slate-500">
              Mandatory clinical sign-off for discharging <strong>{selectedAdmission.patient_name}</strong>.
            </p>

            <form onSubmit={handleDischargeSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Discharge Disposition Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={dischargeForm.dischargeType}
                  onChange={(e) =>
                    setDischargeForm({
                      ...dischargeForm,
                      dischargeType: e.target.value as "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED",
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                >
                  <option value="NORMAL">Normal / Recovered</option>
                  <option value="DOR">Discharged on Request (DOR)</option>
                  <option value="LAMA">Left Against Medical Advice (LAMA)</option>
                  <option value="REFERRED">Referred to Higher Center</option>
                  <option value="DECEASED">Deceased / Expired</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Final Verified Diagnosis <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Primary confirmed diagnosis on discharge..."
                  value={dischargeForm.finalDiagnosis}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, finalDiagnosis: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Hospital Course & Summary of Treatment
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of procedures and clinical course during stay..."
                  value={dischargeForm.hospitalCourse}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, hospitalCourse: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Discharge Advice & Follow-Up Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Medication plan, activity advice, follow-up timeline..."
                  value={dischargeForm.dischargeAdvice}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeAdvice: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl"
                >
                  {submitting ? "Discharging..." : "Confirm & Discharge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
