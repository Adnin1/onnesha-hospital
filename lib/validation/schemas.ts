/**
 * Validation schemas and helper types for Onnesha Hospital Management System (OHMS).
 * Lightweight, zero-dependency validation architecture suitable for client and server.
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
  issues?: ValidationIssue[];
}

/**
 * Standard Bangladeshi Mobile Phone Validator
 * Formats supported: 017xxxxxxxx, +88017xxxxxxxx, 88017xxxxxxxx (11 digits local)
 */
export function isValidBDPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(?:\+?88)?01[3-9]\d{8}$/.test(cleaned);
}

/**
 * Standard Bangladeshi NID (National ID) Validator
 * Valid lengths: 10 digits (Smart NID), 13 digits, or 17 digits (Old NID)
 */
export function isValidBDNid(nid: string): boolean {
  if (!nid) return true; // NID is optional for minor patients
  const cleaned = nid.replace(/[\s-]/g, "");
  return /^(?:\d{10}|\d{13}|\d{17})$/.test(cleaned);
}

/**
 * Patient Registration Form Validator
 */
export interface PatientInput {
  full_name: string;
  phone: string;
  gender: "male" | "female" | "other";
  age: number | string;
  blood_group?: string;
  nid?: string;
  guardian_name?: string;
  relation_with_guardian?: string;
  address?: string;
  emergency_contact_phone?: string;
}

export function validatePatientInput(input: Partial<PatientInput>): ValidationResult<PatientInput> {
  const errors: Record<string, string> = {};

  if (!input.full_name || input.full_name.trim().length < 2) {
    errors.full_name = "Patient full name is required (minimum 2 characters).";
  }

  if (!input.phone || !isValidBDPhone(input.phone)) {
    errors.phone = "A valid 11-digit Bangladeshi mobile number is required (e.g. 017xxxxxxxx).";
  }

  if (!input.gender || !["male", "female", "other"].includes(input.gender)) {
    errors.gender = "Please select a valid gender.";
  }

  const numericAge = Number(input.age);
  if (isNaN(numericAge) || numericAge < 0 || numericAge > 130) {
    errors.age = "Please provide a valid age between 0 and 130 years.";
  }

  if (input.nid && !isValidBDNid(input.nid)) {
    errors.nid = "National ID must be 10, 13, or 17 digits.";
  }

  if (input.emergency_contact_phone && !isValidBDPhone(input.emergency_contact_phone)) {
    errors.emergency_contact_phone = "Emergency contact must be a valid 11-digit mobile number.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      issues: Object.entries(errors).map(([field, message]) => ({ field, message })),
    };
  }

  return {
    success: true,
    data: {
      full_name: input.full_name!.trim(),
      phone: input.phone!.trim(),
      gender: input.gender!,
      age: numericAge,
      blood_group: input.blood_group,
      nid: input.nid?.trim(),
      guardian_name: input.guardian_name?.trim(),
      relation_with_guardian: input.relation_with_guardian?.trim(),
      address: input.address?.trim(),
      emergency_contact_phone: input.emergency_contact_phone?.trim(),
    },
  };
}

/**
 * Appointment Booking Validator
 */
export interface AppointmentInput {
  doctor_id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  time_slot: string;
}

export function validateAppointmentInput(input: Partial<AppointmentInput>): ValidationResult<AppointmentInput> {
  const errors: Record<string, string> = {};

  if (!input.doctor_id) {
    errors.doctor_id = "Please select a consulting doctor.";
  }
  if (!input.patient_name || input.patient_name.trim().length < 2) {
    errors.patient_name = "Patient name is required.";
  }
  if (!input.patient_phone || !isValidBDPhone(input.patient_phone)) {
    errors.patient_phone = "Valid 11-digit Bangladeshi contact number required.";
  }
  if (!input.appointment_date) {
    errors.appointment_date = "Appointment date is required.";
  }
  if (!input.time_slot) {
    errors.time_slot = "Please choose an appointment slot.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: input as AppointmentInput,
  };
}
