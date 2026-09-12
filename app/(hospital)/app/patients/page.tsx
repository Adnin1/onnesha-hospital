"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { MOCK_PATIENTS, MOCK_INVOICES, MOCK_LAB_ORDERS, MOCK_PRESCRIPTION } from "@/lib/mock-data";
import { Patient } from "@/types";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function PatientsManagementPage() {
  const [patients, setPatients] = useState<Patient[]>(MOCK_PATIENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(MOCK_PATIENTS[0]);
  const [activeTab, setActiveTab] = useState<"history" | "bills" | "lab" | "rx">("history");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // New Patient Form State
  const [newFullName, setNewFullName] = useState("");
  const [newGuardian, setNewGuardian] = useState("");
  const [newRelation, setNewRelation] = useState("Father");
  const [newGender, setNewGender] = useState<"male" | "female" | "other">("male");
  const [newAge, setNewAge] = useState("30");
  const [newBloodGroup, setNewBloodGroup] = useState<Patient["blood_group"]>("O+");
  const [newPhone, setNewPhone] = useState("");
  const [newNid, setNewNid] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newEmergencyName, setNewEmergencyName] = useState("");
  const [newEmergencyPhone, setNewEmergencyPhone] = useState("");

  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.patient_id.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  });

  const handleRegisterPatient = (e: React.FormEvent) => {
    e.preventDefault();
    const nextNum = patients.length + 105;
    const newId = `OH-${String(nextNum).padStart(6, "0")}`;

    const newPatientObj: Patient = {
      id: `pat-${Date.now()}`,
      organization_id: "a0000000-0000-0000-0000-000000000001",
      patient_id: newId,
      full_name: newFullName,
      guardian_name: newGuardian,
      relationship_with_guardian: newRelation,
      gender: newGender,
      age: parseInt(newAge) || 25,
      blood_group: newBloodGroup,
      phone: newPhone,
      nid_or_birth_cert: newNid,
      address: newAddress,
      emergency_contact_name: newEmergencyName,
      emergency_contact_phone: newEmergencyPhone,
      created_at: new Date().toISOString(),
    };

    setPatients([newPatientObj, ...patients]);
    setSelectedPatient(newPatientObj);
    setIsRegisterModalOpen(false);

    // Reset Form
    setNewFullName("");
    setNewPhone("");
    setNewAddress("");
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Patient Health Records & Registry
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Patient Management & 360° History
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Auto-formatted OH-IDs, lifelong visit trails, prescriptions, lab results, and financial invoices.
          </p>
        </div>

        <button
          onClick={() => setIsRegisterModalOpen(true)}
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Register New Patient (OH-ID)
        </button>
      </div>

      {/* Main Dual-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Search & Patient List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            {/* Search Box */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by OH-ID, Name, or Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
              />
            </div>

            {/* Patients List */}
            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto pr-1">
              {filteredPatients.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className={`p-3.5 rounded-xl cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? "bg-sky-50/80 border border-sky-300 shadow-2xs"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-sky-800 bg-sky-100/70 px-1.5 py-0.5 rounded">
                          {p.patient_id}
                        </span>
                        <h4 className="font-bold text-xs text-slate-900">{p.full_name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                        <Phone className="w-3 h-3 mr-1 text-slate-400" />
                        {p.phone} • {p.age} Y / {p.gender.toUpperCase()}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        {p.blood_group || "N/A"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 ml-auto mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: 360° Comprehensive Profile & Tabs (7 cols) */}
        <div className="lg:col-span-7">
          {selectedPatient ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Profile Header Banner */}
              <div className="p-6 bg-gradient-to-r from-sky-900 to-slate-800 text-white flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs bg-sky-600/60 px-2 py-0.5 rounded border border-sky-400/40">
                      {selectedPatient.patient_id}
                    </span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded">
                      Active Patient
                    </span>
                  </div>
                  <h2 className="text-xl font-black mt-1">{selectedPatient.full_name}</h2>
                  <p className="text-xs text-sky-200 mt-0.5">
                    Guardian: {selectedPatient.guardian_name || "N/A"} ({selectedPatient.relationship_with_guardian || "Guardian"})
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {selectedPatient.blood_group || "Unknown"}
                  </div>
                  <span className="text-[10px] text-slate-300 uppercase tracking-wider">
                    Blood Group
                  </span>
                </div>
              </div>

              {/* Profile Quick Grid */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Age / Gender</span>
                  <span className="font-bold text-slate-800">
                    {selectedPatient.age} Y / {selectedPatient.gender.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Primary Phone</span>
                  <span className="font-bold text-slate-800">{selectedPatient.phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Emergency Contact</span>
                  <span className="font-bold text-slate-800">
                    {selectedPatient.emergency_contact_phone || "Not Specified"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">NID / Reg No</span>
                  <span className="font-mono font-medium text-slate-800 truncate block">
                    {selectedPatient.nid_or_birth_cert || "N/A"}
                  </span>
                </div>
                <div className="sm:col-span-4 text-[11px] text-slate-600">
                  <strong className="text-slate-700">Permanent Address:</strong> {selectedPatient.address}
                </div>
              </div>

              {/* 360° Tabs Navigation */}
              <div className="flex border-b border-slate-200 bg-white px-6">
                {[
                  { id: "history", label: "Visits & OPD/IPD", icon: Activity },
                  { id: "bills", label: "Invoices & Dues", icon: Receipt },
                  { id: "lab", label: "Lab Reports", icon: Microscope },
                  { id: "rx", label: "Prescriptions", icon: FileText },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as "history" | "bills" | "lab" | "rx")}
                      className={`flex items-center py-3 px-4 border-b-2 font-semibold text-xs transition ${
                        isActive
                          ? "border-sky-600 text-sky-700 font-bold"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mr-1.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Contents */}
              <div className="p-6">
                {/* TAB 1: VISITS & OPD/IPD */}
                {activeTab === "history" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-sky-900">
                          OPD Consultation Visit
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          12 Sep 2026 • 05:30 PM
                        </span>
                      </div>
                      <p className="text-xs text-slate-700">
                        <strong>Doctor:</strong> Prof. Dr. M. A. Rahman (General Medicine)
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">
                        <strong>Chief Complaint:</strong> Generalized fatigue & high blood sugar.
                      </p>
                      <div className="mt-2 flex items-center space-x-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Visit Completed
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          Token: A-012
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: INVOICES & BILLS */}
                {activeTab === "bills" && (
                  <div className="space-y-3">
                    {MOCK_INVOICES.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white flex justify-between items-center"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {inv.invoice_number}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                inv.payment_status === "paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {inv.payment_status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Paid via: {inv.payment_method?.toUpperCase()} • Cashier: {inv.created_by_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-slate-900 block">
                            {formatCurrencyBDT(inv.total_amount)}
                          </span>
                          {inv.due_amount > 0 && (
                            <span className="text-[10px] font-semibold text-rose-600 block">
                              Due: {formatCurrencyBDT(inv.due_amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: LAB REPORTS */}
                {activeTab === "lab" && (
                  <div className="space-y-3">
                    {MOCK_LAB_ORDERS.map((order) => (
                      <div
                        key={order.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white"
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-2">
                          <span className="font-mono font-bold text-xs text-sky-900">
                            Order #{order.order_number}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                            {order.status}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs">
                          {order.tests.map((t, idx) => (
                            <div key={idx} className="flex justify-between text-slate-700 py-1">
                              <span>{t.test_name}</span>
                              <span className="font-semibold text-slate-900">
                                {t.result_value || "In Process"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 4: PRESCRIPTION */}
                {activeTab === "rx" && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
                      <div>
                        <span className="font-mono font-bold text-xs text-sky-900">
                          {MOCK_PRESCRIPTION.prescription_number}
                        </span>
                        <p className="text-[11px] text-slate-600">
                          By: {MOCK_PRESCRIPTION.doctor_name}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {MOCK_PRESCRIPTION.date}
                      </span>
                    </div>

                    <div className="text-xs space-y-2">
                      <p>
                        <strong>Diagnosis:</strong> {MOCK_PRESCRIPTION.diagnosis.join(", ")}
                      </p>
                      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                        {MOCK_PRESCRIPTION.medicines.map((m, idx) => (
                          <div key={idx} className="p-2 bg-slate-50 rounded-lg flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-slate-900">{m.name}</p>
                              <p className="text-[10px] text-slate-500">{m.instruction} • {m.duration}</p>
                            </div>
                            <span className="font-mono font-bold text-sky-800">{m.dosage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
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

            <form onSubmit={handleRegisterPatient} className="space-y-4 text-xs">
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
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
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
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Age (Years) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="120"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as "male" | "female" | "other")}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={newBloodGroup}
                    onChange={(e) => setNewBloodGroup(e.target.value as Patient["blood_group"])}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NID / Birth Certificate No
                  </label>
                  <input
                    type="text"
                    placeholder="National ID"
                    value={newNid}
                    onChange={(e) => setNewNid(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Father / Husband / Guardian Name
                  </label>
                  <input
                    type="text"
                    placeholder="Guardian Name"
                    value={newGuardian}
                    onChange={(e) => setNewGuardian(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="Emergency Phone"
                    value={newEmergencyPhone}
                    onChange={(e) => setNewEmergencyPhone(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Full Address *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Village / House / Road / District"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                  ></textarea>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Register & Assign Patient ID
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
