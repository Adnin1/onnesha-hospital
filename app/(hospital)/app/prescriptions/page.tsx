"use client";

import React, { useState, useEffect } from "react";
import {
  Printer,
  Plus,
  Trash2,
  X,
  FileText,
  Calendar,
} from "lucide-react";
import { PrescriptionRecord } from "@/types/clinical-emr";
import { DoctorRecord } from "@/types/appointments";
import { PatientMaster } from "@/types/clinical";
import { getPrescriptionsAction, createPrescriptionAction } from "@/lib/prescriptions/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [selectedRx, setSelectedRx] = useState<PrescriptionRecord | null>(null);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Rx form state
  const [doctorId, setDoctorId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [complaints, setComplaints] = useState("");
  const [findings, setFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [meds, setMeds] = useState<Array<{ name: string; dosage: string; duration: string; instruction: string }>>([
    { name: "", dosage: "1+0+1", duration: "7 days", instruction: "After meal" },
  ]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      const [rxRes, docRes, patRes] = await Promise.all([
        getPrescriptionsAction(),
        getDoctorsAction(),
        searchPatientsAction({ pageSize: 50 }),
      ]);

      if (mounted) {
        if (rxRes.success && rxRes.data?.prescriptions) {
          setPrescriptions(rxRes.data.prescriptions);
          if (rxRes.data.prescriptions.length > 0) {
            setSelectedRx(rxRes.data.prescriptions[0]);
          }
        }
        if (docRes.success && docRes.data?.doctors) {
          setDoctors(docRes.data.doctors);
          if (docRes.data.doctors.length > 0) setDoctorId(docRes.data.doctors[0].id);
        }
        if (patRes.success && patRes.data?.patients) {
          setPatients(patRes.data.patients);
          if (patRes.data.patients.length > 0) setPatientId(patRes.data.patients[0].id);
        }
        setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAddMedRow = () => {
    setMeds([...meds, { name: "", dosage: "1+0+1", duration: "7 days", instruction: "After meal" }]);
  };

  const handleRemoveMedRow = (idx: number) => {
    if (meds.length > 1) {
      setMeds(meds.filter((_, i) => i !== idx));
    }
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !patientId || !diagnosis.trim()) {
      alert("Please fill in doctor, patient, and clinical diagnosis.");
      return;
    }

    const validItems = meds
      .filter((m) => m.name.trim().length > 0)
      .map((m) => ({
        medicineName: m.name.trim(),
        dosagePattern: m.dosage,
        duration: m.duration,
        mealInstruction: m.instruction,
      }));

    if (validItems.length === 0) {
      alert("Please enter at least one medicine.");
      return;
    }

    setSubmitting(true);
    const res = await createPrescriptionAction({
      doctorId,
      patientId,
      chiefComplaints: complaints || undefined,
      clinicalFindings: findings || undefined,
      diagnosis: diagnosis.trim(),
      generalAdvice: advice || undefined,
      followupDate: followupDate || undefined,
      items: validItems,
    });

    setSubmitting(false);

    if (res.success && res.data?.prescription) {
      const newRx = res.data.prescription;
      setPrescriptions([newRx, ...prescriptions]);
      setSelectedRx(newRx);
      setIsModalOpen(false);
      setComplaints("");
      setFindings("");
      setDiagnosis("");
      setAdvice("");
      setFollowupDate("");
      setMeds([{ name: "", dosage: "1+0+1", duration: "7 days", instruction: "After meal" }]);
    } else {
      alert(res.error || "Failed to create prescription");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Clinical Documentation & EMR
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Digital Prescription Pad (Rx)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Structured diagnosis, dosage intervals (1+0+1), dietary advice, and verified medical pad printing.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Prescription
          </button>
          <button
            onClick={handlePrint}
            disabled={!selectedRx}
            className="inline-flex items-center bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print Rx Pad
          </button>
        </div>
      </div>

      {/* Selector Strip if multiple exist */}
      {prescriptions.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center space-x-3 no-print overflow-x-auto">
          <span className="text-xs font-bold text-slate-700 shrink-0">Recent Prescriptions:</span>
          {prescriptions.slice(0, 8).map((rx) => (
            <button
              key={rx.id}
              onClick={() => setSelectedRx(rx)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                selectedRx?.id === rx.id
                  ? "bg-sky-600 text-white font-bold"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {rx.patient?.full_name || "Patient"} ({rx.created_at.split("T")[0]})
            </button>
          ))}
        </div>
      )}

      {/* Official Prescription Pad Document */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-xs text-slate-400">
          Loading prescriptions...
        </div>
      ) : !selectedRx ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-500 no-print">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">No prescriptions issued yet</p>
          <p className="text-xs mt-1">Click &quot;New Prescription&quot; to generate your first E-Rx pad.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs max-w-4xl mx-auto print-pad">
          <HospitalPrintHeader
            documentTitle="MEDICAL PRESCRIPTION"
            documentNumber={`RX-${selectedRx.id.slice(0, 8).toUpperCase()}`}
            dateStr={selectedRx.created_at.split("T")[0]}
          />

          {/* Doctor & Patient Information Strip */}
          <div className="flex flex-col sm:flex-row justify-between pb-4 border-b border-slate-200 text-xs gap-4">
            <div>
              <h3 className="font-bold text-sm text-sky-900">{selectedRx.doctor?.full_name || "Doctor"}</h3>
              <p className="text-slate-600">{selectedRx.doctor?.designation} • {selectedRx.doctor?.degrees}</p>
              <p className="text-slate-500">BMDC Reg: {selectedRx.doctor?.bmdc_reg_number} • Room: {selectedRx.doctor?.room_number}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-slate-700 font-semibold">
                Patient: <strong className="text-slate-900">{selectedRx.patient?.full_name}</strong>
              </p>
              <p className="text-slate-500">
                Code: {selectedRx.patient?.patient_code} • {selectedRx.patient?.gender} • Phone: {selectedRx.patient?.phone}
              </p>
            </div>
          </div>

          {/* Main Rx Body */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 my-6">
            {/* Left Column: Complaints & Diagnosis (4 cols) */}
            <div className="md:col-span-4 border-r border-slate-200 pr-4 space-y-6 text-xs">
              {selectedRx.chief_complaints && (
                <div>
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2 text-[11px]">
                    Chief Complaints:
                  </h4>
                  <p className="text-slate-700 whitespace-pre-line">{selectedRx.chief_complaints}</p>
                </div>
              )}

              {selectedRx.clinical_findings && (
                <div>
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2 text-[11px]">
                    Clinical Findings:
                  </h4>
                  <p className="text-slate-700 whitespace-pre-line">{selectedRx.clinical_findings}</p>
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2 text-[11px]">
                  Clinical Diagnosis:
                </h4>
                <div className="p-2 bg-sky-50 text-sky-900 rounded-lg font-semibold border border-sky-100">
                  {selectedRx.diagnosis}
                </div>
              </div>
            </div>

            {/* Right Column: Rx Medicines & Dosages (8 cols) */}
            <div className="md:col-span-8 space-y-4">
              <div className="flex items-center space-x-2 text-2xl font-black font-serif text-sky-900">
                <span>℞</span>
              </div>

              <div className="space-y-4">
                {(selectedRx.items || []).map((med, idx) => (
                  <div key={idx} className="pb-3 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div className="text-xs font-bold text-slate-900">
                        {idx + 1}. {med.medicine_name} {med.generic_name ? `(${med.generic_name})` : ""}
                      </div>
                      <span className="font-mono font-bold text-xs text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        {med.dosage_pattern}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 flex space-x-3">
                      <span>{med.meal_instruction || "After meal"}</span>
                      <span>•</span>
                      <span className="font-medium text-slate-800">Duration: {med.duration}</span>
                      {med.special_notes && <span>• {med.special_notes}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Advice & Next Visit */}
              <div className="mt-8 pt-4 border-t border-slate-200 text-xs space-y-2">
                {selectedRx.general_advice && (
                  <p>
                    <strong className="text-slate-900">General Advice:</strong> {selectedRx.general_advice}
                  </p>
                )}
                {selectedRx.followup_date && (
                  <p className="text-sky-900 font-semibold">
                    Follow-up Visit Date: {selectedRx.followup_date}
                  </p>
                )}
              </div>
            </div>
          </div>

          <HospitalPrintFooter />
        </div>
      )}

      {/* NEW PRESCRIPTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in no-print">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Create Electronic Prescription (E-Rx)
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Issue formal digital prescription with structured medication dosages.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePrescription} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Consulting Doctor *
                  </label>
                  <select
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                    required
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} ({d.specialization})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Patient *
                  </label>
                  <select
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                    required
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_code} - {p.full_name} ({p.phone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Primary Clinical Diagnosis *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acute Bronchitis / Type 2 Diabetes"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chief Complaints
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Cough with fever for 4 days"
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Clinical Examination Findings
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Bilateral rhonchi present"
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              {/* Medicines Section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-bold text-slate-900 text-xs">
                    Prescribed Medicines (℞)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddMedRow}
                    className="text-xs font-bold text-sky-600 hover:text-sky-700 inline-flex items-center"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Medicine
                  </button>
                </div>

                <div className="space-y-2">
                  {meds.map((m, idx) => (
                    <div key={idx} className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        placeholder="Medicine name (e.g. Tab Napa 500mg)"
                        value={m.name}
                        onChange={(e) => {
                          const updated = [...meds];
                          updated[idx].name = e.target.value;
                          setMeds(updated);
                        }}
                        className="flex-1 p-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                        required
                      />
                      <input
                        type="text"
                        placeholder="1+0+1"
                        value={m.dosage}
                        onChange={(e) => {
                          const updated = [...meds];
                          updated[idx].dosage = e.target.value;
                          setMeds(updated);
                        }}
                        className="w-20 p-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center font-mono"
                      />
                      <input
                        type="text"
                        placeholder="7 days"
                        value={m.duration}
                        onChange={(e) => {
                          const updated = [...meds];
                          updated[idx].duration = e.target.value;
                          setMeds(updated);
                        }}
                        className="w-24 p-1.5 text-xs border border-slate-200 rounded-lg bg-white text-center"
                      />
                      {meds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMedRow(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Dietary / General Advice
                  </label>
                  <input
                    type="text"
                    placeholder="Drink plenty of fluids, complete bed rest"
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Follow-up Date
                  </label>
                  <input
                    type="date"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm"
                >
                  {submitting ? "Saving Rx..." : "Save & Generate Prescription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

