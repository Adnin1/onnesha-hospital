import { RoleType } from "@/types";

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",

  // Patient Management
  PATIENTS_VIEW: "patients.view",
  PATIENTS_CREATE: "patients.create",
  PATIENTS_EDIT: "patients.edit",
  PATIENTS_HISTORY: "patients.history",

  // Appointments & Queue
  APPOINTMENTS_VIEW: "appointments.view",
  APPOINTMENTS_CREATE: "appointments.create",
  APPOINTMENTS_CALL_TOKEN: "appointments.call_token",

  // Doctors
  DOCTORS_VIEW: "doctors.view",
  DOCTORS_MANAGE: "doctors.manage",

  // Clinical Consultation & OPD/IPD
  OPD_VIEW: "opd.view",
  OPD_CONSULT: "opd.consult",
  IPD_VIEW: "ipd.view",
  IPD_ADMIT: "ipd.admit",
  IPD_DISCHARGE: "ipd.discharge",
  EMERGENCY_VIEW: "emergency.view",

  // Invoicing & Billing
  BILLING_VIEW: "billing.view",
  BILLING_CREATE: "billing.create",
  BILLING_DISCOUNT: "billing.discount",
  BILLING_VOID: "billing.void",
  BILLING_REFUND: "billing.refund",
  BILLING_REPORT: "billing.report",

  // Laboratory & Diagnostics
  LAB_VIEW: "lab.view",
  LAB_ORDER: "lab.order",
  LAB_SAMPLE_COLLECT: "lab.sample_collect",
  LAB_ENTER_RESULT: "lab.enter_result",
  LAB_VERIFY: "lab.verify",

  // Pharmacy
  PHARMACY_VIEW: "pharmacy.view",
  PHARMACY_SALE: "pharmacy.sale",
  PHARMACY_PURCHASE: "pharmacy.purchase",
  PHARMACY_STOCK_ADJUST: "pharmacy.stock_adjust",

  // Bed & OT
  BEDS_VIEW: "beds.view",
  BEDS_ALLOCATE: "beds.allocate",
  OT_VIEW: "ot.view",
  OT_BOOK: "ot.book",

  // Prescriptions
  PRESCRIPTIONS_VIEW: "prescriptions.view",
  PRESCRIPTIONS_CREATE: "prescriptions.create",

  // HR & Payroll
  HR_VIEW: "hr.view",
  HR_ATTENDANCE: "hr.attendance",
  HR_PAYROLL: "hr.payroll",

  // Reports & Settings
  REPORTS_VIEW: "reports.view",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE_ROLES: "settings.manage_roles",
  SETTINGS_AUDIT: "settings.audit",
} as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  super_admin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.SETTINGS_MANAGE_ROLES),
  doctor: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENTS_HISTORY,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.APPOINTMENTS_CALL_TOKEN,
    PERMISSIONS.DOCTORS_VIEW,
    PERMISSIONS.OPD_VIEW,
    PERMISSIONS.OPD_CONSULT,
    PERMISSIONS.IPD_VIEW,
    PERMISSIONS.PRESCRIPTIONS_VIEW,
    PERMISSIONS.PRESCRIPTIONS_CREATE,
    PERMISSIONS.LAB_VIEW,
    PERMISSIONS.LAB_ORDER,
  ],
  receptionist: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.APPOINTMENTS_CREATE,
    PERMISSIONS.APPOINTMENTS_CALL_TOKEN,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BEDS_VIEW,
  ],
  accountant: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_DISCOUNT,
    PERMISSIONS.BILLING_VOID,
    PERMISSIONS.BILLING_REFUND,
    PERMISSIONS.BILLING_REPORT,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_PAYROLL,
  ],
  lab_technician: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.LAB_VIEW,
    PERMISSIONS.LAB_SAMPLE_COLLECT,
    PERMISSIONS.LAB_ENTER_RESULT,
    PERMISSIONS.LAB_VERIFY,
  ],
  pharmacist: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PHARMACY_VIEW,
    PERMISSIONS.PHARMACY_SALE,
    PERMISSIONS.PHARMACY_PURCHASE,
    PERMISSIONS.PHARMACY_STOCK_ADJUST,
  ],
  nurse: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.IPD_VIEW,
    PERMISSIONS.EMERGENCY_VIEW,
    PERMISSIONS.BEDS_VIEW,
    PERMISSIONS.BEDS_ALLOCATE,
  ],
  hr: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_ATTENDANCE,
    PERMISSIONS.HR_PAYROLL,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

export function hasPermission(userPermissions: string[], permission: string): boolean {
  return userPermissions.includes(permission);
}
