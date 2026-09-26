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
  IPD_TRANSFER: "ipd.transfer",
  IPD_DISCHARGE: "ipd.discharge",
  EMERGENCY_VIEW: "emergency.view",
  EMERGENCY_CREATE: "emergency.create",
  EMERGENCY_TRIAGE: "emergency.triage",

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

  // Notifications
  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  NOTIFICATIONS_RESEND: "notifications.resend",

  // Payment Gateway & Online Transactions
  PAYMENT_GATEWAY_VIEW: "payment_gateway.view",
  PAYMENT_GATEWAY_MANAGE: "payment_gateway.manage",
  PAYMENTS_ONLINE_CREATE: "payments.online.create",
  PAYMENTS_ONLINE_VERIFY: "payments.online.verify",
  PAYMENTS_RECONCILE: "payments.reconcile",
  REFUNDS_PROCESS: "refunds.process",
  INTEGRATIONS_MANAGE: "integrations.manage",

  // ERP & Enterprise Operations
  ACCOUNTING_VIEW: "accounting.view",
  ACCOUNTING_MANAGE: "accounting.manage",
  PROCUREMENT_VIEW: "procurement.view",
  PROCUREMENT_MANAGE: "procurement.manage",
  ASSETS_VIEW: "assets.view",
  ASSETS_MANAGE: "assets.manage",
  NURSING_VIEW: "nursing.view",
  NURSING_MANAGE: "nursing.manage",

  // Reports & Settings
  REPORTS_VIEW: "reports.view",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE_ROLES: "settings.manage_roles",
  SETTINGS_AUDIT: "settings.audit",

  // Staff IAM (Identity & Access Management)
  STAFF_VIEW: "staff.view",
  STAFF_CREATE: "staff.create",
  STAFF_MANAGE: "staff.manage",
  STAFF_RESET_PASSWORD: "staff.reset_password",
  DEPARTMENTS_MANAGE: "departments.manage",

  // Clinical Domain Extensions
  CRITICAL_CARE_VIEW: "critical_care.view",
  CRITICAL_CARE_MANAGE: "critical_care.manage",
  RADIOLOGY_VIEW: "radiology.view",
  RADIOLOGY_MANAGE: "radiology.manage",
  BLOOD_BANK_VIEW: "blood_bank.view",
  BLOOD_BANK_MANAGE: "blood_bank.manage",
  REGISTRAR_VIEW: "registrar.view",
  REGISTRAR_MANAGE: "registrar.manage",
  AMBULANCE_VIEW: "ambulance.view",
  AMBULANCE_MANAGE: "ambulance.manage",

  // Arch Core Extensions (Conversation 34)
  DIET_CHART_VIEW: "diet_chart.view",
  DIET_CHART_MANAGE: "diet_chart.manage",
  HEALTH_PACKAGE_VIEW: "health_package.view",
  HEALTH_PACKAGE_MANAGE: "health_package.manage",
  REAGENTS_VIEW: "reagents.view",
  REAGENTS_MANAGE: "reagents.manage",
  DOCTOR_ACCOUNTS_VIEW: "doctor_accounts.view",
  DOCTOR_ACCOUNTS_SETTLE: "doctor_accounts.settle",
  CORPORATE_CRM_VIEW: "corporate_crm.view",
  CORPORATE_CRM_MANAGE: "corporate_crm.manage",
} as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  super_admin: Object.values(PERMISSIONS),
  hospital_administrator: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.SETTINGS_MANAGE_ROLES),
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
    PERMISSIONS.ACCOUNTING_VIEW,
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.PROCUREMENT_VIEW,
    PERMISSIONS.ASSETS_VIEW,
    PERMISSIONS.PAYMENT_GATEWAY_VIEW,
    PERMISSIONS.PAYMENTS_ONLINE_CREATE,
    PERMISSIONS.PAYMENTS_ONLINE_VERIFY,
    PERMISSIONS.PAYMENTS_RECONCILE,
    PERMISSIONS.REFUNDS_PROCESS,
    PERMISSIONS.REPORTS_VIEW,
  ],
  lab_technologist: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.LAB_VIEW,
    PERMISSIONS.LAB_SAMPLE_COLLECT,
    PERMISSIONS.LAB_ENTER_RESULT,
    PERMISSIONS.LAB_VERIFY,
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
    PERMISSIONS.PROCUREMENT_VIEW,
  ],
  nurse: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.IPD_VIEW,
    PERMISSIONS.EMERGENCY_VIEW,
    PERMISSIONS.BEDS_VIEW,
    PERMISSIONS.BEDS_ALLOCATE,
    PERMISSIONS.NURSING_VIEW,
    PERMISSIONS.NURSING_MANAGE,
  ],
  hr_payroll: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_ATTENDANCE,
    PERMISSIONS.HR_PAYROLL,
    PERMISSIONS.STAFF_VIEW,
    PERMISSIONS.REPORTS_VIEW,
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
