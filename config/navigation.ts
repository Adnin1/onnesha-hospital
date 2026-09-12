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
        href: "/app/pharmacy",
        label: "Pharmacy & Stock POS",
        icon: Pill,
        perm: PERMISSIONS.PHARMACY_VIEW,
      },
    ],
  },
  {
    title: "Ward, OT & Rx",
    items: [
      {
        href: "/app/beds",
        label: "Bed & Cabin Matrix",
        icon: Bed,
        perm: PERMISSIONS.BEDS_VIEW,
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
    ],
  },
  {
    title: "Finance, HR & Admin",
    items: [
      {
        href: "/app/billing",
        label: "Billing & Cashier",
        icon: Receipt,
        perm: PERMISSIONS.BILLING_VIEW,
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
        href: "/app/settings",
        label: "Settings & Audit Logs",
        icon: Settings,
        perm: PERMISSIONS.SETTINGS_VIEW,
      },
    ],
  },
];
