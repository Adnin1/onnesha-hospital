export interface WardRecord {
  id: string;
  organization_id: string;
  name: string;
  ward_type: string;
  floor_number: string;
  total_beds: number;
  created_at?: string;
}

export interface BedTypeRecord {
  id: string;
  organization_id: string;
  name: string;
  daily_rate: number;
  description?: string;
}

export interface BedAssignmentRecord {
  id: string;
  organization_id: string;
  visit_id: string;
  patient_id: string;
  bed_id?: string | null;
  cabin_id?: string | null;
  assigned_at: string;
  vacated_at?: string | null;
  daily_charge: number;
  status: "ACTIVE" | "TRANSFERRED" | "VACATED";
  assigned_by?: string | null;
  patient?: {
    id?: string;
    patient_code: string;
    full_name: string;
    phone: string;
    gender?: string;
  };
}

export interface BedRecord {
  id: string;
  organization_id: string;
  ward_id: string;
  bed_type_id: string;
  bed_number: string;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
  is_active: boolean;
  created_at?: string;
  ward?: WardRecord;
  bed_type?: BedTypeRecord;
  current_assignment?: BedAssignmentRecord;
}

export interface CabinRecord {
  id: string;
  organization_id: string;
  cabin_number: string;
  cabin_type: "AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE";
  floor_number: string;
  daily_rate: number;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
  amenities?: string;
  created_at?: string;
  current_assignment?: BedAssignmentRecord;
}

export interface OTRoomRecord {
  id: string;
  organization_id: string;
  room_number: string;
  room_name: string;
  is_major_ot: boolean;
  status: "AVAILABLE" | "IN_SURGERY" | "STERILIZING" | "MAINTENANCE";
  created_at?: string;
}

export interface OTBookingRecord {
  id: string;
  organization_id: string;
  visit_id: string;
  ot_room_id: string;
  procedure_name: string;
  lead_surgeon_id: string;
  anesthetist_id?: string | null;
  anesthesia_type?: string;
  scheduled_start: string;
  scheduled_end: string;
  status: "SCHEDULED" | "IN_SURGERY" | "COMPLETED" | "CANCELLED";
  ot_charge: number;
  created_at?: string;
  ot_room?: OTRoomRecord;
  lead_surgeon?: {
    id: string;
    full_name: string;
    specialization: string;
    designation?: string;
  };
  anesthetist?: {
    id: string;
    full_name: string;
    specialization: string;
  };
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
  };
}
