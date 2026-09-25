import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Stethoscope,
  Activity,
  Bed,
  Radio,
  Microscope,
  Pill,
  Scissors,
  FileText,
  Receipt,
  UserCheck,
  BarChart3,
  Settings,
  Scale,
  ShoppingCart,
  Wrench,
  ShieldCheck,
  HeartPulse,
  Scan,
  Droplet,
  Award,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  perm: string;
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const HOSPITAL_NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      {
        href: "/app/dashboard",
        label: "Executive Dashboard",
        icon: LayoutDashboard,
        perm: PERMISSIONS.DASHBOARD_VIEW,
      },
    ],
  },
  {
    title: "Front Desk & Clinical",
    items: [
      {
        href: "/app/patients",
        label: "Patient Registry",
        icon: Users,
        perm: PERMISSIONS.PATIENTS_VIEW,
      },
      {
        href: "/app/appointments",
        label: "Appointments & Tokens",
        icon: CalendarClock,
        perm: PERMISSIONS.APPOINTMENTS_VIEW,
      },
      {
        href: "/app/doctors",
        label: "Doctors & Roster",
        icon: Stethoscope,
        perm: PERMISSIONS.DOCTORS_VIEW,
      },
      {
        href: "/app/opd",
        label: "OPD Consultation",
        icon: Activity,
        perm: PERMISSIONS.OPD_VIEW,
      },
      {
        href: "/app/ipd",
        label: "IPD Admissions",
        icon: Bed,
        perm: PERMISSIONS.IPD_VIEW,
      },
      {
        href: "/app/emergency",
        label: "24/7 Emergency Triage",
        icon: Radio,
        perm: PERMISSIONS.EMERGENCY_VIEW,
      },
    ],
  },
  {
    title: "Diagnostics & Pharmacy",
    items: [
      {
        href: "/app/lab",
        label: "Pathology & Tests",
        icon: Microscope,
        perm: PERMISSIONS.LAB_VIEW,
      },
      {
        href: "/app/radiology",
        label: "Radiology & Imaging",
        icon: Scan,
        perm: PERMISSIONS.RADIOLOGY_VIEW,
      },
      {
        href: "/app/blood-bank",
        label: "Blood Bank & Transfusion",
        icon: Droplet,
        perm: PERMISSIONS.BLOOD_BANK_VIEW,
      },
      {
        href: "/app/pharmacy",
        label: "Pharmacy & Stock POS",
        icon: Pill,
        perm: PERMISSIONS.PHARMACY_VIEW,
      },
    ],
  },
  {
    title: "Ward, ICU & Services",
    items: [
      {
        href: "/app/beds",
        label: "Bed & Cabin Matrix",
        icon: Bed,
        perm: PERMISSIONS.BEDS_VIEW,
      },
      {
        href: "/app/critical-care",
        label: "Critical Care (ICU/CCU)",
        icon: HeartPulse,
        perm: PERMISSIONS.CRITICAL_CARE_VIEW,
      },
      {
        href: "/app/ot",
        label: "Operation Theater (OT)",
        icon: Scissors,
        perm: PERMISSIONS.OT_VIEW,
      },
      {
        href: "/app/prescriptions",
        label: "Digital Prescriptions",
        icon: FileText,
        perm: PERMISSIONS.PRESCRIPTIONS_VIEW,
      },
      {
        href: "/app/registrar",
        label: "Medical Certificates",
        icon: Award,
        perm: PERMISSIONS.REGISTRAR_VIEW,
      },
      {
        href: "/app/ambulance",
        label: "Ambulance Transport",
        icon: Truck,
        perm: PERMISSIONS.AMBULANCE_VIEW,
      },
    ],
  },
  {
    title: "Finance & Enterprise ERP",
    items: [
      {
        href: "/app/billing",
        label: "Billing & Cashier",
        icon: Receipt,
        perm: PERMISSIONS.BILLING_VIEW,
      },
      {
        href: "/app/accounting",
        label: "Accounting & Ledger",
        icon: Scale,
        perm: PERMISSIONS.ACCOUNTING_VIEW,
      },
      {
        href: "/app/procurement",
        label: "Procurement & GRN",
        icon: ShoppingCart,
        perm: PERMISSIONS.PROCUREMENT_VIEW,
      },
      {
        href: "/app/assets",
        label: "Fixed Assets & Equipment",
        icon: Wrench,
        perm: PERMISSIONS.ASSETS_VIEW,
      },
      {
        href: "/app/hr",
        label: "HR & Biometrics",
        icon: UserCheck,
        perm: PERMISSIONS.HR_VIEW,
      },
      {
        href: "/app/reports",
        label: "Financial Reports",
        icon: BarChart3,
        perm: PERMISSIONS.REPORTS_VIEW,
      },
      {
        href: "/app/settings/staff",
        label: "Staff Directory & Access",
        icon: ShieldCheck,
        perm: PERMISSIONS.STAFF_VIEW,
      },
      {
        href: "/app/settings",
        label: "Settings & Audit Logs",
        icon: Settings,
        perm: PERMISSIONS.SETTINGS_VIEW,
      },
    ],
  },
];
