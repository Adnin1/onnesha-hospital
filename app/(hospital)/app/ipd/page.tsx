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
  FileText,
  X,
  Trash2,
  Calendar,
  Stethoscope,
  Pill,
  Edit3,
  Save,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateBDT, formatPatientAgeDisplay } from "@/lib/utils";
import { UnifiedPatientIntakeModal } from "@/components/patient/UnifiedPatientIntakeModal";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import {
  createIpdAdmissionAction,
  dischargePatientAction,
  transferPatientAction,
  getDischargeSummaryAction,
  cancelOrDeleteIpdAdmissionAction,
  updateIpdAdmissionAction,
  updateIpdTreatmentPlanAction,
} from "@/lib/patient/actions";
import { searchReferralAgentsAction } from "@/lib/referrals/actions";
import { getCurrentUserSession } from "@/lib/auth/session";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { DoctorRecord } from "@/types/appointments";
import {
  DischargeSummaryPrint,
  DischargeSummaryPrintProps,
} from "@/components/print/DischargeSummaryPrint";

interface InpatientRecord {
  id: string; // visit_id
  visit_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  phone: string;
  gender: string;
  age?: number | string;
  age_months?: number;
  age_days?: number;
  dob?: string;
  address?: string;
  guardian_name?: string;
  guardian_phone?: string;
  blood_group?: string;
  bed_id?: string;
  bed_number?: string;
  ward_name?: string;
  admitted_at: string;
  doctor_id?: string;
  doctor_name: string;
  notes?: string;
  clinical_findings?: string;
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
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showCancelAdmissionModal, setShowCancelAdmissionModal] = useState(false);
  const [cancelAdmissionReason, setCancelAdmissionReason] = useState("");
  const [cancelAdmissionPermanent, setCancelAdmissionPermanent] = useState(false);
  const [cancellingAdmission, setCancellingAdmission] = useState(false);
  const [showEditAdmissionModal, setShowEditAdmissionModal] = useState(false);
  const [editingAdmission, setEditingAdmission] = useState(false);
  const [editAdmissionForm, setEditAdmissionForm] = useState({
    provisionalDiagnosis: "",
    doctorId: "",
    guardianName: "",
    guardianPhone: "",
    notes: "",
    clinicalFindings: "",
  });

  // Form states
  const [admissionForm, setAdmissionForm] = useState({
    patientCodeOrId: "",
    provisionalDiagnosis: "",
    bedId: "",
    referralAgentId: "",
    dailyRate: "1000",
    dailyServiceCharge: "500",
    admissionFee: "300",
  });
  const [availableReferrals, setAvailableReferrals] = useState<
    { id: string; agent_code: string; full_name: string }[]
  >([]);

  const [transferForm, setTransferForm] = useState({
    toBedId: "",
    reason: "",
  });

  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [certificatePrintProps, setCertificatePrintProps] = useState<DischargeSummaryPrintProps | null>(null);

  const [dischargeForm, setDischargeForm] = useState({
    dischargeType: "NORMAL" as "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED",
    finalDiagnosis: "",
    hospitalCourse: "",
    conditionAtDischarge: "STABLE",
    dischargeAdvice: "নিয়মিত ওষুধ সেবন করবেন। পর্যাপ্ত বিশ্রাম নিবেন। ভারী কাজ থেকে বিরত থাকবেন।",
    followupInstructions: "৭ দিন পর বহির্বিভাগে কনসালট্যান্ট ডাক্তারের সাথে দেখা করবেন।",
    consultantDoctorId: "",
    consultantName: "",
    consultantDesignation: "",
    bmdcRegNumber: "",
    presentingFeatures: "",
    investigationsSummary: "",
    operationName: "",
    operationDate: "",
    operationTime: "",
    indication: "",
    surgeonName: "",
    assistantSurgeons: "",
    assistantSurgeon1: "",
    assistantSurgeon2: "",
    anaesthetistName: "",
    anaesthesiaType: "",
    operativeFindings: "",
    babySex: "",
    babyWeightKg: "",
    babyApgarScore: "",
    babyNotes: "",
    medications: [
      { name: "Tab. Cefuroxime (500mg)", formulation: "Tab.", dosage: "1+0+1", timing: "খাবার পর", duration: "7 days", instructions: "নিয়মিত খাবেন" },
      { name: "Tab. Paracetamol (500mg)", formulation: "Tab.", dosage: "1+1+1", timing: "ভরা পেটে", duration: "5 days", instructions: "ব্যথা বা জ্বর হলে" },
      { name: "Cap. Esomeprazole (20mg)", formulation: "Cap.", dosage: "1+0+1", timing: "খাবার ৩০ মিনিট আগে", duration: "14 days", instructions: "খালি পেটে" },
    ],
    stitchRemovalDate: "",
    restDays: "১৫",
    heavyWorkRestrictionDays: "১ মাস",
    followupDate: "",
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [refreshIndex, setRefreshIndex] = useState(0);
  const [currentTreatmentPlan, setCurrentTreatmentPlan] = useState("");
  const [savingTreatmentPlan, setSavingTreatmentPlan] = useState(false);

  useEffect(() => {
    if (selectedAdmission) {
      setCurrentTreatmentPlan(selectedAdmission.clinical_findings || selectedAdmission.notes || "");
    } else {
      setCurrentTreatmentPlan("");
    }
  }, [selectedAdmission?.id, selectedAdmission?.clinical_findings, selectedAdmission?.notes]);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();

        const session = await getCurrentUserSession();
        const orgId = session?.organizationId;
        if (!orgId) {
          setLoading(false);
          return;
        }

        // 1. Fetch active IPD visits
        const { data: visitsData, error: vErr } = await supabase
          .from("patient_visits")
          .select(`
            id,
            visit_number,
            patient_id,
            doctor_id,
            chief_complaint,
            admitted_at,
            status,
            patients (
              id,
              patient_code,
              full_name,
              phone,
              gender,
              age,
              age_months,
              age_days,
              dob,
              address,
              guardian_name,
              blood_group
            ),
            bed_assignments (
              id,
              bed_id,
              cabin_id,
              status,
              beds (
                id,
                bed_number,
                wards (
                  name
                )
              ),
              cabins (
                id,
                cabin_number,
                cabin_type
              )
            )
          `)
          .eq("organization_id", orgId)
          .eq("visit_type", "IPD")
          .eq("status", "ACTIVE")
          .order("admitted_at", { ascending: false });

        if (!vErr && visitsData) {
          interface VisitItem {
            id: string;
            visit_number: string;
            patient_id: string;
            doctor_id?: string;
            chief_complaint: string | null;
            admitted_at: string;
            status: string;
            patients: {
              id: string;
              patient_code: string;
              full_name: string;
              phone: string;
              gender: string;
              age?: number | string;
              age_months?: number;
              age_days?: number;
              dob?: string;
              address?: string;
              guardian_name?: string;
  guardian_phone?: string;
              blood_group?: string;
            } | null;
            bed_assignments: Array<{
              id: string;
              bed_id?: string | null;
              cabin_id?: string | null;
              status: string;
              beds?: {
                id: string;
                bed_number: string;
                wards: { name: string } | null;
              } | null;
              cabins?: {
                id: string;
                cabin_number: string;
                cabin_type: string;
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
              age: v.patients?.age,
              age_months: v.patients?.age_months,
              age_days: v.patients?.age_days,
              dob: v.patients?.dob,
              address: v.patients?.address,
              guardian_name: v.patients?.guardian_name,
              blood_group: v.patients?.blood_group,
              bed_id: activeBedAssign?.beds?.id || activeBedAssign?.cabins?.id,
              bed_number: activeBedAssign?.cabins?.cabin_number
                ? `Cabin: ${activeBedAssign.cabins.cabin_number}`
                : (activeBedAssign?.beds?.bed_number || "UNASSIGNED"),
              ward_name: activeBedAssign?.cabins?.cabin_type
                ? `Cabin (${activeBedAssign.cabins.cabin_type})`
                : (activeBedAssign?.beds?.wards?.name || "General IPD"),
              admitted_at: v.admitted_at,
              doctor_id: v.doctor_id,
              doctor_name: "Attending Consultant",
              guardian_phone: v.patients?.phone,
              notes: v.chief_complaint || undefined,
              clinical_findings: v.chief_complaint || undefined,
              provisional_diagnosis: v.chief_complaint || "Acute Condition Requiring Inpatient Care",
              status: "ADMITTED",
            };
          });

          setInpatients(mapped);
          setSelectedAdmission((prev) => {
            if (!prev) return mapped[0] || null;
            const stillActive = mapped.find((m) => m.id === prev.id);
            return stillActive || mapped[0] || null;
          });
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
          .eq("organization_id", orgId)
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

        // Fetch active referral partners
        try {
          const refRes = await searchReferralAgentsAction();
          if (refRes.success && refRes.data) {
            setAvailableReferrals(refRes.data);
          }
        } catch {
          // Non-blocking for IPD load
        }

        // Fetch doctors for consultant assignment
        try {
          const docRes = await getDoctorsAction();
          if (docRes.success && docRes.data?.doctors) {
            setDoctors(docRes.data.doctors);
          }
        } catch {
          // Non-blocking for IPD load
        }
      } catch (err: unknown) {
        console.error("[IPD loadData] error:", err);
        setActionError("Failed to load IPD patient and bed directory.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [refreshIndex]);

  const handleOpenCertificatePrint = async (record: InpatientRecord) => {
    try {
      const summaryRes = await getDischargeSummaryAction({ visitId: record.id });
      if (summaryRes.success && summaryRes.data?.summary) {
        const s = summaryRes.data.summary;
        setCertificatePrintProps({
          admissionNumber: record.visit_number,
          dischargeDateStr: s.created_at || new Date().toISOString(),
          admissionDateStr: record.admitted_at,
          patient: {
            name: record.patient_name,
            patientCode: record.patient_code,
            age: formatPatientAgeDisplay(record.age, record.age_months, record.age_days, record.dob),
            gender: record.gender,
            phone: record.phone,
            address: record.address,
            guardianName: record.guardian_name,
            bloodGroup: record.blood_group,
          },
          wardName: record.ward_name || "General IPD",
          bedNumber: record.bed_number || "Bed",
          consultantDoctorName: s.consultant_name || record.doctor_name || "Consultant Physician",
          consultantDesignation: s.consultant_designation || "Senior Consultant",
          bmdcRegNumber: s.bmdc_reg_number || "A-XXXXX",
          dutyDoctorName: "Medical Officer on Duty",
          admissionDiagnosis: record.provisional_diagnosis,
          finalDiagnosis: s.final_diagnosis || record.provisional_diagnosis,
          hospitalCourseSummary: s.hospital_course || "",
          presentingFeatures: s.presenting_features || "",
          investigationsSummary: s.investigations_summary || "",
          operationDetails: s.operation_name
            ? {
                operationName: s.operation_name,
                operationDate: s.operation_date || undefined,
                operationTime: s.operation_time || undefined,
                surgeonName: s.surgeon_name || undefined,
                assistantSurgeons: s.assistant_surgeons || undefined,
                anaesthetistName: s.anaesthetist_name || undefined,
                anaesthesiaType: s.anaesthesia_type || undefined,
                operativeFindings: s.operative_findings || undefined,
              }
            : undefined,
          babyNote: s.baby_sex
            ? {
                sex: s.baby_sex,
                weightKg: s.baby_weight_kg || undefined,
                apgarScore: s.baby_apgar_score || undefined,
                notes: s.baby_notes || undefined,
              }
            : undefined,
          takeHomeMedications: ((s.medications_schedule as Array<Record<string, unknown>>) || []).map((m) => ({
            name: String(m.name || ""),
            dosage: String(m.dosage || ""),
            duration: String(m.duration || ""),
            instructions: m.instructions ? String(m.instructions) : undefined,
            timing: m.timing ? String(m.timing) : undefined,
            formulation: m.formulation ? String(m.formulation) : undefined,
          })),
          stitchRemovalDate: s.stitch_removal_date || undefined,
          restDays: "১৫",
          heavyWorkRestrictionDays: "১ মাস",
          followupDate: s.followup_date || undefined,
          followUpInstructions: s.followup_instructions || s.discharge_advice || undefined,
        });
      } else {
        // Fallback live preview for inpatient
        setCertificatePrintProps({
          admissionNumber: record.visit_number,
          dischargeDateStr: new Date().toISOString(),
          admissionDateStr: record.admitted_at,
          patient: {
            name: record.patient_name,
            patientCode: record.patient_code,
            age: formatPatientAgeDisplay(record.age, record.age_months, record.age_days, record.dob),
            gender: record.gender,
            phone: record.phone,
            address: record.address,
            guardianName: record.guardian_name,
            bloodGroup: record.blood_group,
          },
          wardName: record.ward_name || "General IPD",
          bedNumber: record.bed_number || "Bed",
          consultantDoctorName: record.doctor_name || "Consultant Physician",
          consultantDesignation: "Attending Consultant",
          bmdcRegNumber: "A-XXXXX",
          dutyDoctorName: "Medical Officer on Duty",
          admissionDiagnosis: record.provisional_diagnosis,
          finalDiagnosis: record.provisional_diagnosis,
          hospitalCourseSummary: "Inpatient admission active. Clinical management in progress.",
          presentingFeatures: record.provisional_diagnosis,
          stitchRemovalDate: "১০ দিন পর",
          restDays: "১৫",
          heavyWorkRestrictionDays: "১ মাস",
          followupDate: "৭ দিন পর",
          followUpInstructions: "নিয়মিত ওষুধ খাবেন। যেকোনো সমস্যায় হাসপাতালে যোগাযোগ করবেন।",
          takeHomeMedications: [
            {
              name: "Tab. Cefuroxime (500mg)",
              formulation: "Tab.",
              dosage: "1+0+1",
              timing: "খাবার পর",
              duration: "7 days",
              instructions: "নিয়মিত খাবেন",
            },
          ],
        });
      }
    } catch (err) {
      console.error("[handleOpenCertificatePrint] error:", err);
    }
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
        referralAgentId: admissionForm.referralAgentId || undefined,
        dailyRate: Number(admissionForm.dailyRate) || 1000,
        dailyServiceCharge: Number(admissionForm.dailyServiceCharge) || 500,
        admissionFee: Number(admissionForm.admissionFee) || 300,
      });

      if (!res.success) {
        setActionError(res.error || "Admission failed.");
      } else {
        setActionSuccess("Patient successfully admitted to IPD.");
        setShowAdmissionModal(false);
        setAdmissionForm({
          patientCodeOrId: "",
          provisionalDiagnosis: "",
          bedId: "",
          referralAgentId: "",
          dailyRate: "1000",
          dailyServiceCharge: "500",
          admissionFee: "300",
        });
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

  // Handle Cancel / Delete Mistake Admission Submission
  const handleCancelAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setCancellingAdmission(true);
    setActionError(null);
    try {
      const res = await cancelOrDeleteIpdAdmissionAction({
        visitId: selectedAdmission.id,
        reason: cancelAdmissionReason.trim() || "Mistake admission entry cancelled by admin",
        permanentDelete: cancelAdmissionPermanent,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to cancel admission.");
      } else {
        setActionSuccess(res.data?.message || "ভর্তি সফলভাবে বাতিল করা হয়েছে এবং বেড মুক্ত করা হয়েছে।");
        setShowCancelAdmissionModal(false);
        setSelectedAdmission(null);
        setCancelAdmissionReason("");
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error cancelling admission.");
    } finally {
      setCancellingAdmission(false);
    }
  };

  // Handle Edit / Update IPD Admission Submission
  const handleUpdateAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setEditingAdmission(true);
    setActionError(null);
    try {
      const res = await updateIpdAdmissionAction({
        visitId: selectedAdmission.id,
        provisionalDiagnosis: editAdmissionForm.provisionalDiagnosis,
        doctorId: editAdmissionForm.doctorId || undefined,
        guardianName: editAdmissionForm.guardianName || undefined,
        guardianPhone: editAdmissionForm.guardianPhone || undefined,
        notes: editAdmissionForm.notes || undefined,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update admission details.");
      } else {
        setActionSuccess(res.data?.message || "ভর্তি তথ্য সফলভাবে সংশোধন করা হয়েছে।");
        setShowEditAdmissionModal(false);
        setRefreshIndex((prev) => prev + 1);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error updating admission.");
    } finally {
      setEditingAdmission(false);
    }
  };

  const handleSaveTreatmentPlan = async () => {
    if (!selectedAdmission) return;
    setSavingTreatmentPlan(true);
    setActionError(null);
    try {
      const res = await updateIpdTreatmentPlanAction({
        visitId: selectedAdmission.id,
        treatmentPlan: currentTreatmentPlan,
      });
      if (res.success) {
        setActionSuccess(res.data?.message || "চিকিৎসা ও পরামর্শ সফলভাবে সংরক্ষিত হয়েছে।");
        setInpatients((prev) =>
          prev.map((adm) =>
            adm.id === selectedAdmission.id
              ? { ...adm, clinical_findings: currentTreatmentPlan, notes: currentTreatmentPlan }
              : adm
          )
        );
        setSelectedAdmission((prev) =>
          prev ? { ...prev, clinical_findings: currentTreatmentPlan, notes: currentTreatmentPlan } : prev
        );
      } else {
        setActionError(res.error || "চিকিৎসা পরামর্শ সংরক্ষণ করতে ব্যর্থ হয়েছে।");
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error saving treatment plan.");
    } finally {
      setSavingTreatmentPlan(false);
    }
  };

  // Handle Discharge Submission
  const handleDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;
    setActionError(null);
    setSubmitting(true);

    try {
      const activeMedications = dischargeForm.medications.filter((m) => m.name.trim().length > 0);
      const res = await dischargePatientAction({
        visitId: selectedAdmission.id,
        dischargeType: dischargeForm.dischargeType,
        finalDiagnosis: dischargeForm.finalDiagnosis,
        hospitalCourse: dischargeForm.hospitalCourse,
        conditionAtDischarge: dischargeForm.conditionAtDischarge,
        dischargeAdvice: dischargeForm.dischargeAdvice,
        followupInstructions: dischargeForm.followupInstructions,
        consultantDoctorId: dischargeForm.consultantDoctorId || undefined,
        consultantName: dischargeForm.consultantName || undefined,
        consultantDesignation: dischargeForm.consultantDesignation || undefined,
        bmdcRegNumber: dischargeForm.bmdcRegNumber || undefined,
        presentingFeatures: dischargeForm.presentingFeatures || undefined,
        investigationsSummary: dischargeForm.investigationsSummary || undefined,
        operationName: dischargeForm.operationName || undefined,
        operationDate: dischargeForm.operationDate || undefined,
        operationTime: dischargeForm.operationTime || undefined,
        surgeonName: dischargeForm.surgeonName || undefined,
        assistantSurgeons: dischargeForm.assistantSurgeons || undefined,
        anaesthetistName: dischargeForm.anaesthetistName || undefined,
        anaesthesiaType: dischargeForm.anaesthesiaType || undefined,
        operativeFindings: dischargeForm.operativeFindings || undefined,
        babySex: dischargeForm.babySex || undefined,
        babyWeightKg: dischargeForm.babyWeightKg ? parseFloat(dischargeForm.babyWeightKg) : undefined,
        babyApgarScore: dischargeForm.babyApgarScore || undefined,
        babyNotes: dischargeForm.babyNotes || undefined,
        medicationsSchedule: activeMedications,
        stitchRemovalDate: dischargeForm.stitchRemovalDate || undefined,
        followupDate: dischargeForm.followupDate || undefined,
      });

      if (!res.success) {
        setActionError(res.error || "Discharge failed.");
      } else {
        setActionSuccess("Patient discharged successfully. Discharge certificate generated.");
        setShowDischargeModal(false);
        // Automatically open the 4-part certificate preview
        setCertificatePrintProps({
          admissionNumber: selectedAdmission.visit_number,
          dischargeDateStr: new Date().toISOString(),
          admissionDateStr: selectedAdmission.admitted_at,
          patient: {
            name: selectedAdmission.patient_name,
            patientCode: selectedAdmission.patient_code,
            age: selectedAdmission.age,
            gender: selectedAdmission.gender,
            phone: selectedAdmission.phone,
            address: selectedAdmission.address,
            guardianName: selectedAdmission.guardian_name,
            bloodGroup: selectedAdmission.blood_group,
          },
          wardName: selectedAdmission.ward_name || "General IPD",
          bedNumber: selectedAdmission.bed_number || "Bed",
          consultantDoctorName: dischargeForm.consultantName || selectedAdmission.doctor_name || "Consultant Physician",
          consultantDesignation: dischargeForm.consultantDesignation || "Senior Consultant",
          bmdcRegNumber: dischargeForm.bmdcRegNumber || "A-XXXXX",
          dutyDoctorName: "Medical Officer on Duty",
          admissionDiagnosis: selectedAdmission.provisional_diagnosis,
          finalDiagnosis: dischargeForm.finalDiagnosis,
          hospitalCourseSummary: dischargeForm.hospitalCourse,
          presentingFeatures: dischargeForm.presentingFeatures,
          investigationsSummary: dischargeForm.investigationsSummary,
          operationDetails: dischargeForm.operationName
            ? {
                operationName: dischargeForm.operationName,
                operationDate: dischargeForm.operationDate || undefined,
                operationTime: dischargeForm.operationTime || undefined,
                indication: dischargeForm.indication || dischargeForm.finalDiagnosis,
                surgeonName: dischargeForm.surgeonName || undefined,
                assistantSurgeons: dischargeForm.assistantSurgeons || undefined,
                assistantSurgeon1: dischargeForm.assistantSurgeon1 || undefined,
                assistantSurgeon2: dischargeForm.assistantSurgeon2 || undefined,
                anaesthetistName: dischargeForm.anaesthetistName || undefined,
                anaesthesiaType: dischargeForm.anaesthesiaType || undefined,
                operativeFindings: dischargeForm.operativeFindings || undefined,
              }
            : undefined,
          babyNote: dischargeForm.babySex
            ? {
                sex: dischargeForm.babySex,
                weightKg: dischargeForm.babyWeightKg ? parseFloat(dischargeForm.babyWeightKg) : undefined,
                apgarScore: dischargeForm.babyApgarScore || undefined,
                notes: dischargeForm.babyNotes || undefined,
              }
            : undefined,
          takeHomeMedications: activeMedications,
          stitchRemovalDate: dischargeForm.stitchRemovalDate || undefined,
          restDays: dischargeForm.restDays || "১৫",
          heavyWorkRestrictionDays: dischargeForm.heavyWorkRestrictionDays || "১ মাস",
          followupDate: dischargeForm.followupDate || undefined,
          followUpInstructions: dischargeForm.followupInstructions || dischargeForm.dischargeAdvice,
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
    <>
      <div className={`space-y-6 ${certificatePrintProps ? "print:hidden" : ""}`}>
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
                        {b.ward_name} • Code: {b.patient_code} • {formatPatientAgeDisplay(b.age, b.age_months, b.age_days, b.dob)}
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
                        setEditAdmissionForm({
                          provisionalDiagnosis: selectedAdmission.provisional_diagnosis || "",
                          doctorId: selectedAdmission.doctor_id || "",
                          guardianName: selectedAdmission.guardian_name || "",
                          guardianPhone: selectedAdmission.guardian_phone || selectedAdmission.phone || "",
                          notes: selectedAdmission.notes || "",
                          clinicalFindings: selectedAdmission.clinical_findings || "",
                        });
                        setShowEditAdmissionModal(true);
                      }}
                      className="inline-flex items-center bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      title="ভর্তি তথ্য সংশোধন করুন (Edit Provisional Diagnosis, Doctor, Guardian)"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                      ভর্তি তথ্য সংশোধন
                    </button>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setCancelAdmissionReason("ভুলবশত এন্ট্রি করা হয়েছিল (Mistake admission)");
                        setCancelAdmissionPermanent(true);
                        setShowCancelAdmissionModal(true);
                      }}
                      className="inline-flex items-center bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      title="ভুল ভর্তি বাতিল বা ডাটাবেজ থেকে মুছুন (Cancel / Delete Mistake Admission)"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                      ভর্তি বাতিল / মুছুন
                    </button>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setDischargeForm((prev) => ({
                          ...prev,
                          finalDiagnosis: selectedAdmission.provisional_diagnosis || "",
                          consultantDoctorId: selectedAdmission.doctor_id || "",
                          consultantName: selectedAdmission.doctor_name || "",
                        }));
                        setShowDischargeModal(true);
                      }}
                      className="inline-flex items-center bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                      Discharge
                    </button>
                    <button
                      onClick={() => handleOpenCertificatePrint(selectedAdmission)}
                      className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-2xs"
                      title="View & Print Authentic 4-Part Discharge Certificate Folder"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      Discharge Certificate
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      title="Print Inpatient Admission Sheet"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
                      Print Sheet
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
                        ID: {selectedAdmission.patient_code} | Gender: {selectedAdmission.gender} | Age: {formatPatientAgeDisplay(selectedAdmission.age, selectedAdmission.age_months, selectedAdmission.age_days, selectedAdmission.dob)}
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

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 uppercase tracking-wide text-xs flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
                          ইনপেশেন্ট চিকিৎসা ও ডাক্তারের পরামর্শ (Treatment Plan & Clinical Advice):
                        </span>
                        <button
                          type="button"
                          disabled={savingTreatmentPlan}
                          onClick={handleSaveTreatmentPlan}
                          className="no-print inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-[11px] px-3 py-1 rounded-lg transition shadow-2xs cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          {savingTreatmentPlan ? "সংরক্ষণ হচ্ছে..." : "পরামর্শ সংরক্ষণ করুন"}
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={currentTreatmentPlan}
                        onChange={(e) => setCurrentTreatmentPlan(e.target.value)}
                        placeholder="রোগীর চিকিৎসা নির্দেশিকা, ঔষধের ডোজ ও ডাক্তারের পরামর্শ এখানে লিখুন..."
                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 leading-relaxed"
                      />
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

      {/* Unified Patient / Baby Intake Modal */}
      {showIntakeModal && (
        <UnifiedPatientIntakeModal
          isOpen={showIntakeModal}
          onClose={() => setShowIntakeModal(false)}
          onSuccess={(res) => {
            setShowIntakeModal(false);
            setRefreshIndex((prev) => prev + 1);
            setActionSuccess("রোগী / নবজাতক " + res.patient.full_name + " (" + res.patient.patient_code + ") সফলভাবে রেজিস্ট্রেশন সম্পন্ন হয়েছে।");
          }}
        />
      )}

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
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Patient Code or ID <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdmissionModal(false);
                      setShowIntakeModal(true);
                    }}
                    className="text-[11px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> + নতুন রোগী / নবজাতক
                  </button>
                </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2.5 bg-sky-50/70 rounded-xl border border-sky-100">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 text-[11px]">
                    বেড দৈনিক ভাড়া (৳)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={admissionForm.dailyRate}
                    onChange={(e) => setAdmissionForm({ ...admissionForm, dailyRate: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    placeholder="1000"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 text-[11px]">
                    দৈনিক সার্ভিস চার্জ (৳/দিন)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={admissionForm.dailyServiceCharge}
                    onChange={(e) => setAdmissionForm({ ...admissionForm, dailyServiceCharge: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    placeholder="500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1 text-[11px]">
                    ভর্তি ফি (এককালীন ৳)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={admissionForm.admissionFee}
                    onChange={(e) => setAdmissionForm({ ...admissionForm, admissionFee: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    placeholder="300"
                  />
                </div>
                <div className="col-span-full text-[10px] text-sky-700 font-medium">
                  * ভর্তি ফি (৳৩০০) এবং দৈনিক সার্ভিস চার্জ (৳৫০০) স্বয়ংক্রিয়ভাবে বিলিং তালিকায় যুক্ত হবে এবং কর্তৃপক্ষ প্রয়োজনমতো পরিবর্তন করতে পারবে।
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Referred By / Partner (Optional)
                </label>
                <select
                  value={admissionForm.referralAgentId}
                  onChange={(e) => setAdmissionForm({ ...admissionForm, referralAgentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden bg-white"
                >
                  <option value="">-- Direct Hospital Admission (No Referral) --</option>
                  {availableReferrals.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      {ref.agent_code} - {ref.full_name}
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

      {/* 4-Part IPD Discharge Certificate Modal */}
      {showDischargeModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">
                  Onnesha Hospital Clinical Sign-Off
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  Prepare Inpatient Discharge & 4-Part Certificate Folder
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Patient: <strong className="text-slate-800">{selectedAdmission.patient_name}</strong> • UHID:{" "}
                  <span className="font-mono">{selectedAdmission.patient_code}</span> • Ward/Bed:{" "}
                  <strong>
                    {selectedAdmission.ward_name} ({selectedAdmission.bed_number})
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDischargeModal(false)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDischargeSubmit} className="space-y-6 text-xs">
              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 text-rose-600 shrink-0" />
                  {actionError}
                </div>
              )}
              {/* Part 1: Consultant & Disposition */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Stethoscope className="w-4 h-4 text-sky-600" />
                  <h4 className="font-black text-slate-900 text-sm">
                    Part 1: Consultant Doctor & Discharge Disposition
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Attending Consultant Doctor <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={dischargeForm.consultantDoctorId}
                      onChange={(e) => {
                        const selectedDoc = doctors.find((d) => d.id === e.target.value);
                        setDischargeForm({
                          ...dischargeForm,
                          consultantDoctorId: e.target.value,
                          consultantName: selectedDoc?.full_name || "",
                          consultantDesignation: selectedDoc?.designation || "",
                          bmdcRegNumber: selectedDoc?.bmdc_reg_number || "",
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">-- Select Consultant Doctor --</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} ({d.designation}) — BMDC: {d.bmdc_reg_number || "N/A"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">BMDC Reg. Number</label>
                    <input
                      type="text"
                      placeholder="e.g. A-45210"
                      value={dischargeForm.bmdcRegNumber}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, bmdcRegNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="NORMAL">Normal / Recovered</option>
                      <option value="DOR">Discharged on Request (DOR)</option>
                      <option value="LAMA">Left Against Medical Advice (LAMA)</option>
                      <option value="REFERRED">Referred to Higher Center</option>
                      <option value="DECEASED">Deceased / Expired</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Condition at Discharge</label>
                    <select
                      value={dischargeForm.conditionAtDischarge}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, conditionAtDischarge: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="STABLE">Stable / Hemodynamically Stable</option>
                      <option value="IMPROVED">Improved / Afebrile</option>
                      <option value="CRITICAL">Critical / Under Observation</option>
                      <option value="EXPIRED">Deceased / Expired</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      Final Verified Diagnosis <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Primary confirmed diagnosis on discharge..."
                      value={dischargeForm.finalDiagnosis}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, finalDiagnosis: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Part 2: Clinical Summary & Course */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-black text-slate-900 text-sm">
                    Part 2: Clinical Summary, Presenting Complaints & Investigations
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Presenting Complaints & History</label>
                    <textarea
                      rows={4}
                      placeholder="e.g. Lower abdominal pain for 3 days, vomiting, high-grade fever..."
                      value={dischargeForm.presentingFeatures}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, presentingFeatures: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white min-h-[90px]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Investigations & Lab Findings</label>
                    <textarea
                      rows={4}
                      placeholder="e.g. CBC: Hb 11.2, TLC 12,400. USG of Whole Abdomen: Acute Appendicitis..."
                      value={dischargeForm.investigationsSummary}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, investigationsSummary: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white min-h-[90px]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Hospital Course & Clinical Treatment</label>
                    <textarea
                      rows={4}
                      placeholder="Treatment received, clinical response during inpatient hospital stay..."
                      value={dischargeForm.hospitalCourse}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, hospitalCourse: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white min-h-[100px]"
                    />
                  </div>
                </div>
              </div>

              {/* Part 3: Surgical / OT & Maternity Details (Optional) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <FileCheck className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-black text-slate-900 text-sm">
                    Part 3: Surgical / OT & Delivery Records (Optional)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Operation / Procedure Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Appendectomy / LUCS"
                      value={dischargeForm.operationName}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, operationName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Indication (অপারেশনের কারণ)</label>
                    <input
                      type="text"
                      placeholder="e.g. Acute Appendicitis / Foetal Distress"
                      value={dischargeForm.indication}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, indication: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Operation Date</label>
                    <input
                      type="date"
                      value={dischargeForm.operationDate}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, operationDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Operating Surgeon</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Md. Rafiqul Islam"
                      value={dischargeForm.surgeonName}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, surgeonName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Assistant Surgeon 1</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Tariqul Islam"
                      value={dischargeForm.assistantSurgeon1}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, assistantSurgeon1: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Assistant Surgeon 2</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Mahmudul Hasan"
                      value={dischargeForm.assistantSurgeon2}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, assistantSurgeon2: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Anaesthetist Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Anisur Rahman"
                      value={dischargeForm.anaesthetistName}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, anaesthetistName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Anaesthesia Type</label>
                    <input
                      type="text"
                      placeholder="e.g. Spinal Anaesthesia / GA"
                      value={dischargeForm.anaesthesiaType}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, anaesthesiaType: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Operative Findings</label>
                    <input
                      type="text"
                      placeholder="e.g. Inflamed appendicular tissue removed uneventfully"
                      value={dischargeForm.operativeFindings}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, operativeFindings: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                </div>

                {/* Maternity / Delivery sub-box */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 block mb-1 text-[11px]">Baby Sex</label>
                    <select
                      value={dischargeForm.babySex}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, babySex: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="">N/A (Non-Delivery)</option>
                      <option value="MALE">Male (পুত্র)</option>
                      <option value="FEMALE">Female (কন্যা)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1 text-[11px]">Birth Weight (Kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 2.85"
                      value={dischargeForm.babyWeightKg}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, babyWeightKg: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1 text-[11px]">APGAR Score</label>
                    <input
                      type="text"
                      placeholder="e.g. 8/10, 9/10"
                      value={dischargeForm.babyApgarScore}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, babyApgarScore: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1 text-[11px]">Baby Clinical Note</label>
                    <input
                      type="text"
                      placeholder="Cried immediately, breastfeeding started"
                      value={dischargeForm.babyNotes}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, babyNotes: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Part 4: Take-Home Medications Schedule (Rx) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-rose-600" />
                    <h4 className="font-black text-slate-900 text-sm">
                      Part 4: Take-Home Medications Schedule (Rx ছাড়পত্রের ওষুধ)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDischargeForm({
                        ...dischargeForm,
                        medications: [
                          ...dischargeForm.medications,
                          { name: "", formulation: "Tab.", dosage: "1+0+1", timing: "খাবার পর", duration: "7 days", instructions: "নিয়মিত খাবেন" },
                        ],
                      })
                    }
                    className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-[11px] flex items-center shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Medicine
                  </button>
                </div>

                <div className="space-y-2">
                  {dischargeForm.medications.map((med, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 p-2.5 bg-white rounded-xl border border-slate-200 items-center text-xs"
                    >
                      <div className="col-span-2">
                        <select
                          value={med.formulation}
                          onChange={(e) => {
                            const updated = [...dischargeForm.medications];
                            updated[idx].formulation = e.target.value;
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-slate-700 bg-slate-50"
                        >
                          <option value="Tab.">Tab.</option>
                          <option value="Cap.">Cap.</option>
                          <option value="Syr.">Syr.</option>
                          <option value="Inj.">Inj.</option>
                          <option value="Oint.">Oint.</option>
                          <option value="Drops">Drops</option>
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="Medicine Name (e.g. Cefuroxime 500mg)"
                          value={med.name}
                          onChange={(e) => {
                            const updated = [...dischargeForm.medications];
                            updated[idx].name = e.target.value;
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-medium"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Dosage (1+0+1)"
                          value={med.dosage}
                          onChange={(e) => {
                            const updated = [...dischargeForm.medications];
                            updated[idx].dosage = e.target.value;
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Duration (7 days)"
                          value={med.duration}
                          onChange={(e) => {
                            const updated = [...dischargeForm.medications];
                            updated[idx].duration = e.target.value;
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-center"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Instructions (খাবার পর)"
                          value={med.instructions}
                          onChange={(e) => {
                            const updated = [...dischargeForm.medications];
                            updated[idx].instructions = e.target.value;
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = dischargeForm.medications.filter((_, i) => i !== idx);
                            setDischargeForm({ ...dischargeForm, medications: updated });
                          }}
                          className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition cursor-pointer"
                          title="Remove Medicine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Part 5: Advice, Stitch Removal & Follow-Up */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <h4 className="font-black text-slate-900 text-sm">
                    Part 5: Advice, Stitch Removal Date & Follow-Up (উপদেশ ও ফলো-আপ)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Rest Duration (বিশ্রামের মেয়াদ দিন/মাস)</label>
                    <input
                      type="text"
                      placeholder="e.g. ১৫ দিন / ১ মাস"
                      value={dischargeForm.restDays}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, restDays: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Heavy Work Restriction (ভারী কাজ নিষেধ)</label>
                    <input
                      type="text"
                      placeholder="e.g. ১ মাস / ২ মাস"
                      value={dischargeForm.heavyWorkRestrictionDays}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, heavyWorkRestrictionDays: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Stitch Removal Date (সেলাই কাটার তারিখ)</label>
                    <input
                      type="date"
                      value={dischargeForm.stitchRemovalDate}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, stitchRemovalDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Next Follow-Up Date (পরবর্তী সাক্ষাত)</label>
                    <input
                      type="date"
                      value={dischargeForm.followupDate}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, followupDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      Discharge Advice & Special Precautions (ছাড়পত্রের বিশেষ উপদেশ)
                    </label>
                    <textarea
                      rows={4}
                      value={dischargeForm.dischargeAdvice}
                      onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeAdvice: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white min-h-[90px]"
                    />
                  </div>
                </div>
              </div>

              {/* Form Submission Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="px-5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !dischargeForm.finalDiagnosis.trim()}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black rounded-xl transition flex items-center shadow-md cursor-pointer"
                >
                  <FileCheck className="w-4 h-4 mr-2" />
                  {submitting ? "Signing & Discharging..." : "Confirm Discharge & Generate 4-Part Certificate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel / Delete Mistake Admission Modal */}
      {showCancelAdmissionModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-rose-200">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">ভুল ভর্তি বাতিল বা মুছে ফেলুন</h3>
                  <p className="text-xs text-slate-500">Cancel or Delete Mistake IPD Admission</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelAdmissionModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelAdmissionSubmit} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-slate-700">
                  রোগীর নাম: <strong className="text-slate-900">{selectedAdmission.patient_name}</strong> (UHID: {selectedAdmission.patient_code})
                </p>
                <p className="text-slate-700">
                  ভর্তি নম্বর: <strong className="font-mono text-slate-900">{selectedAdmission.visit_number}</strong> • বেড: <strong>{selectedAdmission.bed_number}</strong>
                </p>
                <p className="text-[11px] text-slate-500">
                  নির্ধারিত বেড ও কেবিন তাৎক্ষণিকভাবে মুক্ত (VACANT) করা হবে এবং আনবিল্ড চার্জ বাতিল হবে।
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">বাতিল / মোছার কারণ (Reason) *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="যেমন: ভুলবশত এন্ট্রি করা হয়েছিল বা ট্রায়াল এন্ট্রি..."
                  value={cancelAdmissionReason}
                  onChange={(e) => setCancelAdmissionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-start gap-2 bg-rose-50/60 p-3 rounded-xl border border-rose-200">
                <input
                  type="checkbox"
                  id="cancelPermanent"
                  checked={cancelAdmissionPermanent}
                  onChange={(e) => setCancelAdmissionPermanent(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="cancelPermanent" className="text-[11px] text-slate-700 select-none">
                  <span className="font-bold text-rose-800">অ্যাডমিন পার্মানেন্ট ডিলিট (Hard Delete)</span>: শুধুমাত্র অনুমোদিত অ্যাডমিনের জন্য — ডাটাবেজ থেকে সম্পূর্ণ মুছে যাবে। আনচেক থাকলে নিরাপদ ক্যানসলেশন হবে এবং বেড মুক্ত হবে।
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCancelAdmissionModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cancellingAdmission}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {cancellingAdmission ? "Processing..." : "ভর্তি বাতিল ও বেড মুক্ত করুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>

      {/* Edit IPD Admission Details Modal */}
      {showEditAdmissionModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900">ভর্তি তথ্য সংশোধন করুন</h3>
                  <p className="text-xs text-slate-500">Edit IPD Admission Details & Corrections</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditAdmissionModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateAdmissionSubmit} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-slate-700">
                  রোগী: <strong className="text-slate-900">{selectedAdmission.patient_name}</strong> (UHID: {selectedAdmission.patient_code})
                </p>
                <p className="text-slate-700">
                  ভর্তি নম্বর: <strong className="font-mono text-slate-900">{selectedAdmission.visit_number}</strong> • বেড: <strong>{selectedAdmission.bed_number}</strong>
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  প্রাথমিক রোগ নির্ণয় (Provisional Diagnosis)
                </label>
                <input
                  type="text"
                  value={editAdmissionForm.provisionalDiagnosis}
                  onChange={(e) => setEditAdmissionForm({ ...editAdmissionForm, provisionalDiagnosis: e.target.value })}
                  placeholder="e.g. Acute Appendicitis, Enteric Fever..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  দায়িত্বপ্রাপ্ত ডাক্তার (Attending Doctor)
                </label>
                <select
                  value={editAdmissionForm.doctorId}
                  onChange={(e) => setEditAdmissionForm({ ...editAdmissionForm, doctorId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="">-- অপরিবর্তিত রাখুন --</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">অভিভাবকের নাম (Guardian Name)</label>
                  <input
                    type="text"
                    value={editAdmissionForm.guardianName}
                    onChange={(e) => setEditAdmissionForm({ ...editAdmissionForm, guardianName: e.target.value })}
                    placeholder="Guardian Name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">অভিভাবকের ফোন (Phone)</label>
                  <input
                    type="text"
                    value={editAdmissionForm.guardianPhone}
                    onChange={(e) => setEditAdmissionForm({ ...editAdmissionForm, guardianPhone: e.target.value })}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ক্লিনিক্যাল নোট বা মন্তব্য (Clinical Notes)</label>
                <textarea
                  rows={3}
                  value={editAdmissionForm.notes}
                  onChange={(e) => setEditAdmissionForm({ ...editAdmissionForm, notes: e.target.value })}
                  placeholder="যেকোনো অতিরিক্ত নোট বা নির্দেশনা..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditAdmissionModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingAdmission}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                  {editingAdmission ? "সংরক্ষণ হচ্ছে..." : "তথ্য সংরক্ষণ করুন"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authentic 4-Part Discharge Certificate Print Modal */}
      {certificatePrintProps && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static print:z-auto print:overflow-visible print:block print:w-full print:m-0">
          <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden print:border-none print:shadow-none print:max-w-none print:w-full my-6 print:m-0 print:p-0">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-700" />
                <h3 className="text-sm font-black text-slate-900">
                  ANNESHA HOSPITAL AND DIAGNOSTIC 4-Part Discharge Certificate Folder — {certificatePrintProps.admissionNumber}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-xl text-xs transition flex items-center shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print 4-Part Folder (4 Pages)
                </button>
                <button
                  type="button"
                  onClick={() => setCertificatePrintProps(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                  title="Close Certificate"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-x-auto max-h-[82vh] print:max-h-none print:p-0 print:overflow-visible">
              <DischargeSummaryPrint {...certificatePrintProps} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
