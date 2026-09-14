export interface EmployeeRecord {
  id: string;
  organization_id: string;
  employee_code: string;
  full_name: string;
  department_id?: string | null;
  designation_id?: string | null;
  phone: string;
  email?: string | null;
  joining_date: string;
  biometric_device_pin?: string | null;
  basic_salary: number;
  house_rent: number;
  medical_allowance: number;
  status: "ACTIVE" | "ON_LEAVE" | "TERMINATED" | "RESIGNED";
  created_at?: string;
  department?: {
    name: string;
  };
  designation?: {
    title: string;
  };
}

export interface AttendanceRecordItem {
  id: string;
  organization_id: string;
  employee_id: string;
  device_id?: string | null;
  punch_time: string;
  punch_type: "CHECK_IN" | "CHECK_OUT";
  verification_mode: "FINGERPRINT" | "FACE" | "CARD" | "MANUAL";
  is_late: boolean;
  created_at?: string;
  employee?: {
    id: string;
    employee_code: string;
    full_name: string;
    phone: string;
  };
}

export interface AttendanceDeviceRecord {
  id: string;
  organization_id: string;
  device_name: string;
  device_ip: string;
  port: number;
  device_location: string;
  is_active: boolean;
  last_ping_at?: string | null;
}

export interface PayrollRunRecord {
  id: string;
  organization_id: string;
  month_year: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  status: "DRAFT" | "APPROVED" | "DISBURSED";
  disbursed_at?: string | null;
  created_at?: string;
}
