"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  PlusCircle,
  Phone,
  Calendar,
  FileText,
  Activity,
  Receipt,
  Microscope,
  Bed,
  CheckCircle2,
  X,
  Printer,
  ChevronRight,
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { PatientMaster, TimelineEvent } from "@/types/clinical";
import { InvoiceRecord } from "@/types/billing";
import { PrescriptionRecord, DiagnosticOrderRecord } from "@/types/clinical-emr";
import {
  getPatientsAction,
  registerPatientAction,
  getPatient360Action,
} from "@/lib/patient/actions";
import { getInvoicesAction } from "@/lib/billing/actions";
import { getPrescriptionsAction } from "@/lib/prescriptions/actions";
import { getDiagnosticOrdersAction } from "@/lib/lab/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function PatientsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [activeTab, setActiveTab] = useState<"history" | "bills" | "lab" | "rx">("history");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Patient 360 sub-records
  const [subLoading, setSubLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [labOrders, setLabOrders] = useState<DiagnosticOrderRecord[]>([]);

  // New Patient Form State
  const [newFullName, setNewFullName] = useState("");
  const [newGuardian, setNewGuardian] = useState("");
  const [newRelation, setNewRelation] = useState("Father");
  const [newGender, setNewGender] = useState<"MALE" | "FEMALE" | "OTHER">("MALE");
  const [newBloodGroup, setNewBloodGroup] = useState("O+");
  const [newPhone, setNewPhone] = useState("");
  const [newNid, setNewNid] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newEmergencyName, setNewEmergencyName] = useState("");
  const [newEmergencyPhone, setNewEmergencyPhone] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await getPatientsAction();
      if (res.success && res.data) {
        setPatients(res.data.patients);
        if (res.data.patients.length > 0 && !selectedPatient) {
          selectPatient(res.data.patients[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = async (patient: PatientMaster) => {
    setSelectedPatient(patient);
    setSubLoading(true);
    try {
      const [p360, invRes, rxRes, labRes] = await Promise.all([
        getPatient360Action(patient.id),
        getInvoicesAction({ patientId: patient.id }),
        getPrescriptionsAction({ patientId: patient.id }),
        getDiagnosticOrdersAction({ patientId: patient.id }),
      ]);

      if (p360.success && p360.data) {
        setTimeline(p360.data.timeline || []);
      }
      if (invRes.success && invRes.data) {
        setInvoices(invRes.data.invoices || []);
      }
      if (rxRes.success && rxRes.data) {
        setPrescriptions(rxRes.data.prescriptions || []);
      }
      if (labRes.success && labRes.data) {
        setLabOrders(labRes.data.orders || []);
      }
    } catch {
      // ignore
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await getPatientsAction();
        if (isMounted && res.success && res.data) {
          setPatients(res.data.patients);
          if (res.data.patients.length > 0 && !selectedPatient) {
            const firstPat = res.data.patients[0];
            setSelectedPatient(firstPat);
            setSubLoading(true);
            const [p360, invRes, rxRes, labRes] = await Promise.all([
              getPatient360Action(firstPat.id),
              getInvoicesAction({ patientId: firstPat.id }),
              getPrescriptionsAction({ patientId: firstPat.id }),
              getDiagnosticOrdersAction({ patientId: firstPat.id }),
            ]);
            if (isMounted) {
              if (p360.success && p360.data) setTimeline(p360.data.timeline || []);
              if (invRes.success && invRes.data) setInvoices(invRes.data.invoices || []);
              if (rxRes.success && rxRes.data) setPrescriptions(rxRes.data.prescriptions || []);
              if (labRes.success && labRes.data) setLabOrders(labRes.data.orders || []);
            }
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) {
          setLoading(false);
          setSubLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [selectedPatient]);

  const handleRegisterPatient = async (e: React.FormEvent, bypass = false) => {
    e.preventDefault();
    setRegisterLoading(true);
    setDuplicateWarning(null);

    try {
      const res = await registerPatientAction({
        fullName: newFullName,
        phone: newPhone,
        gender: newGender,
        bloodGroup: newBloodGroup,
        nid: newNid || undefined,
        address: newAddress,
        emergencyName: newEmergencyName || undefined,
        emergencyPhone: newEmergencyPhone || undefined,
        emergencyRelation: newRelation,
        bypassDuplicateWarning: bypass,
      });

      if (!res.success) {
        if (res.duplicateWarning?.hasDuplicate && !bypass) {
          setDuplicateWarning(
            `Potential duplicate detected (${res.duplicateWarning.confidence} confidence): ${res.duplicateWarning.reasons.join(", ")}`
          );
          setRegisterLoading(false);
          return;
        }
        alert(res.error || "Registration failed.");
        setRegisterLoading(false);
        return;
      }

      if (res.data?.patient) {
        const created = res.data.patient;
        setPatients([created, ...patients]);
        selectPatient(created);
        setIsRegisterModalOpen(false);
        setNewFullName("");
        setNewPhone("");
        setNewAddress("");
        setNewNid("");
      }
    } catch {
      alert("Error saving patient registration");
    } finally {
      setRegisterLoading(false);
    }
  };

  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.patient_code.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Patient Identity, Registration & Medical Archive
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Patient 360° Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralized EMR with lifelong patient IDs, multi-signal duplicate prevention, and linked clinical encounters.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadPatients}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh patient list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Register New Patient
          </button>
        </div>
      </div>

      {/* Main Grid: Left Directory (4 cols), Right 360 (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PATIENT LIST */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient ID, name, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs flex justify-center items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2 text-sky-600" />
                Loading patient directory...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No patients found matching your search.
              </div>
            ) : (
              filteredPatients.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => selectPatient(p)}
                    className={`p-4 cursor-pointer transition flex justify-between items-center ${
                      isSelected ? "bg-sky-50/80 font-medium" : "hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-sky-900">
                          {p.patient_code}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{p.full_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ph: {p.phone} • {p.gender} • Blood: {p.blood_group || "N/A"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 360 DOSSIER */}
        <div className="lg:col-span-7 space-y-4">
          {selectedPatient ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Header profile summary */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {selectedPatient.patient_code}
                    </span>
                    <h2 className="text-lg font-black text-slate-900">{selectedPatient.full_name}</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Phone: {selectedPatient.phone} • Address: {selectedPatient.address || "Dhaka, Bangladesh"}
                  </p>
                </div>

                <Link
                  href={`/app/patients/${selectedPatient.id}`}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition flex items-center shadow-xs"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  Full Patient 360 File
                </Link>
              </div>

              {/* TABS */}
              <div className="flex border-b border-slate-200 text-xs font-bold space-x-4">
                <button
                  onClick={() => setActiveTab("history")}
                  className={`pb-2 transition ${
                    activeTab === "history"
                      ? "border-b-2 border-sky-600 text-sky-600"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Encounters & History ({timeline.length})
                </button>
                <button
                  onClick={() => setActiveTab("bills")}
                  className={`pb-2 transition ${
                    activeTab === "bills"
                      ? "border-b-2 border-sky-600 text-sky-600"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Invoices ({invoices.length})
                </button>
                <button
                  onClick={() => setActiveTab("lab")}
                  className={`pb-2 transition ${
                    activeTab === "lab"
                      ? "border-b-2 border-sky-600 text-sky-600"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Diagnostics ({labOrders.length})
                </button>
                <button
                  onClick={() => setActiveTab("rx")}
                  className={`pb-2 transition ${
                    activeTab === "rx"
                      ? "border-b-2 border-sky-600 text-sky-600"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Prescriptions ({prescriptions.length})
                </button>
              </div>

              {/* TAB CONTENT */}
              {subLoading ? (
                <div className="p-8 text-center text-slate-500 text-xs flex justify-center items-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-2 text-sky-600" />
                  Loading patient records...
                </div>
              ) : (
                <div>
                  {activeTab === "history" && (
                    <div className="space-y-3">
                      {timeline.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4">No recorded encounters yet.</p>
                      ) : (
                        timeline.map((ev, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs space-y-1"
                          >
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>{ev.title}</span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {new Date(ev.date).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px]">{ev.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "bills" && (
                    <div className="space-y-3">
                      {invoices.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4">No invoices on file.</p>
                      ) : (
                        invoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs"
                          >
                            <div>
                              <span className="font-mono font-bold text-slate-900">{inv.invoice_number}</span>
                              <span
                                className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.status === "PAID"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {inv.status}
                              </span>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {formatDateBDT(inv.created_at)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-900 block">
                                {formatCurrencyBDT(inv.grand_total)}
                              </span>
                              {inv.due_amount > 0 && (
                                <span className="font-mono text-rose-600 text-[10px] font-bold block">
                                  Due: {formatCurrencyBDT(inv.due_amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "lab" && (
                    <div className="space-y-3">
                      {labOrders.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4">No diagnostic test orders on file.</p>
                      ) : (
                        labOrders.map((ord) => (
                          <div key={ord.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                            <div className="flex justify-between font-bold">
                              <span className="font-mono text-sky-800">{ord.order_number}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 uppercase">
                                {ord.status}
                              </span>
                            </div>
                            <p className="text-slate-600 font-medium">
                              Sample Barcode: <span className="font-mono">{ord.sample_barcode || "Pending"}</span>
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "rx" && (
                    <div className="space-y-3">
                      {prescriptions.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4">No digital prescriptions issued yet.</p>
                      ) : (
                        prescriptions.map((rx) => (
                          <div key={rx.id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>Diagnosis: {rx.diagnosis}</span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {formatDateBDT(rx.created_at)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">
                              Doctor: {rx.doctor?.full_name || "Specialist"} ({rx.doctor?.specialization || "OPD"})
                            </p>
                            {rx.items && rx.items.length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-slate-100">
                                {rx.items.map((it, idx) => (
                                  <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                                    <span>
                                      {it.medicine_name} ({it.dosage_pattern})
                                    </span>
                                    <span className="font-medium text-slate-500">{it.duration}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Select a patient from the left column to view their complete 360° health record.
            </div>
          )}
        </div>
      </div>

      {/* REGISTRATION MODAL */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  New Patient Registration (OH-ID Generator)
                </h3>
                <p className="text-xs text-slate-500">
                  Creates permanent electronic medical record (EMR) with lifelong patient ID.
                </p>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {duplicateWarning && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl mb-4 text-amber-900 space-y-2">
                <div className="flex items-center space-x-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Duplicate Patient Advisory</span>
                </div>
                <p className="text-[11px]">{duplicateWarning}</p>
                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={(e) => handleRegisterPatient(e, true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs"
                  >
                    Bypass & Register Anyway (e.g. Family Phone Sharing)
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleRegisterPatient} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Md. Shahidul Alam"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Primary Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="017XXXXXXXX"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender *</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as "MALE" | "FEMALE" | "OTHER")}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={newBloodGroup}
                    onChange={(e) => setNewBloodGroup(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NID / Birth Cert</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={newNid}
                    onChange={(e) => setNewNid(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street / Village, Thana, District"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerLoading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {registerLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
