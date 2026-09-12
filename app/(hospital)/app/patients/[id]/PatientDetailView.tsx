"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  AlertTriangle,
  ShieldAlert,
  Activity,
  FileText,
  Clock,
  Printer,
  HeartPulse,
  Stethoscope,
  Building,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Tag,
  Share2,
} from "lucide-react";
import { getPatient360Action } from "@/lib/patient/actions";
import {
  PatientMaster,
  PatientAllergy,
  ClinicalAlert,
  PatientVisit,
  TimelineEvent,
  VitalSigns,
  PatientDiagnosis,
  ClinicalNote,
} from "@/types/clinical";
import { formatBDPhoneDisplay } from "@/lib/patient/phone";
import { formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function PatientDetailView({ patientId }: { patientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [patient, setPatient] = useState<PatientMaster | null>(null);
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [alerts, setAlerts] = useState<ClinicalAlert[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [vitals, setVitals] = useState<VitalSigns[]>([]);
  const [diagnoses, setDiagnoses] = useState<PatientDiagnosis[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);

  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "visits" | "vitals" | "diagnoses" | "notes">("overview");

  useEffect(() => {
    async function loadData() {
      if (patientId === "preview") {
        setPatient({
          id: "preview-id",
          organization_id: "preview-org",
          patient_code: "OH-000101",
          full_name: "Md. Rafiqul Islam",
          phone: "01712345678",
          normalized_phone: "01712345678",
          gender: "MALE",
          dob: "1985-06-15",
          blood_group: "B+",
          marital_status: "MARRIED",
          nid: "19851234567890",
          address: "House 45, Road 7, Dhanmondi, Dhaka",
          emergency_contact_name: "Nasima Begum",
          emergency_contact_phone: "01812345678",
          emergency_contact_relation: "Spouse",
          is_temporary: false,
          is_deceased: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setAllergies([
          {
            id: "al-1",
            organization_id: "preview-org",
            patient_id: "preview-id",
            allergen: "Penicillin",
            reaction: "Anaphylaxis / Skin Urticaria",
            severity: "SEVERE",
            status: "ACTIVE",
            recorded_at: new Date().toISOString(),
          },
        ]);
        setAlerts([
          {
            id: "alt-1",
            organization_id: "preview-org",
            patient_id: "preview-id",
            alert_type: "FALL_RISK",
            severity: "MEDIUM",
            message: "Patient prone to dizziness upon standing",
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ]);
        setTimeline([
          {
            id: "tl-1",
            date: new Date().toISOString(),
            type: "PATIENT_REGISTERED",
            title: "Patient Registered (OH-000101)",
            description: "Permanent EMR created in Onnesha Hospital Management System.",
            performer: "Reception Desk",
            metadata: { code: "OH-000101" },
          },
        ]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await getPatient360Action(patientId);
        if (res.success && res.data) {
          setPatient(res.data.patient);
          setAllergies(res.data.allergies);
          setAlerts(res.data.alerts);
          setVisits(res.data.visits);
          setTimeline(res.data.timeline);
          setVitals(res.data.vitals);
          setDiagnoses(res.data.diagnoses);
          setNotes(res.data.notes);
        } else {
          setError(res.error || "Failed to load patient record.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error connecting to clinical database.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [patientId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Retrieving verified Patient 360° medical record...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-rose-200 shadow-sm text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Patient Record Unavailable</h2>
        <p className="text-xs text-slate-600 mt-1">{error || "The requested patient record could not be found."}</p>
        <Link
          href="/app/patients"
          className="inline-flex items-center mt-5 text-xs font-semibold text-sky-600 hover:text-sky-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Patient Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action & Navigation Bar */}
      <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <Link
          href="/app/patients"
          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-sky-600 transition"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Patient Directory
        </Link>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs transition"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Print Full Medical Profile
          </button>
        </div>
      </div>

      {/* Patient Master Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-black bg-sky-500/30 text-sky-200 px-2.5 py-1 rounded-lg border border-sky-400/40">
                {patient.patient_code}
              </span>
              {patient.is_temporary && (
                <span className="text-[10px] font-bold uppercase bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded border border-amber-400/40">
                  Temporary Emergency Profile
                </span>
              )}
              {patient.is_deceased ? (
                <span className="text-[10px] font-bold uppercase bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded border border-rose-400/40">
                  Deceased
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/30">
                  Active Patient
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{patient.full_name}</h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-sky-200">
              <span>
                <strong>Gender:</strong> {patient.gender}
              </span>
              <span>•</span>
              <span>
                <strong>Phone:</strong> {formatBDPhoneDisplay(patient.phone)}
              </span>
              {patient.dob && (
                <>
                  <span>•</span>
                  <span>
                    <strong>DOB:</strong> {formatDateBDT(patient.dob)}
                  </span>
                </>
              )}
              {patient.nid && (
                <>
                  <span>•</span>
                  <span>
                    <strong>NID:</strong> {patient.nid}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 bg-white/10 p-4 rounded-xl backdrop-blur-xs border border-white/15">
            <div className="text-center px-2">
              <span className="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                Blood Group
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-rose-400">
                {patient.blood_group || "Unknown"}
              </span>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center px-2">
              <span className="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                Encounters
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-sky-300">
                {visits.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Safety Banners: Allergies & Clinical Alerts */}
      {(allergies.length > 0 || alerts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allergies.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-2xs flex items-start space-x-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                  Active Known Allergies ({allergies.length})
                </h4>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {allergies.map((al) => (
                    <span
                      key={al.id}
                      className="text-[11px] font-semibold bg-rose-100/80 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-md"
                    >
                      {al.allergen} ({al.severity})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {alerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-2xs flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  Clinical Alerts ({alerts.length})
                </h4>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {alerts.map((alt) => (
                    <span
                      key={alt.id}
                      className="text-[11px] font-medium bg-amber-100/80 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md"
                    >
                      {alt.alert_type}: {alt.message}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="no-print border-b border-slate-200 flex space-x-2 overflow-x-auto bg-white p-2 rounded-2xl shadow-xs">
        {[
          { id: "overview", label: "Patient Demographics", icon: User },
          { id: "timeline", label: "Lifelong Clinical Timeline", icon: Clock },
          { id: "visits", label: `Visits & Encounters (${visits.length})`, icon: Activity },
          { id: "vitals", label: `Vital Signs (${vitals.length})`, icon: HeartPulse },
          { id: "diagnoses", label: `Diagnoses (${diagnoses.length})`, icon: Stethoscope },
          { id: "notes", label: `Clinical Notes (${notes.length})`, icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center px-4 py-2 text-xs font-semibold rounded-xl transition shrink-0 ${
                isActive
                  ? "bg-sky-600 text-white shadow-xs font-bold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center">
              <User className="w-4 h-4 text-sky-600 mr-2" /> Identification & Demographics
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">OHMS Unique ID</span>
                <span className="font-mono font-bold text-slate-800">{patient.patient_code}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Gender</span>
                <span className="font-bold text-slate-800">{patient.gender}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Date of Birth</span>
                <span className="font-medium text-slate-800">
                  {patient.dob ? formatDateBDT(patient.dob) : "Not recorded"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Marital Status</span>
                <span className="font-medium text-slate-800">{patient.marital_status || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">NID / Birth Certificate</span>
                <span className="font-mono text-slate-800">{patient.nid || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Occupation</span>
                <span className="text-slate-800">{patient.occupation || "N/A"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase">Address</span>
                <span className="text-slate-800">{patient.address || "Address not provided"}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center">
              <Phone className="w-4 h-4 text-emerald-600 mr-2" /> Contact & Emergency Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Primary Telephone</span>
                <span className="font-bold text-slate-800">{formatBDPhoneDisplay(patient.phone)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Secondary Phone</span>
                <span className="text-slate-800">
                  {patient.alternate_phone ? formatBDPhoneDisplay(patient.alternate_phone) : "None"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Emergency Nominee</span>
                <span className="font-bold text-slate-800">{patient.emergency_contact_name || "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Relationship</span>
                <span className="text-slate-800">{patient.emergency_contact_relation || "N/A"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase">Emergency Phone</span>
                <span className="font-bold text-slate-800">
                  {patient.emergency_contact_phone ? formatBDPhoneDisplay(patient.emergency_contact_phone) : "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Clinical Timeline */}
      {activeTab === "timeline" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <Clock className="w-4 h-4 text-sky-600 mr-2" /> Lifelong Clinical & Administrative Timeline
          </h3>

          {timeline.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">No timeline events recorded yet.</p>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {timeline.map((event) => (
                <div key={event.id} className="relative group">
                  <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-sky-500 ring-4 ring-sky-100 group-hover:bg-sky-600 transition" />
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <h4 className="font-bold text-slate-900">{event.title}</h4>
                      <span className="text-[10px] text-slate-400">{formatDateBDT(event.date)}</span>
                    </div>
                    <p className="text-xs text-slate-600">{event.description}</p>
                    {event.performer && (
                      <span className="text-[10px] text-sky-700 font-medium mt-1 inline-block">
                        Recorded by: {event.performer}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Visits & Encounters */}
      {activeTab === "visits" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <Activity className="w-4 h-4 text-sky-600 mr-2" /> Patient Encounters & Visits
          </h3>

          {visits.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">No visits registered for this patient.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {visits.map((v) => (
                <div key={v.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {v.visit_number}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          v.visit_type === "EMERGENCY"
                            ? "bg-rose-100 text-rose-800"
                            : v.visit_type === "IPD"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {v.visit_type}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{v.status}</span>
                    </div>
                    <p className="text-slate-600 mt-1">
                      <strong>Complaint:</strong> {v.chief_complaint || "None specified"}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-500">
                    <div>{formatDateBDT(v.admitted_at)}</div>
                    {v.discharged_at && <div className="text-[10px] text-emerald-600">Discharged: {formatDateBDT(v.discharged_at)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Vitals */}
      {activeTab === "vitals" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <HeartPulse className="w-4 h-4 text-rose-600 mr-2" /> Chronological Vital Signs History
          </h3>

          {vitals.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">No vital signs recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Recorded At</th>
                    <th className="py-2">BP (mmHg)</th>
                    <th className="py-2">Pulse (bpm)</th>
                    <th className="py-2">Temp (°C)</th>
                    <th className="py-2">SpO2 (%)</th>
                    <th className="py-2">Resp Rate</th>
                    <th className="py-2">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vitals.map((vt) => (
                    <tr key={vt.id} className="hover:bg-slate-50">
                      <td className="py-2 font-mono text-slate-500">{formatDateBDT(vt.recorded_at)}</td>
                      <td className="py-2 font-semibold">
                        {vt.systolic_bp && vt.diastolic_bp ? `${vt.systolic_bp}/${vt.diastolic_bp}` : "—"}
                      </td>
                      <td className="py-2">{vt.pulse_rate || "—"}</td>
                      <td className="py-2">{vt.temperature_c || "—"}</td>
                      <td className="py-2">{vt.spo2_pct ? `${vt.spo2_pct}%` : "—"}</td>
                      <td className="py-2">{vt.respiratory_rate || "—"}</td>
                      <td className="py-2">{vt.weight_kg ? `${vt.weight_kg} kg` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Diagnoses */}
      {activeTab === "diagnoses" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <Stethoscope className="w-4 h-4 text-sky-600 mr-2" /> Registered Clinical Diagnoses
          </h3>

          {diagnoses.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">No diagnoses recorded for this patient.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {diagnoses.map((diag) => (
                <div key={diag.id} className="py-3 flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-slate-900">{diag.diagnosis_name}</h4>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {diag.diagnosis_type}
                      </span>
                      {diag.icd_code && (
                        <span className="font-mono text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                          ICD: {diag.icd_code}
                        </span>
                      )}
                    </div>
                    {diag.notes && <p className="text-slate-600 mt-1">{diag.notes}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400">{formatDateBDT(diag.recorded_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Notes */}
      {activeTab === "notes" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <FileText className="w-4 h-4 text-sky-600 mr-2" /> Clinical Progress & Doctor Notes
          </h3>

          {notes.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">No clinical notes recorded.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800 uppercase text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                      {note.note_type} NOTE
                    </span>
                    <span className="text-[10px] text-slate-400">{formatDateBDT(note.created_at)}</span>
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap mt-1">{note.note_content}</p>
                  <p className="text-[10px] text-slate-500 mt-2">Author: {note.author_name || "Doctor / Nurse"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Printable Clinical Footer */}
      <div className="hidden print:block mt-8">
        <HospitalPrintFooter />
      </div>
    </div>
  );
}