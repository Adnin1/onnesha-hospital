import { UUID } from "./index";

export type GenderType = "MALE" | "FEMALE" | "OTHER";
export type BloodGroupType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";
export type EncounterType = "OPD" | "IPD" | "EMERGENCY";
export type VisitStatus = "ACTIVE" | "DISCHARGED" | "TRANSFERRED" | "CANCELLED" | "COMPLETED";
export type TriagePriority = "RED" | "YELLOW" | "GREEN";
export type AllergySeverity = "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING";
export type NoteType = "GENERAL" | "OPD" | "IPD" | "EMERGENCY" | "NURSING" | "CONSULTANT" | "PROGRESS" | "DISCHARGE";
export type DischargeType = "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED";

export interface PatientMaster {
  id: UUID;
  organization_id: UUID;
  patient_code: string;
  full_name: string;
  phone: string;
  normalized_phone?: string;
  alternate_phone?: string;
  email?: string;
  gender: GenderType;
  dob?: string;
  blood_group?: BloodGroupType;
  marital_status?: string;
  occupation?: string;
  nid?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  is_temporary?: boolean;
  temp_identifier?: string;
  is_deceased?: boolean;
  deceased_at?: string;
  deceased_reason?: string;
  is_deleted: boolean;
  merged_into_patient_id?: UUID;
  created_at: string;
  updated_at: string;
  created_by?: UUID;
  updated_by?: UUID;
}

export interface PatientIdentification {
  id: UUID;
  patient_id: UUID;
  id_type: "NID" | "BIRTH_CERTIFICATE" | "PASSPORT" | "DRIVING_LICENSE";
  id_number: string;
  is_verified: boolean;
  created_at: string;
}

export interface PatientAddress {
  id: UUID;
  patient_id: UUID;
  address_type: "PRESENT" | "PERMANENT" | "OFFICE";
  street_address: string;
  upazila_or_thana?: string;
  district: string;
  division: string;
  post_code?: string;
  created_at: string;
}

export interface PatientContact {
  id: UUID;
  patient_id: UUID;
  contact_name: string;
  relationship: string;
  phone: string;
  is_primary_emergency: boolean;
  created_at: string;
}

export interface PatientAllergy {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  allergen: string;
  reaction?: string;
  severity: AllergySeverity;
  status: "ACTIVE" | "INACTIVE" | "RESOLVED";
  recorded_by?: UUID;
  recorded_at: string;
  notes?: string;
}

export interface ClinicalAlert {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  alert_type: "DRUG_ALLERGY" | "FALL_RISK" | "INFECTION_PRECAUTION" | "HIGH_RISK_SURGERY" | "GENERAL_WARNING";
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  is_active: boolean;
  created_by?: UUID;
  created_at: string;
  resolved_by?: UUID;
  resolved_at?: string;
}

export interface PatientVisit {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  visit_number?: string;
  visit_type: EncounterType;
  status: VisitStatus;
  triage_priority?: TriagePriority;
  chief_complaint?: string;
  department_id?: UUID;
  doctor_id?: UUID;
  priority?: "NORMAL" | "URGENT" | "CRITICAL";
  reason_for_visit?: string;
  admitted_at: string;
  discharged_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VitalSigns {
  id: UUID;
  visit_id: UUID;
  pulse_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  temperature_c?: number;
  respiratory_rate?: number;
  spo2_pct?: number;
  weight_kg?: number;
  height_cm?: number;
  bmi?: number;
  recorded_by?: UUID;
  recorded_at: string;
}

export interface PatientDiagnosis {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  visit_id?: UUID;
  icd_code?: string;
  diagnosis_name: string;
  diagnosis_type: "PRIMARY" | "SECONDARY" | "PROVISIONAL" | "FINAL";
  onset_date?: string;
  notes?: string;
  recorded_by?: UUID;
  recorded_at: string;
}

export interface ClinicalNote {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  visit_id?: UUID;
  note_type: NoteType;
  note_content: string;
  is_amended?: boolean;
  amendment_reason?: string;
  original_note_id?: UUID;
  author_id?: UUID;
  author_name?: string;
  created_at: string;
}

export interface PatientTransfer {
  id: UUID;
  organization_id: UUID;
  visit_id: UUID;
  patient_id: UUID;
  from_ward_id?: UUID;
  to_ward_id?: UUID;
  from_bed_id?: UUID;
  to_bed_id?: UUID;
  reason: string;
  transfer_time: string;
  authorized_by?: UUID;
}

export interface DischargeSummary {
  id: UUID;
  visit_id: UUID;
  discharge_type: DischargeType;
  final_diagnosis: string;
  hospital_course?: string;
  condition_at_discharge?: string;
  discharge_advice?: string;
  followup_instructions?: string;
  prepared_by?: UUID;
  approved_by?: UUID;
  created_at: string;
}

export interface PatientConsent {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  visit_id?: UUID;
  consent_type: "GENERAL_TREATMENT" | "DATA_PROCESSING" | "INVASIVE_PROCEDURE" | "SURGERY" | "ANESTHESIA" | "DISCLOSURE";
  status: "GRANTED" | "REVOKED" | "REFUSED";
  notes?: string;
  captured_by?: UUID;
  captured_at: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type:
    | "PATIENT_REGISTERED"
    | "OPD_REGISTERED"
    | "OPD_COMPLETED"
    | "EMERGENCY_REGISTERED"
    | "TRIAGE_UPDATED"
    | "IPD_ADMITTED"
    | "BED_ASSIGNED"
    | "PATIENT_TRANSFERRED"
    | "VITAL_RECORDED"
    | "DIAGNOSIS_RECORDED"
    | "NOTE_CREATED"
    | "PRESCRIPTION_CREATED"
    | "DIAGNOSTIC_ORDER_CREATED"
    | "DOCUMENT_UPLOADED"
    | "DISCHARGED";
  title: string;
  description?: string;
  performer?: string;
  badgeColor?: string;
  metadata?: Record<string, unknown>;
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  confidence: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  matchedPatients: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
    gender?: string;
    dob?: string;
    matchSignal: string;
  }[];
}
