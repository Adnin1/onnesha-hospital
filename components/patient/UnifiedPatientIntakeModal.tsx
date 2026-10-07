"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bed, Check, Clock3, Loader2, Search, Stethoscope, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateAgeFromDOB } from "@/lib/utils";
import {
  createUnifiedPatientIntakeAction,
  UnifiedPatientIntakePayload,
} from "@/lib/patient/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: {
    patient: PatientMaster;
    episodeId?: string;
    episodeNumber?: string;
  }) => void;
};

type Option = { id: string; name: string };
type DoctorOption = { id: string; full_name: string; opd_fee: number; specialization?: string };
type BedOption = { id: string; bed_number: string; status: string; daily_rate: number; ward_name?: string };
type CabinOption = { id: string; cabin_number: string; status: string; daily_rate: number; cabin_type?: string };
type UnitOption = { id: string; unit_name: string; unit_type: string; daily_charge: number };

function dhakaDateTimeLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute");
}

function toDhakaIso(value: string) {
  return new Date(value + ":00+06:00").toISOString();
}

export function UnifiedPatientIntakeModal({ isOpen, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PatientMaster[]>([]);
  const [selectedExisting, setSelectedExisting] = useState<PatientMaster | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">("MALE");
  const [bloodGroup, setBloodGroup] = useState("UNKNOWN");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [occupation, setOccupation] = useState("");
  const [nid, setNid] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Father");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const [encounterAt, setEncounterAt] = useState(dhakaDateTimeLocal());

  const [opdEnabled, setOpdEnabled] = useState(false);
  const [ipdEnabled, setIpdEnabled] = useState(false);
  const [criticalEnabled, setCriticalEnabled] = useState(false);

  const [departments, setDepartments] = useState<Option[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [beds, setBeds] = useState<BedOption[]>([]);
  const [cabins, setCabins] = useState<CabinOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [referrals, setReferrals] = useState<{ id: string; agent_code: string; full_name: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [opdDepartmentId, setOpdDepartmentId] = useState("");
  const [opdDoctorId, setOpdDoctorId] = useState("");
  const [opdComplaint, setOpdComplaint] = useState("");
  const [opdPriority, setOpdPriority] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");

  const [ipdDepartmentId, setIpdDepartmentId] = useState("");
  const [ipdDoctorId, setIpdDoctorId] = useState("");
  const [ipdBedId, setIpdBedId] = useState("");
  const [ipdCabinId, setIpdCabinId] = useState("");
  const [ipdDiagnosis, setIpdDiagnosis] = useState("");
  const [referralAgentId, setReferralAgentId] = useState("");

  const [criticalUnitId, setCriticalUnitId] = useState("");
  const [criticalBedNumber, setCriticalBedNumber] = useState("");
  const [criticalDoctorId, setCriticalDoctorId] = useState("");
  const [criticalDiagnosis, setCriticalDiagnosis] = useState("");
  const [ventilatorRequired, setVentilatorRequired] = useState(false);

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<UnifiedPatientIntakePayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEncounterAt(dhakaDateTimeLocal());
    setErrorMsg(null);
    setDuplicateWarning(null);
    setDuplicateMatches(null);
    setSelectedExisting(null);

    let alive = true;
    async function loadOptions() {
      setLoadingOptions(true);
      const supabase = createClient();
      const [depRes, docRes, bedRes, cabinRes, unitRes, refRes] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("doctors").select("id, full_name, opd_fee, specialization").eq("is_active", true).order("full_name"),
        supabase.from("beds").select("id, bed_number, status, daily_rate, wards(name)").eq("is_active", true).order("bed_number"),
        supabase.from("cabins").select("id, cabin_number, status, daily_rate, cabin_type").order("cabin_number"),
        supabase.from("critical_care_units").select("id, unit_name, unit_type, daily_charge").eq("is_active", true).order("unit_name"),
        supabase.from("referral_agents").select("id, agent_code, full_name").eq("is_active", true).order("full_name"),
      ]);
      if (!alive) return;
      if (depRes.data) setDepartments(depRes.data as Option[]);
      if (docRes.data) setDoctors(docRes.data as DoctorOption[]);
      if (bedRes.data) {
        setBeds((docRes.data as unknown as Array<BedOption & { wards?: { name?: string } | null }>).map((b) => ({
          ...b,
          daily_rate: Number(b.daily_rate || 0),
          ward_name: b.wards?.name,
        })));
      }
      if (cabinRes.data) setCabins((cabinRes.data as CabinOption[]).map((c) => ({ ...c, daily_rate: Number(c.daily_rate || 0) })));
      if (unitRes.data) setUnits((unitRes.data as UnitOption[]).map((u) => ({ ...u, daily_charge: Number(u.daily_charge || 0) })));
      if (refRes.data) setReferrals(refRes.data as { id: string; agent_code: string; full_name: string }[]);
      setLoadingOptions(false);
    }
    void loadOptions();
    return () => { alive = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || mode !== "EXISTING" || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      const res = await searchPatientsAction({ query: search.trim(), page: 1, pageSize: 8 });
      if (alive) {
        setSearchResults(res.success && res.data ? res.data.patients : []);
        setLoadingSearch(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isOpen, mode, search]);

  const availableBeds = useMemo(
    () => beds.filter((b) => ["VACANT", "AVAILABLE"].includes(String(b.status).toUpperCase())),
    [beds]
  );
  const availableCabins = useMemo(
    () => cabins.filter((c) => ["VACANT", "AVAILABLE"].includes(String(c.status).toUpperCase())),
    [cabins]
  );
  const selectedOpdDoctor = doctors.find((d) => d.id === opdDoctorId);
  const selectedBed = beds.find((b) => b.id === ipdBedId);
  const selectedCabin = cabins.find((c) => c.id === ipdCabinId);
  const selectedUnit = units.find((u) => u.id === criticalUnitId);

  const estimate = useMemo(() => {
    let total = 0;
    if (opdEnabled && selectedOpdDoctor) total += Number(selectedOpdDoctor.opd_fee || 0);
    if (ipdEnabled) total += Number(selectedBed?.daily_rate || selectedCabin?.daily_rate || 0);
    if (criticalEnabled) total += Number(selectedUnit?.daily_charge || 0);
    return total;
  }, [opdEnabled, ipdEnabled, criticalEnabled, selectedOpdDoctor, selectedBed, selectedCabin, selectedUnit]);

  function selectExisting(patient: PatientMaster) {
    setSelectedExisting(patient);
    setSearch(patient.patient_code + " • " + patient.full_name);
    setErrorMsg(null);
  }

  function resetNewPatientFields() {
    setFullName("");
    setPhone("");
    setAlternatePhone("");
    setEmail("");
    setDob("");
    setGender("MALE");
    setBloodGroup("UNKNOWN");
    setMaritalStatus("");
    setOccupation("");
    setNid("");
    setAddress("");
    setEmergencyName("");
    setEmergencyRelation("Father");
    setEmergencyPhone("");
  }

  async function submit(bypass = false) {
    setSubmitting(true);
    setErrorMsg(null);
    setDuplicateWarning(null);

    const payload: UnifiedPatientIntakePayload = {
      existingPatientId: selectedExisting?.id,
      encounterAt: toDhakaIso(encounterAt),
      patient: mode === "NEW"
        ? {
            fullName,
            phone,
            alternatePhone: alternatePhone || undefined,
            email: email || undefined,
            gender,
            dob: dob || undefined,
            bloodGroup,
            maritalStatus: maritalStatus || undefined,
            occupation: occupation || undefined,
            nid: nid || undefined,
            address: address || undefined,
            emergencyName: emergencyName || undefined,
            emergencyPhone: emergencyPhone || undefined,
            emergencyRelation: emergencyRelation || undefined,
          }
        : undefined,
      services: {
        opd: {
          enabled: opdEnabled,
          departmentId: opdDepartmentId || undefined,
          doctorId: opdDoctorId || undefined,
          chiefComplaint: opdComplaint || undefined,
          priority: opdPriority,
        },
        ipd: {
          enabled: ipdEnabled,
          departmentId: ipdDepartmentId || undefined,
          doctorId: ipdDoctorId || undefined,
          bedId: ipdBedId || undefined,
          cabinId: ipdCabinId || undefined,
          provisionalDiagnosis: ipdDiagnosis || undefined,
          referralAgentId: referralAgentId || undefined,
        },
        criticalCare: {
          enabled: criticalEnabled,
          unitId: criticalUnitId || undefined,
          bedNumber: criticalBedNumber || undefined,
          doctorId: criticalDoctorId || undefined,
          initialDiagnosis: criticalDiagnosis || undefined,
          ventilatorRequired,
        },
      },
      bypassDuplicateWarning: bypass,
    };

    const result = await createUnifiedPatientIntakeAction(payload);
    setSubmitting(false);

    if (!result.success) {
      if (result.duplicateWarning?.hasDuplicate && !bypass) {
        setDuplicateWarning(
          "Potential duplicate patient detected (" +
          result.duplicateWarning.confidence +
          "). Please select the existing patient or explicitly continue."
        );
        setDuplicateMatches(payload);
        return;
      }
      setErrorMsg(result.error || "Patient intake failed. No partial admission should have been committed.");
      return;
    }

    if (result.data) {
      onSuccess?.({
        patient: result.data.patient,
        episodeId: result.data.episodeId,
        episodeNumber: result.data.episodeNumber,
      });
    }
    resetNewPatientFields();
    setOpdEnabled(false);
    setIpdEnabled(false);
    setCriticalEnabled(false);
    onClose();
  }

  function validateBeforeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "EXISTING" && !selectedExisting) {
      setErrorMsg("Please search and select an existing patient.");
      return;
    }
    if (mode === "NEW" && (!fullName.trim() || !phone.trim())) {
      setErrorMsg("Patient name and primary phone are required.");
      return;
    }
    if (ipdEnabled && !ipdBedId && !ipdCabinId) {
      setErrorMsg("IPD requires one available bed or cabin.");
      return;
    }
    if (ipdEnabled && ipdBedId && ipdCabinId) {
      setErrorMsg("Select either IPD bed OR cabin, not both.");
      return;
    }
    if (criticalEnabled && (!criticalUnitId || !criticalBedNumber)) {
      setErrorMsg("Critical Care requires a unit and an available bed.");
      return;
    }
    void submit(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Unified Patient Registration and Admission">
      <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-600" />
              <h2 className="text-lg sm:text-xl font-black text-slate-900">Patient Registration & Unified Admission</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Register/reuse one patient and create OPD, IPD, and Critical Care admissions in one atomic transaction.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex gap-2 p-1 rounded-2xl bg-slate-100 w-fit">
            <button type="button" onClick={() => { setMode("NEW"); setSelectedExisting(null); }} className={"px-4 py-2 rounded-xl text-xs font-bold " + (mode === "NEW" ? "bg-white shadow text-sky-700" : "text-slate-600")}>
              New Patient
            </button>
            <button type="button" onClick={() => { setMode("EXISTING"); setErrorMsg(null); }} className={"px-4 py-2 rounded-xl text-xs font-bold " + (mode === "EXISTING" ? "bg-white shadow text-sky-700" : "text-slate-600")}>
              Existing Patient
            </button>
          </div>

          {mode === "EXISTING" ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <label className="block text-xs font-bold text-slate-700 mb-2">Find Existing Patient</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setSelectedExisting(null); }} placeholder="Patient ID, name, phone or NID..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm" />
              </div>
              {loadingSearch && <div className="text-xs text-slate-500 mt-2 flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Searching...</div>}
              {searchResults.length > 0 && !selectedExisting && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-white divide-y overflow-hidden">
                  {searchResults.map((p) => (
                    <button type="button" key={p.id} onClick={() => selectExisting(p)} className="w-full text-left p-3 hover:bg-slate-50">
                      <div className="flex justify-between gap-3">
                        <span className="font-mono font-bold text-sky-700 text-xs">{p.patient_code}</span>
                        <span className="text-xs text-slate-400">{p.phone}</span>
                      </div>
                      <div className="font-bold text-slate-900 text-sm">{p.full_name}</div>
                    </button>
                  ))}
                </div>
              )}
              {selectedExisting && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white border border-emerald-200 p-3">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <div>
                    <div className="font-bold text-slate-900">{selectedExisting.full_name}</div>
                    <div className="text-[11px] text-slate-500">{selectedExisting.patient_code} • {selectedExisting.phone}</div>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Patient Full Name *"><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} /></Field>
                <Field label="Primary Phone *"><input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className={inputCls + " font-mono"} /></Field>
                <Field label="Alternate Phone"><input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} className={inputCls + " font-mono"} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label={"Date of Birth" + (dob ? " (" + calculateAgeFromDOB(dob) + " Yrs)" : "")}><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} /></Field>
                <Field label="Gender"><select value={gender} onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER")} className={inputCls}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></Field>
                <Field label="Blood Group"><select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className={inputCls}><option>UNKNOWN</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></Field>
                <Field label="Marital Status"><select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={inputCls}><option value="">Select</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Occupation"><input value={occupation} onChange={(e) => setOccupation(e.target.value)} className={inputCls} /></Field>
                <Field label="NID / Birth Registration"><input value={nid} onChange={(e) => setNid(e.target.value)} className={inputCls + " font-mono"} /></Field>
                <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Present Address"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Emergency Contact Name"><input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} className={inputCls} /></Field>
                <Field label="Relationship"><select value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} className={inputCls}><option>Father</option><option>Mother</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Brother</option><option>Sister</option><option>Guardian</option><option>Other</option></select></Field>
                <Field label="Emergency Phone"><input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="01XXXXXXXXX" className={inputCls + " font-mono"} /></Field>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 mb-2"><Clock3 className="w-4 h-4 text-amber-700" /><h3 className="font-black text-slate-900 text-sm">Admission / Encounter Date & Time</h3></div>
            <input type="datetime-local" value={encounterAt} onChange={(e) => setEncounterAt(e.target.value)} className={inputCls + " max-w-sm bg-white"} />
            <p className="text-[11px] text-slate-500 mt-2">This is stored as the actual clinical start time (Asia/Dhaka). Created-at timestamps remain separate.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-sky-600" /><h3 className="font-black text-slate-900 text-sm">Select Services / Admissions</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ServiceCard title="OPD Consultation" enabled={opdEnabled} onClick={() => setOpdEnabled(!opdEnabled)} subtitle={selectedOpdDoctor ? "Fee " + selectedOpdDoctor.opd_fee + " BDT" : "Consultation"} />
              <ServiceCard title="IPD Admission" enabled={ipdEnabled} onClick={() => setIpdEnabled(!ipdEnabled)} subtitle={selectedBed ? selectedBed.bed_number : selectedCabin ? selectedCabin.cabin_number : "Bed / Cabin"} />
              <ServiceCard title="Critical Care" enabled={criticalEnabled} onClick={() => setCriticalEnabled(!criticalEnabled)} subtitle={selectedUnit ? selectedUnit.unit_type + " • " + selectedUnit.daily_charge + " BDT/day" : "ICU / CCU / HDU"} />
            </div>

            {opdEnabled && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">OPD Consultation Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Department"><select value={opdDepartmentId} onChange={(e) => setOpdDepartmentId(e.target.value)} className={inputCls}><option value="">Select department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                  <Field label="Doctor"><select value={opdDoctorId} onChange={(e) => setOpdDoctorId(e.target.value)} className={inputCls}><option value="">Select doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.specialization || "Consultant"}</option>)}</select></Field>
                  <Field label="Priority"><select value={opdPriority} onChange={(e) => setOpdPriority(e.target.value as "NORMAL" | "URGENT" | "CRITICAL")} className={inputCls}><option>NORMAL</option><option>URGENT</option><option>CRITICAL</option></select></Field>
                </div>
                <Field label="Chief Complaint / Reason"><input value={opdComplaint} onChange={(e) => setOpdComplaint(e.target.value)} className={inputCls} /></Field>
              </div>
            )}

            {ipdEnabled && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2"><Bed className="w-4 h-4 text-indigo-700" /><h4 className="font-bold text-slate-900 text-sm">IPD / Bed / Cabin Details</h4></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Department"><select value={ipdDepartmentId} onChange={(e) => setIpdDepartmentId(e.target.value)} className={inputCls}><option value="">Select department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                  <Field label="Attending Doctor"><select value={ipdDoctorId} onChange={(e) => setIpdDoctorId(e.target.value)} className={inputCls}><option value="">Select doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
                  <Field label="Referral Agent"><select value={referralAgentId} onChange={(e) => setReferralAgentId(e.target.value)} className={inputCls}><option value="">None</option>{referrals.map((r) => <option key={r.id} value={r.id}>{r.agent_code} — {r.full_name}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Available Bed">
                    <select value={ipdBedId} onChange={(e) => { setIpdBedId(e.target.value); setIpdCabinId(""); }} className={inputCls}>
                      <option value="">No bed selected</option>
                      {availableBeds.map((b) => <option key={b.id} value={b.id}>{b.bed_number} • {b.ward_name || "Ward"} • {b.daily_rate} BDT/day</option>)}
                    </select>
                  </Field>
                  <Field label="Available Cabin">
                    <select value={ipdCabinId} onChange={(e) => { setIpdCabinId(e.target.value); setIpdBedId(""); }} className={inputCls}>
                      <option value="">No cabin selected</option>
                      {availableCabins.map((c) => <option key={c.id} value={c.id}>{c.cabin_number} • {c.cabin_type || "Cabin"} • {c.daily_rate} BDT/day</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Provisional Diagnosis"><input value={ipdDiagnosis} onChange={(e) => setIpdDiagnosis(e.target.value)} className={inputCls} /></Field>
              </div>
            )}

            {criticalEnabled && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">Critical Care Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Unit"><select value={criticalUnitId} onChange={(e) => { setCriticalUnitId(e.target.value); setCriticalBedNumber(""); }} className={inputCls}><option value="">Select unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.unit_name} • {u.daily_charge} BDT/day</option>)}</select></Field>
                  <Field label="Critical-Care Bed">
                    <select value={criticalBedNumber} onChange={(e) => setCriticalBedNumber(e.target.value)} className={inputCls}>
                      <option value="">Select available bed</option>
                      {availableBeds.filter((b) => /ICU|CCU|ICCU|SICU|MICU|PICU/i.test((b.ward_name || "") + " " + b.bed_number)).map((b) => <option key={b.id} value={b.bed_number}>{b.bed_number} • {b.ward_name || "Critical Care"}</option>)}
                    </select>
                  </Field>
                  <Field label="Admitting Doctor"><select value={criticalDoctorId} onChange={(e) => setCriticalDoctorId(e.target.value)} className={inputCls}><option value="">Select doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
                </div>
                <Field label="Initial Diagnosis"><input value={criticalDiagnosis} onChange={(e) => setCriticalDiagnosis(e.target.value)} className={inputCls} /></Field>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={ventilatorRequired} onChange={(e) => setVentilatorRequired(e.target.checked)} /> Ventilator required</label>
              </div>
            )}
          </section>

          {(opdEnabled || ipdEnabled || criticalEnabled) && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Initial Charge Preview</h3>
                  <p className="text-[11px] text-slate-500">IPD/Critical Care preview is one configured daily unit; final billing is calculated from exact start/end time.</p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Estimated starting charges</div>
                  <div className="text-xl font-black text-emerald-700">{estimate.toLocaleString("en-BD")} BDT</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {opdEnabled && <span className="px-2 py-1 rounded-lg bg-white border">OPD</span>}
                {ipdEnabled && <span className="px-2 py-1 rounded-lg bg-white border">IPD</span>}
                {criticalEnabled && <span className="px-2 py-1 rounded-lg bg-white border">Critical Care</span>}
              </div>
            </section>
          )}

          {duplicateWarning && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-black text-amber-900 text-sm">Potential Duplicate Patient</div>
                  <p className="text-xs text-amber-800 mt-1">{duplicateWarning}</p>
                  {duplicateMatches && (
                    <button type="button" onClick={() => {
                      setMode("EXISTING");
                      setErrorMsg("Search and select the matching patient. The original patient form was not committed.");
                    }} className="mt-2 text-xs font-bold text-amber-900 underline">
                      Switch to Existing Patient
                    </button>
                  )}
                  <button type="button" disabled={submitting} onClick={() => void submit(true)} className="mt-3 ml-3 px-3 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs disabled:opacity-50">
                    Continue Anyway (Audited)
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <form onSubmit={validateBeforeSubmit} className="border-t border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">One submission = one atomic transaction. A failure must roll back all selected admissions.</div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs">Cancel</button>
            <button type="submit" disabled={submitting || loadingOptions} className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs disabled:opacity-50 flex items-center justify-center">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {opdEnabled || ipdEnabled || criticalEnabled ? "Register & Create Admissions" : "Register Patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20";
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-600 mb-1">{label}</label>
    {children}
  </div>
);

function ServiceCard({ title, subtitle, enabled, onClick }: { title: string; subtitle: string; enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"text-left p-4 rounded-2xl border-2 transition " + (enabled ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-sm text-slate-900">{title}</span>
        <span className={"w-5 h-5 rounded-full border flex items-center justify-center " + (enabled ? "bg-sky-600 border-sky-600 text-white" : "border-slate-300 text-transparent")}>
          <Check className="w-3 h-3" />
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>
    </button>
  );
}
