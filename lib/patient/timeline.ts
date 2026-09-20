import { createClient } from "@/lib/supabase/client";
import { TimelineEvent } from "@/types/clinical";

/**
 * Compiles a comprehensive, chronological 360-degree medical timeline for a patient.
 * Collects events across registration, visits (OPD/IPD/Emergency), vitals, diagnoses, notes,
 * transfers, documents, and discharge summaries.
 */
export async function getPatientTimeline(patientId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  try {
    const supabase = await createClient();

    // 1. Patient Master Registration Event
    const { data: patient } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, created_at")
      .eq("id", patientId)
      .single();

    if (patient) {
      events.push({
        id: `reg-${patient.id}`,
        date: patient.created_at,
        type: "PATIENT_REGISTERED",
        title: "Patient Registered into System",
        description: `Patient ID ${patient.patient_code} generated for ${patient.full_name}.`,
        badgeColor: "bg-sky-100 text-sky-800 border-sky-300",
      });
    }

    // 2. Encounters / Visits (OPD, IPD, Emergency)
    const { data: visits } = await supabase
      .from("patient_visits")
      .select("id, visit_number, visit_type, status, triage_priority, chief_complaint, admitted_at, discharged_at")
      .eq("patient_id", patientId);

    interface VisitRow {
      id: string;
      visit_number?: string;
      visit_type: "OPD" | "IPD" | "EMERGENCY";
      status: string;
      triage_priority?: string;
      chief_complaint?: string;
      admitted_at: string;
      discharged_at?: string;
    }

    const visitMap = new Map<string, VisitRow>();

    if (visits && visits.length > 0) {
      (visits as unknown as VisitRow[]).forEach((v) => {
        visitMap.set(v.id, v);

        if (v.visit_type === "OPD") {
          events.push({
            id: `opd-${v.id}`,
            date: v.admitted_at,
            type: "OPD_REGISTERED",
            title: `OPD Consultation (${v.visit_number || "Encounter"})`,
            description: v.chief_complaint || "Outpatient general consultation initiated.",
            badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300",
          });
        } else if (v.visit_type === "EMERGENCY") {
          events.push({
            id: `emg-${v.id}`,
            date: v.admitted_at,
            type: "EMERGENCY_REGISTERED",
            title: `Emergency Department Arrival [Triage: ${v.triage_priority || "RED"}]`,
            description: v.chief_complaint || "Emergency triage registered.",
            badgeColor: "bg-red-100 text-red-800 border-red-300",
          });
        } else if (v.visit_type === "IPD") {
          events.push({
            id: `ipd-${v.id}`,
            date: v.admitted_at,
            type: "IPD_ADMITTED",
            title: `IPD Hospital Admission (${v.visit_number || "Inpatient"})`,
            description: v.chief_complaint || "Patient formally admitted to ward/cabin.",
            badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
          });
        }

        if (v.discharged_at) {
          events.push({
            id: `disch-${v.id}`,
            date: v.discharged_at,
            type: "DISCHARGED",
            title: `Discharged from ${v.visit_type}`,
            description: `Encounter formally closed. Status: ${v.status}.`,
            badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
          });
        }
      });
    }

    // 3. Vital Signs Measurements
    const visitIds = Array.from(visitMap.keys());
    if (visitIds.length > 0) {
      const { data: vitals } = await supabase
        .from("vital_signs")
        .select("id, visit_id, systolic_bp, diastolic_bp, pulse_rate, temperature_c, spo2_pct, recorded_at")
        .in("visit_id", visitIds);

      interface VitalRow {
        id: string;
        visit_id: string;
        systolic_bp?: number;
        diastolic_bp?: number;
        pulse_rate?: number;
        temperature_c?: number;
        spo2_pct?: number;
        recorded_at: string;
      }

      if (vitals && vitals.length > 0) {
        (vitals as unknown as VitalRow[]).forEach((vt) => {
          const bpStr = vt.systolic_bp && vt.diastolic_bp ? `BP: ${vt.systolic_bp}/${vt.diastolic_bp} mmHg` : "";
          const pulseStr = vt.pulse_rate ? `Pulse: ${vt.pulse_rate} bpm` : "";
          const spo2Str = vt.spo2_pct ? `SpO2: ${vt.spo2_pct}%` : "";
          const tempStr = vt.temperature_c ? `Temp: ${vt.temperature_c}°C` : "";
          const telemetry = [bpStr, pulseStr, spo2Str, tempStr].filter(Boolean).join(" • ");

          events.push({
            id: `vt-${vt.id}`,
            date: vt.recorded_at,
            type: "VITAL_RECORDED",
            title: "Vital Signs Recorded",
            description: telemetry || "Clinical vitals captured.",
            badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-300",
          });
        });
      }

      // 4. Diagnoses
      const { data: diagnoses } = await supabase
        .from("patient_diagnoses")
        .select("id, diagnosis_name, diagnosis_type, icd_code, recorded_at")
        .eq("patient_id", patientId);

      interface DiagRow {
        id: string;
        diagnosis_name: string;
        diagnosis_type: string;
        icd_code?: string;
        recorded_at: string;
      }

      if (diagnoses && diagnoses.length > 0) {
        (diagnoses as unknown as DiagRow[]).forEach((dg) => {
          events.push({
            id: `dg-${dg.id}`,
            date: dg.recorded_at,
            type: "DIAGNOSIS_RECORDED",
            title: `Diagnosis: ${dg.diagnosis_name}`,
            description: `Type: ${dg.diagnosis_type}${dg.icd_code ? ` (ICD: ${dg.icd_code})` : ""}`,
            badgeColor: "bg-purple-100 text-purple-800 border-purple-300",
          });
        });
      }

      // 5. Clinical Notes
      const { data: notes } = await supabase
        .from("clinical_notes")
        .select("id, note_type, note_content, author_name, created_at")
        .eq("patient_id", patientId);

      interface NoteRow {
        id: string;
        note_type: string;
        note_content: string;
        author_name?: string;
        created_at: string;
      }

      if (notes && notes.length > 0) {
        (notes as unknown as NoteRow[]).forEach((nt) => {
          events.push({
            id: `nt-${nt.id}`,
            date: nt.created_at,
            type: "NOTE_CREATED",
            title: `Clinical Note (${nt.note_type})`,
            description: nt.note_content,
            performer: nt.author_name || "Physician / Nurse",
            badgeColor: "bg-teal-100 text-teal-800 border-teal-300",
          });
        });
      }

      // 6. Patient Transfers
      const { data: transfers } = await supabase
        .from("patient_transfers")
        .select("id, reason, transfer_time")
        .eq("patient_id", patientId);

      interface TransferRow {
        id: string;
        reason: string;
        transfer_time: string;
      }

      if (transfers && transfers.length > 0) {
        (transfers as unknown as TransferRow[]).forEach((tr) => {
          events.push({
            id: `tr-${tr.id}`,
            date: tr.transfer_time,
            type: "PATIENT_TRANSFERRED",
            title: "Ward / Bed Transfer",
            description: tr.reason,
            badgeColor: "bg-orange-100 text-orange-800 border-orange-300",
          });
        });
      }
    }

    // 7. Medical Documents Uploaded
    const { data: docs } = await supabase
      .from("patient_documents")
      .select("id, file_name, file_type, created_at")
      .eq("patient_id", patientId);

    interface DocRow {
      id: string;
      file_name: string;
      file_type?: string;
      created_at: string;
    }

    if (docs && docs.length > 0) {
      (docs as unknown as DocRow[]).forEach((dc) => {
        events.push({
          id: `dc-${dc.id}`,
          date: dc.created_at,
          type: "DOCUMENT_UPLOADED",
          title: `Medical Document Vaulted: ${dc.file_name}`,
          description: `Category: ${dc.file_type || "Medical File"}`,
          badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
        });
      });
    }

    // Sort all events descending (newest first)
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return events;
  } catch (err) {
    console.error("Timeline aggregation failed:", err);
    return events;
  }
}
