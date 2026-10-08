"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bed, Check, Clock3, Loader2, Search, Stethoscope, UserPlus, X, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateAgeFromDOB } from "@/lib/utils";
import {
  createUnifiedPatientIntakeAction,
  UnifiedPatientIntakePayload,
} from "@/lib/patient/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { searchReferralAgentsAction } from "@/lib/referrals/actions";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "@/lib/patient/phone";
import { PatientMaster } from "@/types/clinical";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: {
    patient: PatientMaster;
    episodeId?: string;
    episodeNumber?: string;
  }) => void;
  initialMode?: "NEW" | "EXISTING";
  initialPatient?: PatientMaster | null;
};

type Option = { id: string; name: string };
type DoctorOption = { id: string; full_name: string; opd_fee: number; specialization?: string };
type BedOption = { id: string; bed_number: string; status: string; daily_rate: number; ward_name?: string; critical_care_unit_id?: string | null };
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

export function UnifiedPatientIntakeModal({
  isOpen,
  onClose,
  onSuccess,
  initialMode = "NEW",
  initialPatient = null,
}: Props) {
  const [mode, setMode] = useState<"NEW" | "EXISTING">(initialPatient ? "EXISTING" : initialMode);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PatientMaster[]>([]);
  const [selectedExisting, setSelectedExisting] = useState<PatientMaster | null>(initialPatient);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // New Patient Demographics
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

  // Services Toggles
  const [opdEnabled, setOpdEnabled] = useState(false);
  const [ipdEnabled, setIpdEnabled] = useState(false);
  const [criticalEnabled, setCriticalEnabled] = useState(false);
  const [otEnabled, setOtEnabled] = useState(false);

  // Reference Datasets
  const [departments, setDepartments] = useState<Option[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [beds, setBeds] = useState<BedOption[]>([]);
  const [cabins, setCabins] = useState<CabinOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [otRooms, setOtRooms] = useState<Array<{ id: string; room_number: string; room_name: string }>>([]);
  const [referrals, setReferrals] = useState<{ id: string; agent_code: string; full_name: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // OPD Fields
  const [opdDepartmentId, setOpdDepartmentId] = useState("");
  const [opdDoctorId, setOpdDoctorId] = useState("");
  const [opdComplaint, setOpdComplaint] = useState("");
  const [opdPriority, setOpdPriority] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");

  // IPD Fields
  const [ipdDepartmentId, setIpdDepartmentId] = useState("");
  const [ipdDoctorId, setIpdDoctorId] = useState("");
  const [ipdBedId, setIpdBedId] = useState("");
  const [ipdCabinId, setIpdCabinId] = useState("");
  const [ipdDiagnosis, setIpdDiagnosis] = useState("");
  const [referralAgentId, setReferralAgentId] = useState("");
  const [admissionDiscountPercent, setAdmissionDiscountPercent] = useState<number | "">("");
  const [admissionDiscountReason, setAdmissionDiscountReason] = useState("");

  // Critical Care Fields
  const [criticalUnitId, setCriticalUnitId] = useState("");
  const [criticalBedNumber, setCriticalBedNumber] = useState("");
  const [criticalDoctorId, setCriticalDoctorId] = useState("");
  const [criticalDiagnosis, setCriticalDiagnosis] = useState("");
  const [ventilatorRequired, setVentilatorRequired] = useState(false);

  // OT Surgery Details
  const [otRoomId, setOtRoomId] = useState("");
  const [otDoctorId, setOtDoctorId] = useState("");
  const [otProcedure, setOtProcedure] = useState("Caesarean Section (C-Section)");
  const [otCharge, setOtCharge] = useState<number>(6000);
  const [otAnesthesia, setOtAnesthesia] = useState("GENERAL");
  const [otScheduledAt, setOtScheduledAt] = useState(dhakaDateTimeLocal());

  // UI Flow States
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<UnifiedPatientIntakePayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [highlightField, setHighlightField] = useState<string | null>(null);

  // Helper to scroll smoothly to missing/invalid fields
  function scrollToField(fieldId: string) {
    setHighlightField(fieldId);
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 60);
  }

  // Load available options on modal open
  useEffect(() => {
    if (!isOpen) return;
    setEncounterAt(dhakaDateTimeLocal());
    setErrorMsg(null);
    setDuplicateWarning(null);
    setDuplicateMatches(null);
    setHighlightField(null);

    if (initialPatient) {
      setMode("EXISTING");
      setSelectedExisting(initialPatient);
      setSearch(initialPatient.patient_code + " • " + initialPatient.full_name);
    } else {
      setMode(initialMode || "NEW");
      setSelectedExisting(null);
      setSearch("");
    }

    let alive = true;
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const supabase = createClient();
        const [depRes, docRes, bedRes, cabinRes, unitRes, otRes, refRes] = await Promise.allSettled([
          supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
          supabase.from("doctors").select("id, full_name, opd_fee, specialization").eq("is_active", true).order("full_name"),
          supabase.from("beds").select("id, bed_number, status, daily_rate, critical_care_unit_id, wards(name)").eq("is_active", true).order("bed_number"),
          supabase.from("cabins").select("id, cabin_number, status, daily_rate, cabin_type").order("cabin_number"),
          supabase.from("critical_care_units").select("id, unit_name, unit_type, daily_charge").eq("is_active", true).order("unit_name"),
          supabase.from("ot_rooms").select("id, room_number, room_name").order("room_number"),
          searchReferralAgentsAction(""),
        ]);
        if (!alive) return;
        if (depRes.status === "fulfilled" && depRes.value.data) {
          setDepartments(depRes.value.data as Option[]);
        }
        if (docRes.status === "fulfilled" && docRes.value.data) {
          setDoctors(docRes.value.data as DoctorOption[]);
        }
        if (bedRes.status === "fulfilled" && bedRes.value.data) {
          setBeds((bedRes.value.data as unknown as Array<BedOption & { wards?: { name?: string } | null }>).map((b) => ({
            ...b,
            daily_rate: Number(b.daily_rate || 0),
            ward_name: b.wards?.name,
            critical_care_unit_id: b.critical_care_unit_id,
          })));
        }
        if (cabinRes.status === "fulfilled" && cabinRes.value.data) {
          setCabins((cabinRes.value.data as CabinOption[]).map((c) => ({ ...c, daily_rate: Number(c.daily_rate || 0) })));
        }
        if (unitRes.status === "fulfilled" && unitRes.value.data) {
          setUnits((unitRes.value.data as UnitOption[]).map((u) => ({ ...u, daily_charge: Number(u.daily_charge || 0) })));
        }
        if (otRes.status === "fulfilled" && otRes.value.data) {
          setOtRooms(otRes.value.data as Array<{ id: string; room_number: string; room_name: string }>);
          if (otRes.value.data.length > 0 && !otRoomId) setOtRoomId(otRes.value.data[0].id);
        }
        if (refRes.status === "fulfilled" && refRes.value.success && refRes.value.data) {
          setReferrals(refRes.value.data.map((r) => ({ id: r.id, agent_code: r.agent_code, full_name: r.full_name })));
        }
      } catch (err) {
        console.error("Failed to load intake options:", err);
      } finally {
        if (alive) setLoadingOptions(false);
      }
    }
    void loadOptions();
    return () => { alive = false; };
  }, [isOpen, initialMode, initialPatient]);

  // Existing Patient Search
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

  // Smart Service Toggles with Auto-Default Population
  function toggleOpd() {
    const next = !opdEnabled;
    setOpdEnabled(next);
    setErrorMsg(null);
    if (next) {
      if (!opdDepartmentId && departments.length > 0) setOpdDepartmentId(departments[0].id);
      if (!opdDoctorId && doctors.length > 0) setOpdDoctorId(doctors[0].id);
    }
  }

  function toggleIpd() {
    const next = !ipdEnabled;
    setIpdEnabled(next);
    setErrorMsg(null);
    if (next) {
      if (!ipdBedId && !ipdCabinId) {
        if (availableBeds.length > 0) {
          setIpdBedId(availableBeds[0].id);
        } else if (availableCabins.length > 0) {
          setIpdCabinId(availableCabins[0].id);
        }
      }
      if (!ipdDepartmentId && departments.length > 0) setIpdDepartmentId(departments[0].id);
      if (!ipdDoctorId && doctors.length > 0) setIpdDoctorId(doctors[0].id);
    }
  }

  function toggleCriticalCare() {
    const next = !criticalEnabled;
    setCriticalEnabled(next);
    setErrorMsg(null);
    if (next) {
      const defaultUnit = criticalUnitId || (units.length > 0 ? units[0].id : "");
      if (!criticalUnitId && defaultUnit) {
        setCriticalUnitId(defaultUnit);
      }
      if (!criticalBedNumber) {
        const matchingBed = availableBeds.find(
          (b) => (defaultUnit && b.critical_care_unit_id === defaultUnit) ||
                 /ICU|CCU|HDU|SICU|MICU/i.test((b.ward_name || "") + " " + b.bed_number)
        ) || availableBeds[0];
        if (matchingBed) {
          setCriticalBedNumber(matchingBed.bed_number);
        }
      }
      if (!criticalDoctorId && doctors.length > 0) {
        setCriticalDoctorId(doctors[0].id);
      }
    }
  }

  function toggleOt() {
    const next = !otEnabled;
    setOtEnabled(next);
    setErrorMsg(null);
    if (next) {
      if (!otRoomId && otRooms.length > 0) setOtRoomId(otRooms[0].id);
      if (!otDoctorId && doctors.length > 0) setOtDoctorId(doctors[0].id);
    }
  }

  const estimate = useMemo(() => {
    let total = 0;
    if (opdEnabled && selectedOpdDoctor) total += Number(selectedOpdDoctor.opd_fee || 0);
    if (ipdEnabled) total += Number(selectedBed?.daily_rate || selectedCabin?.daily_rate || 0);
    if (criticalEnabled) total += Number(selectedUnit?.daily_charge || 0);
    if (otEnabled) total += Number(otCharge || 6000);
    return total;
  }, [opdEnabled, ipdEnabled, criticalEnabled, otEnabled, otCharge, selectedOpdDoctor, selectedBed, selectedCabin, selectedUnit]);

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
    setAdmissionDiscountPercent("");
    setAdmissionDiscountReason("");
    setReferralAgentId("");
    setHighlightField(null);
  }

  // Authoritative Submission Function
  async function submit(bypass = false, servicesOverride?: UnifiedPatientIntakePayload["services"]) {
    setSubmitting(true);
    setErrorMsg(null);
    setDuplicateWarning(null);

    const pct = admissionDiscountPercent !== "" ? Number(admissionDiscountPercent) : 0;
    if (pct > 0 && (pct < 5 || pct > 60)) {
      setErrorMsg("অনুমোদিত অ্যাডমিশন ডিসকাউন্ট সীমা ৫% থেকে ৬০% এর মধ্যে হতে হবে (বা ০% কোন ছাড় না থাকলে)।");
      setSubmitting(false);
      return;
    }

    const activeServices = servicesOverride ?? {
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
        unitId: criticalUnitId || (units[0]?.id || undefined),
        bedNumber: criticalBedNumber || (availableBeds[0]?.bed_number || undefined),
        doctorId: criticalDoctorId || undefined,
        initialDiagnosis: criticalDiagnosis || undefined,
        ventilatorRequired,
      },
      ot: {
        enabled: otEnabled,
        roomId: otRoomId || undefined,
        surgeonId: otDoctorId || undefined,
        procedureName: otProcedure || undefined,
        estimatedCharge: Number(otCharge || 6000),
        anesthesiaType: otAnesthesia,
        scheduledStart: toDhakaIso(otScheduledAt),
      },
    };

    const effectiveDiscountBDT = estimate > 0 && pct > 0 ? Math.round((estimate * pct) / 100) : 0;
    const effectiveReason = pct > 0
      ? `[Admission Discount: ${pct}%] ${admissionDiscountReason.trim()}`.trim()
      : admissionDiscountReason.trim() || undefined;

    const payload: UnifiedPatientIntakePayload = {
      existingPatientId: selectedExisting?.id,
      encounterAt: toDhakaIso(encounterAt),
      referralAgentId: referralAgentId || undefined,
      admissionDiscountAmount: pct > 0 ? effectiveDiscountBDT : undefined,
      admissionDiscountReason: effectiveReason,
      patient: mode === "NEW"
        ? {
            fullName: fullName.trim(),
            phone: phone.trim(),
            alternatePhone: alternatePhone.trim() || undefined,
            email: email.trim() || undefined,
            gender,
            dob: dob || undefined,
            bloodGroup,
            maritalStatus: maritalStatus || undefined,
            occupation: occupation.trim() || undefined,
            nid: nid.trim() || undefined,
            address: address.trim() || undefined,
            emergencyName: emergencyName.trim() || undefined,
            emergencyPhone: emergencyPhone.trim() || undefined,
            emergencyRelation: emergencyRelation || undefined,
          }
        : undefined,
      services: activeServices,
      bypassDuplicateWarning: bypass,
    };

    try {
      const result = await createUnifiedPatientIntakeAction(payload);
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
        setErrorMsg(result.error || "Patient intake failed. No partial admission was committed.");
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
      setOtEnabled(false);
      onClose();
    } catch (err: unknown) {
      console.error("Intake action error:", err);
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred during patient intake.");
    } finally {
      setSubmitting(false);
    }
  }

  // 1-Click "Register Patient Only" Action
  function submitPatientOnly() {
    setErrorMsg(null);
    setDuplicateWarning(null);

    if (mode === "NEW") {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMsg("রোগীর পূর্ণ নাম আবশ্যক (কমপক্ষে ২ অক্ষর) / Patient full name is required.");
        scrollToField("field-fullName");
        return;
      }
      const cleanPhone = phone.trim();
      if (!cleanPhone) {
        setErrorMsg("রোগীর মোবাইল নম্বর আবশ্যক / Patient primary phone is required.");
        scrollToField("field-phone");
        return;
      }
      const norm = normalizeBDPhone(cleanPhone);
      if (!isValidNormalizedBDPhone(norm)) {
        setErrorMsg("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 01712345678) / Valid 11-digit mobile number required.");
        scrollToField("field-phone");
        return;
      }
    } else if (mode === "EXISTING" && !selectedExisting) {
      setErrorMsg("অনুগ্রহ করে বিদ্যমান রোগী নির্বাচন করুন / Please select an existing patient.");
      scrollToField("field-search");
      return;
    }

    void submit(false, {
      opd: { enabled: false },
      ipd: { enabled: false },
      criticalCare: { enabled: false },
      ot: { enabled: false },
    });
  }

  // Form Validation & Submission
  function validateBeforeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setDuplicateWarning(null);

    if (mode === "EXISTING" && !selectedExisting) {
      setErrorMsg("অনুগ্রহ করে বিদ্যমান রোগী অনুসন্ধান করে নির্বাচন করুন (Please select an existing patient).");
      scrollToField("field-search");
      return;
    }

    if (mode === "NEW") {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMsg("রোগীর পূর্ণ নাম আবশ্যক (কমপক্ষে ২ অক্ষর) / Patient full name is required.");
        scrollToField("field-fullName");
        return;
      }
      const cleanPhone = phone.trim();
      if (!cleanPhone) {
        setErrorMsg("রোগীর মোবাইল নম্বর আবশ্যক / Patient primary phone is required.");
        scrollToField("field-phone");
        return;
      }
      const norm = normalizeBDPhone(cleanPhone);
      if (!isValidNormalizedBDPhone(norm)) {
        setErrorMsg("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 01712345678) / Valid 11-digit mobile number required.");
        scrollToField("field-phone");
        return;
      }
    }

    // IPD Validation & Smart Fallback
    if (ipdEnabled) {
      if (!ipdBedId && !ipdCabinId) {
        // Auto-assign first available bed or cabin if exists
        if (availableBeds.length > 0) {
          setIpdBedId(availableBeds[0].id);
        } else if (availableCabins.length > 0) {
          setIpdCabinId(availableCabins[0].id);
        } else {
          setErrorMsg("আইপিডি ভর্তির জন্য বর্তমানে কোনো বেড বা কেবিন খালি নেই। আইপিডি বাদ দিয়ে শুধু রোগী নিবন্ধন করতে নিচের বোতাম চাপুন।");
          scrollToField("field-ipd-bed");
          return;
        }
      }
      if (ipdBedId && ipdCabinId) {
        setErrorMsg("বেড অথবা কেবিনের যেকোনো একটি নির্বাচন করুন, উভয়টি নয় (Select either IPD bed OR cabin, not both).");
        scrollToField("field-ipd-bed");
        return;
      }
    }

    // Critical Care Validation & Smart Fallback
    if (criticalEnabled) {
      let resolvedUnit = criticalUnitId;
      let resolvedBed = criticalBedNumber;

      if (!resolvedUnit && units.length > 0) {
        resolvedUnit = units[0].id;
        setCriticalUnitId(resolvedUnit);
      }

      if (!resolvedBed && availableBeds.length > 0) {
        const matchingBed = availableBeds.find(
          (b) => (resolvedUnit && b.critical_care_unit_id === resolvedUnit) ||
                 /ICU|CCU|HDU|SICU/i.test((b.ward_name || "") + " " + b.bed_number)
        ) || availableBeds[0];
        if (matchingBed) {
          resolvedBed = matchingBed.bed_number;
          setCriticalBedNumber(resolvedBed);
        }
      }

      if (!resolvedUnit || !resolvedBed) {
        setErrorMsg("ক্রিটিক্যাল কেয়ারের জন্য একটি ইউনিট এবং খালি বেড নির্বাচন করুন (Critical Care requires a unit and an available bed).");
        scrollToField("field-critical-unit");
        return;
      }
    }

    // Admission Discount Range Check
    if (admissionDiscountPercent !== "" && Number(admissionDiscountPercent) > 0) {
      const p = Number(admissionDiscountPercent);
      if (p < 5 || p > 60) {
        setErrorMsg("অ্যাডমিশন ডিসকাউন্ট ৫% থেকে ৬০% এর মধ্যে হতে হবে (Admission discount percentage must be between 5% and 60%).");
        scrollToField("field-discount");
        return;
      }
    }

    void submit(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Unified Patient Registration and Admission">
      <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-600" />
              <h2 className="text-lg sm:text-xl font-black text-slate-900">Patient Registration & Unified Admission</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Register/reuse one patient and create OPD, IPD, Critical Care, or OT admissions in one atomic transaction.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body & Integrated Form */}
        <form id="unified-patient-intake-form" onSubmit={validateBeforeSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Mode Switcher */}
            <div className="flex gap-2 p-1 rounded-2xl bg-slate-100 w-fit">
              <button
                type="button"
                onClick={() => { setMode("NEW"); setSelectedExisting(null); setErrorMsg(null); }}
                className={"px-4 py-2 rounded-xl text-xs font-bold transition " + (mode === "NEW" ? "bg-white shadow text-sky-700" : "text-slate-600 hover:text-slate-900")}
              >
                New Patient (নতুন রোগী)
              </button>
              <button
                type="button"
                onClick={() => { setMode("EXISTING"); setErrorMsg(null); }}
                className={"px-4 py-2 rounded-xl text-xs font-bold transition " + (mode === "EXISTING" ? "bg-white shadow text-sky-700" : "text-slate-600 hover:text-slate-900")}
              >
                Existing Patient (পুরাতন রোগী)
              </button>
            </div>

            {/* Existing Patient Search Panel */}
            {mode === "EXISTING" ? (
              <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <label className="block text-xs font-bold text-slate-700 mb-2">Find Existing Patient (রোগী খুঁজুন)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    id="field-search"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSelectedExisting(null); setErrorMsg(null); }}
                    placeholder="Patient ID (P-YYYY-XXXX), name, phone, or NID..."
                    className={inputCls + (highlightField === "field-search" ? " ring-2 ring-rose-500 border-rose-500" : "")}
                  />
                </div>
                {loadingSearch && (
                  <div className="text-xs text-slate-500 mt-2 flex items-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Searching...
                  </div>
                )}
                {searchResults.length > 0 && !selectedExisting && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white divide-y overflow-hidden shadow-sm">
                    {searchResults.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => selectExisting(p)}
                        className="w-full text-left p-3 hover:bg-sky-50/50 transition flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{p.full_name}</div>
                          <div className="text-xs text-slate-500">{p.phone} • {p.dob ? calculateAgeFromDOB(p.dob) + " Yrs" : "Age N/A"} • Gender: {p.gender}</div>
                        </div>
                        <span className="font-mono font-bold text-sky-700 text-xs px-2 py-1 rounded bg-sky-100">{p.patient_code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedExisting && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-white border border-emerald-300 p-3 shadow-sm">
                    <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{selectedExisting.full_name}</div>
                      <div className="text-xs text-slate-500">{selectedExisting.patient_code} • {selectedExisting.phone} • {selectedExisting.gender}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedExisting(null); setSearch(""); }}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600"
                    >
                      Change
                    </button>
                  </div>
                )}
              </section>
            ) : (
              /* New Patient Demographics Section */
              <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-sky-600" />
                  <span>Patient Demographics (রোগীর তথ্য)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Patient Full Name * (রোগীর পুরো নাম)">
                    <input
                      id="field-fullName"
                      required
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setErrorMsg(null); }}
                      placeholder="e.g. Mohammad Rahim"
                      className={inputCls + (highlightField === "field-fullName" ? " ring-2 ring-rose-500 border-rose-500 bg-rose-50/30" : "")}
                    />
                  </Field>
                  <Field label="Primary Phone * (মোবাইল নম্বর)">
                    <input
                      id="field-phone"
                      required
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setErrorMsg(null); }}
                      placeholder="01XXXXXXXXX"
                      className={inputCls + " font-mono" + (highlightField === "field-phone" ? " ring-2 ring-rose-500 border-rose-500 bg-rose-50/30" : "")}
                    />
                  </Field>
                  <Field label="Alternate Phone (বিকল্প ফোন)">
                    <input
                      value={alternatePhone}
                      onChange={(e) => setAlternatePhone(e.target.value)}
                      placeholder="Optional"
                      className={inputCls + " font-mono"}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Field label={"Date of Birth" + (dob ? " (" + calculateAgeFromDOB(dob) + " Yrs)" : "")}>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Gender (লিঙ্গ)">
                    <select value={gender} onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER")} className={inputCls}>
                      <option value="MALE">Male (পুরুষ)</option>
                      <option value="FEMALE">Female (মহিলা)</option>
                      <option value="OTHER">Other (অন্যান্য)</option>
                    </select>
                  </Field>
                  <Field label="Blood Group (রক্তের গ্রুপ)">
                    <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className={inputCls}>
                      <option>UNKNOWN</option>
                      <option>A+</option><option>A-</option>
                      <option>B+</option><option>B-</option>
                      <option>AB+</option><option>AB-</option>
                      <option>O+</option><option>O-</option>
                    </select>
                  </Field>
                  <Field label="Marital Status (বৈবাহিক অবস্থা)">
                    <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={inputCls}>
                      <option value="">Select</option>
                      <option>Single</option>
                      <option>Married</option>
                      <option>Divorced</option>
                      <option>Widowed</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Occupation (পেশা)">
                    <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. Teacher, Business" className={inputCls} />
                  </Field>
                  <Field label="NID / Birth Registration (জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন)">
                    <input value={nid} onChange={(e) => setNid(e.target.value)} placeholder="NID or Birth Certificate" className={inputCls + " font-mono"} />
                  </Field>
                  <Field label="Email (ইমেইল)">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="patient@example.com" className={inputCls} />
                  </Field>
                </div>
                <Field label="Present Address (বর্তমান ঠিকানা)">
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Village/House, Road, Thana, District" className={inputCls} />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Emergency Contact Name">
                    <input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Contact person" className={inputCls} />
                  </Field>
                  <Field label="Relationship (সম্পর্ক)">
                    <select value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} className={inputCls}>
                      <option>Father</option>
                      <option>Mother</option>
                      <option>Spouse</option>
                      <option>Son</option>
                      <option>Daughter</option>
                      <option>Brother</option>
                      <option>Sister</option>
                      <option>Guardian</option>
                      <option>Other</option>
                    </select>
                  </Field>
                  <Field label="Emergency Phone (জরুরি ফোন)">
                    <input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="01XXXXXXXXX" className={inputCls + " font-mono"} />
                  </Field>
                </div>
              </section>
            )}

            {/* Encounter, Referral & Discount Settings */}
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-amber-700" />
                <h3 className="font-black text-slate-900 text-sm">Admission, Referral & Intake Settings</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Admission / Encounter Date & Time">
                  <input type="datetime-local" value={encounterAt} onChange={(e) => setEncounterAt(e.target.value)} className={inputCls + " bg-white"} />
                </Field>
                <Field label="Referral Agent (রেফারেল এজেন্ট)">
                  <select value={referralAgentId} onChange={(e) => setReferralAgentId(e.target.value)} className={inputCls + " bg-white"}>
                    <option value="">{loadingOptions ? "Loading referral agents..." : "No referral agent (None)"}</option>
                    {referrals.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.agent_code} — {r.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Admission Discount (ভর্তি ছাড়)">
                  <div className="relative">
                    <input
                      id="field-discount"
                      type="number"
                      min="0"
                      max="60"
                      step="0.5"
                      placeholder="৫% - ৬০%"
                      value={admissionDiscountPercent}
                      onChange={(e) => setAdmissionDiscountPercent(e.target.value === "" ? "" : Number(e.target.value))}
                      className={inputCls + " bg-white font-mono pr-8"}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs pointer-events-none">
                      %
                    </span>
                  </div>
                  {admissionDiscountPercent !== "" && Number(admissionDiscountPercent) > 0 && (
                    <div className="mt-1 text-[11px]">
                      {Number(admissionDiscountPercent) < 5 || Number(admissionDiscountPercent) > 60 ? (
                        <span className="text-amber-600 font-bold">
                          ⚠️ অনুমোদিত ডিসকাউন্ট সীমা ৫% থেকে ৬০%
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-bold">
                          {estimate > 0
                            ? `প্রাক্কলিত ছাড়: ৳${Math.round((estimate * Number(admissionDiscountPercent)) / 100)} (${admissionDiscountPercent}% of ৳${estimate})`
                            : `${admissionDiscountPercent}% ছাড় বিলিংয়ে কার্যকর হবে`}
                        </span>
                      )}
                    </div>
                  )}
                </Field>
              </div>
              {admissionDiscountPercent !== "" && Number(admissionDiscountPercent) > 0 && (
                <Field label="Admission Discount Reason / Authorization">
                  <input
                    value={admissionDiscountReason}
                    onChange={(e) => setAdmissionDiscountReason(e.target.value)}
                    placeholder="e.g. Director approval, concession, poor patient..."
                    className={inputCls + " bg-white"}
                  />
                </Field>
              )}
            </section>

            {/* Select Services / Admissions Header */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-sky-600" />
                  <h3 className="font-black text-slate-900 text-sm">Select Services / Admissions (ভর্তি ও সেবা নির্বাচন)</h3>
                </div>
                <div className="text-[11px] text-slate-500">
                  Click any card to add or remove services.
                </div>
              </div>

              {/* Service Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <ServiceCard
                  title="OPD Consultation"
                  enabled={opdEnabled}
                  onClick={toggleOpd}
                  subtitle={selectedOpdDoctor ? "Fee " + selectedOpdDoctor.opd_fee + " BDT" : "Consultation"}
                />
                <ServiceCard
                  title="IPD Admission"
                  enabled={ipdEnabled}
                  onClick={toggleIpd}
                  subtitle={selectedBed ? selectedBed.bed_number : selectedCabin ? selectedCabin.cabin_number : "Bed / Cabin"}
                />
                <ServiceCard
                  title="Critical Care"
                  enabled={criticalEnabled}
                  onClick={toggleCriticalCare}
                  subtitle={selectedUnit ? selectedUnit.unit_type + " • " + selectedUnit.daily_charge + " BDT/day" : "ICU / CCU / HDU"}
                />
                <ServiceCard
                  title="Operation Theatre (OT)"
                  enabled={otEnabled}
                  onClick={toggleOt}
                  subtitle={otProcedure ? `${otProcedure.slice(0, 15)} • ৳${otCharge}` : "Surgery / Procedure"}
                />
              </div>

              {/* OPD Consultation Details Sub-Panel */}
              {opdEnabled && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">OPD Consultation Details</h4>
                    <button
                      type="button"
                      onClick={() => { setOpdEnabled(false); setErrorMsg(null); }}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-100/60 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition"
                    >
                      ✕ বাদ দিন (Remove OPD)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Department">
                      <select value={opdDepartmentId} onChange={(e) => setOpdDepartmentId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading departments..." : "Select department"}</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Doctor">
                      <select value={opdDoctorId} onChange={(e) => setOpdDoctorId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading doctors..." : "Select doctor"}</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.specialization || "Consultant"}</option>)}
                      </select>
                    </Field>
                    <Field label="Priority">
                      <select value={opdPriority} onChange={(e) => setOpdPriority(e.target.value as "NORMAL" | "URGENT" | "CRITICAL")} className={inputCls}>
                        <option>NORMAL</option>
                        <option>URGENT</option>
                        <option>CRITICAL</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Chief Complaint / Reason">
                    <input value={opdComplaint} onChange={(e) => setOpdComplaint(e.target.value)} placeholder="e.g. Fever for 3 days, acute abdominal pain..." className={inputCls} />
                  </Field>
                </div>
              )}

              {/* IPD Bed/Cabin Details Sub-Panel */}
              {ipdEnabled && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bed className="w-4 h-4 text-indigo-700" />
                      <h4 className="font-bold text-slate-900 text-sm">IPD / Bed / Cabin Details</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIpdEnabled(false); setErrorMsg(null); }}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-100/60 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition"
                    >
                      ✕ বাদ দিন (Remove IPD)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Department">
                      <select value={ipdDepartmentId} onChange={(e) => setIpdDepartmentId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading departments..." : "Select department"}</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Attending Doctor">
                      <select value={ipdDoctorId} onChange={(e) => setIpdDoctorId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading doctors..." : "Select doctor"}</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                      </select>
                    </Field>
                    <Field label="Referral Agent">
                      <select value={referralAgentId} onChange={(e) => setReferralAgentId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading referral agents..." : "None"}</option>
                        {referrals.map((r) => <option key={r.id} value={r.id}>{r.agent_code} — {r.full_name}</option>)}
                      </select>
                    </Field>
                  </div>
                  {availableBeds.length === 0 && availableCabins.length === 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{loadingOptions ? "Loading availability..." : "No vacant beds or cabins are currently available in IPD."}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Available Bed (খালি বেড)">
                      <select
                        id="field-ipd-bed"
                        value={ipdBedId}
                        onChange={(e) => { setIpdBedId(e.target.value); setIpdCabinId(""); setErrorMsg(null); }}
                        className={inputCls + (highlightField === "field-ipd-bed" ? " ring-2 ring-rose-500 border-rose-500" : "")}
                      >
                        <option value="">{loadingOptions ? "Loading beds..." : availableBeds.length === 0 ? "No available beds" : "Select available bed"}</option>
                        {availableBeds.map((b) => <option key={b.id} value={b.id}>{b.bed_number} • {b.ward_name || "Ward"} • {b.daily_rate} BDT/day</option>)}
                      </select>
                    </Field>
                    <Field label="Available Cabin (খালি কেবিন)">
                      <select
                        value={ipdCabinId}
                        onChange={(e) => { setIpdCabinId(e.target.value); setIpdBedId(""); setErrorMsg(null); }}
                        className={inputCls}
                      >
                        <option value="">{loadingOptions ? "Loading cabins..." : availableCabins.length === 0 ? "No available cabins" : "Select available cabin"}</option>
                        {availableCabins.map((c) => <option key={c.id} value={c.id}>{c.cabin_number} • {c.cabin_type || "Cabin"} • {c.daily_rate} BDT/day</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Provisional Diagnosis">
                    <input value={ipdDiagnosis} onChange={(e) => setIpdDiagnosis(e.target.value)} placeholder="Provisional admission diagnosis" className={inputCls} />
                  </Field>
                </div>
              )}

              {/* Critical Care Details Sub-Panel */}
              {criticalEnabled && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Critical Care Details (আইসিইউ / সিসিইউ)</h4>
                    <button
                      type="button"
                      onClick={() => { setCriticalEnabled(false); setErrorMsg(null); }}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-100/60 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition"
                    >
                      ✕ বাদ দিন (Remove Critical Care)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Unit *">
                      <select
                        id="field-critical-unit"
                        value={criticalUnitId}
                        onChange={(e) => {
                          const unitId = e.target.value;
                          setCriticalUnitId(unitId);
                          // Auto-select first matching bed for this unit
                          const matchingBed = availableBeds.find((b) => b.critical_care_unit_id === unitId) ||
                            availableBeds.find((b) => /ICU|CCU|HDU|SICU/i.test((b.ward_name || "") + " " + b.bed_number)) ||
                            availableBeds[0];
                          if (matchingBed) {
                            setCriticalBedNumber(matchingBed.bed_number);
                          }
                          setErrorMsg(null);
                        }}
                        className={inputCls + (highlightField === "field-critical-unit" ? " ring-2 ring-rose-500 border-rose-500" : "")}
                      >
                        <option value="">{loadingOptions ? "Loading units..." : "Select unit"}</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.unit_name} • {u.daily_charge} BDT/day</option>)}
                      </select>
                    </Field>
                    <Field label="Critical-Care Bed *">
                      <select
                        id="field-critical-bed"
                        value={criticalBedNumber}
                        onChange={(e) => { setCriticalBedNumber(e.target.value); setErrorMsg(null); }}
                        className={inputCls + (highlightField === "field-critical-bed" ? " ring-2 ring-rose-500 border-rose-500" : "")}
                      >
                        <option value="">{loadingOptions ? "Loading beds..." : "Select available bed"}</option>
                        {(() => {
                          const filtered = availableBeds.filter((b) => {
                            if (criticalUnitId && b.critical_care_unit_id === criticalUnitId) return true;
                            if (selectedUnit && (
                              (b.ward_name && b.ward_name.toLowerCase().includes(selectedUnit.unit_type.toLowerCase())) ||
                              b.bed_number.toLowerCase().includes(selectedUnit.unit_type.toLowerCase())
                            )) return true;
                            return /ICU|CCU|ICCU|SICU|MICU|PICU/i.test((b.ward_name || "") + " " + b.bed_number);
                          });
                          const list = filtered.length > 0 ? filtered : availableBeds;
                          return list.map((b) => (
                            <option key={b.id} value={b.bed_number}>
                              {b.bed_number} • {b.ward_name || "Critical Care"}
                            </option>
                          ));
                        })()}
                      </select>
                    </Field>
                    <Field label="Admitting Doctor">
                      <select value={criticalDoctorId} onChange={(e) => setCriticalDoctorId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading doctors..." : "Select doctor"}</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Initial Diagnosis">
                    <input value={criticalDiagnosis} onChange={(e) => setCriticalDiagnosis(e.target.value)} placeholder="e.g. Acute respiratory failure, post-op monitoring..." className={inputCls} />
                  </Field>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={ventilatorRequired} onChange={(e) => setVentilatorRequired(e.target.checked)} className="rounded" />
                    <span>Ventilator required (ভেন্টিলেটর প্রয়োজন)</span>
                  </label>
                </div>
              )}

              {/* OT Booking Details Sub-Panel */}
              {otEnabled && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scissors className="w-4 h-4 text-purple-700" />
                      <h4 className="font-bold text-slate-900 text-sm">Operation Theatre (OT) Booking & Surgery Details</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setOtEnabled(false); setErrorMsg(null); }}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-100/60 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition"
                    >
                      ✕ বাদ দিন (Remove OT)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="OT Room / Suite">
                      <select value={otRoomId} onChange={(e) => setOtRoomId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading OT rooms..." : "Select OT room / theatre"}</option>
                        {otRooms.map((r) => <option key={r.id} value={r.id}>{r.room_name} ({r.room_number})</option>)}
                      </select>
                    </Field>
                    <Field label="Primary Surgeon">
                      <select value={otDoctorId} onChange={(e) => setOtDoctorId(e.target.value)} className={inputCls}>
                        <option value="">{loadingOptions ? "Loading surgeons..." : "Select lead surgeon"}</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.specialization || "Surgeon"}</option>)}
                      </select>
                    </Field>
                    <Field label="Anesthesia Type">
                      <select value={otAnesthesia} onChange={(e) => setOtAnesthesia(e.target.value)} className={inputCls}>
                        <option value="GENERAL">General Anesthesia (GA)</option>
                        <option value="SPINAL">Spinal Anesthesia</option>
                        <option value="EPIDURAL">Epidural Anesthesia</option>
                        <option value="LOCAL">Local Anesthesia (LA)</option>
                        <option value="SEDATION">IV Sedation / MAC</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Surgery / Procedure Name">
                      <input
                        value={otProcedure}
                        onChange={(e) => setOtProcedure(e.target.value)}
                        placeholder="e.g. Caesarean Section, Appendectomy..."
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Scheduled Start Time">
                      <input
                        type="datetime-local"
                        value={otScheduledAt}
                        onChange={(e) => setOtScheduledAt(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Estimated OT & Surgery Charge (BDT)">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={otCharge}
                        onChange={(e) => setOtCharge(Math.max(0, Number(e.target.value) || 0))}
                        className={inputCls + " font-mono font-bold text-purple-700"}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </section>

            {/* Estimated Charge Preview */}
            {(opdEnabled || ipdEnabled || criticalEnabled || otEnabled) && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">Initial Charge Preview</h3>
                    <p className="text-[11px] text-slate-500">IPD/Critical Care preview is one configured daily unit; OT and OPD are booked procedures; final billing is calculated from exact items.</p>
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
                  {otEnabled && <span className="px-2 py-1 rounded-lg bg-white border text-purple-700 border-purple-200">OT Surgery</span>}
                </div>
              </section>
            )}

            {/* Duplicate Patient Warning Banner */}
            {duplicateWarning && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-black text-amber-900 text-sm">Potential Duplicate Patient</div>
                    <p className="text-xs text-amber-800 mt-1">{duplicateWarning}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {duplicateMatches && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode("EXISTING");
                            setErrorMsg("Search and select the matching patient.");
                          }}
                          className="px-3 py-1.5 rounded-xl border border-amber-400 bg-white text-xs font-bold text-amber-900 hover:bg-amber-100"
                        >
                          Switch to Existing Patient
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void submit(true)}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 disabled:opacity-50"
                      >
                        Continue Anyway (Audited Override)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Error Banner */}
            {errorMsg && (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <span className="font-semibold leading-relaxed">{errorMsg}</span>
                </div>
                {/* 1-Click Quick Resolve Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {criticalEnabled && errorMsg.includes("Critical Care") && (
                    <button
                      type="button"
                      onClick={() => {
                        setCriticalEnabled(false);
                        setErrorMsg(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition"
                    >
                      ক্রিটিক্যাল কেয়ার ছাড়া এগিয়ে যান (Continue Without CC)
                    </button>
                  )}
                  {ipdEnabled && errorMsg.includes("আইপিডি") && (
                    <button
                      type="button"
                      onClick={() => {
                        setIpdEnabled(false);
                        setErrorMsg(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition"
                    >
                      আইপিডি ছাড়া এগিয়ে যান (Continue Without IPD)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modal Action Footer */}
          <div className="border-t border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/70">
            <div className="text-[11px] text-slate-500">
              One submission = one atomic transaction. A failure rolls back all selected admissions.
            </div>
            <div className="flex flex-wrap gap-2 justify-end items-center">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 font-bold text-xs text-slate-700 transition"
              >
                Cancel
              </button>

              {/* 1-Click "Register Patient Only" Button (Always accessible for new patients) */}
              {mode === "NEW" && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitPatientOnly}
                  className="px-4 py-2.5 rounded-xl border border-sky-300 bg-sky-50/80 hover:bg-sky-100 text-sky-800 font-bold text-xs disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>👤 শুধু রোগী নিবন্ধন (Register Patient Only)</span>
                </button>
              )}

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs disabled:opacity-50 flex items-center justify-center shadow-md transition"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                {mode === "EXISTING"
                  ? (opdEnabled || ipdEnabled || criticalEnabled || otEnabled ? "ভর্তি ও সেবা নিশ্চিত করুন (Admit / Create Services)" : "রোগী নিশ্চিত করুন (Confirm Patient)")
                  : (opdEnabled || ipdEnabled || criticalEnabled || otEnabled ? "নিবন্ধন ও ভর্তি সম্পন্ন করুন (Register & Create Admissions)" : "রোগী নিবন্ধন করুন (Register Patient)")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition";
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-600 mb-1">{label}</label>
    {children}
  </div>
);

function ServiceCard({ title, subtitle, enabled, onClick }: { title: string; subtitle: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"text-left p-4 rounded-2xl border-2 transition " + (enabled ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")}
    >
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
