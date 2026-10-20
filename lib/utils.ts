import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBDT(amount: number | null | undefined): string {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return "৳0";
  }
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(Number(amount))
    .replace("BDT", "৳");
}

export function formatDateBDT(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

export function formatTimeBDT(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Sanitizes user search input for safe interpolation into PostgREST .or() filter expressions.
 * Strips PostgREST delimiters and operators: , ( ) . % " '
 */
export function sanitizePostgrestSearch(input: string): string {
  if (!input) return "";
  return input.replace(/[,().%"']/g, "").trim();
}

/**
 * Canonical 9 Hospital Roles in OHMS:
 * 1. super_admin (Super Admin - Full System Authority)
 * 2. hospital_administrator (Hospital Administrator / Executive Admin)
 * 3. accountant (Accountant / Cashier)
 * 4. doctor (Doctor / Clinical Consultant)
 * 5. nurse (Nurse / Ward In-Charge)
 * 6. lab_technologist (Lab Technologist / Pathologist)
 * 7. pharmacist (Pharmacist / Dispensary)
 * 8. hr_payroll (HR & Payroll Manager)
 * 9. receptionist (Front Desk / Patient Registration)
 */
export const CANONICAL_ROLES = [
  "super_admin",
  "hospital_administrator",
  "accountant",
  "doctor",
  "nurse",
  "lab_technologist",
  "pharmacist",
  "hr_payroll",
  "receptionist",
] as const;

/**
 * Normalizes role names from database (e.g., "Super Admin", "Hospital Administrator", "Cashier")
 * to standard lowercase snake_case RoleType identifiers.
 * Unknown or unverified roles return empty string (fail-closed, never defaults to receptionist).
 */
export function normalizeRole(roleName: string | null | undefined): string {
  if (!roleName) return "";
  const cleaned = roleName.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (cleaned === "cashier") return "accountant";
  if (cleaned === "pathologist" || cleaned === "lab_technician") return "lab_technologist";
  if (cleaned === "admin") return "hospital_administrator";
  if (cleaned === "hr" || cleaned === "hr_manager") return "hr_payroll";

  if ((CANONICAL_ROLES as readonly string[]).includes(cleaned)) {
    return cleaned;
  }
  return "";
}

/**
 * Calculates accurate age in years from Date of Birth (string or Date).
 * Returns integer age >= 0.
 */
export function calculateAgeFromDOB(dob: string | Date | null | undefined): number {
  if (!dob) return 0;
  const birthDate = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

export interface DetailedAge {
  years: number;
  months: number;
  days: number;
  formatted: string;
}

/**
 * Calculates full pediatric breakdown of age (Years, Months, Days) from Date of Birth.
 * Accurately supports babies/infants with 0 years, 1-12 months, and 1-30 days.
 */
export function calculateDetailedAgeFromDOB(dob: string | Date | null | undefined): DetailedAge {
  if (!dob) {
    return { years: 0, months: 0, days: 0, formatted: "০ দিন (0 Days)" };
  }
  const birthDate = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(birthDate.getTime())) {
    return { years: 0, months: 0, days: 0, formatted: "০ দিন (0 Days)" };
  }
  const today = new Date();

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  if (days < 0) {
    months--;
    const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) {
    years = 0;
    months = 0;
    days = 0;
  }

  let formatted = "";
  if (years === 0 && months === 0) {
    formatted = `${days} দিন (${days} Days)`;
  } else if (years === 0) {
    formatted = `${months} মাস ${days > 0 ? days + " দিন" : ""} (${months}M ${days > 0 ? days + "D" : ""})`;
  } else {
    formatted = `${years} বছর ${months > 0 ? months + " মাস" : ""} (${years}Y ${months > 0 ? months + "M" : ""})`;
  }

  return { years, months, days, formatted };
}

/**
 * Accurately computes Date of Birth (YYYY-MM-DD) from Years, Months, and Days.
 */
export function calculateDOBFromYMD(years: number, months: number, days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (Number(days) || 0));
  d.setMonth(d.getMonth() - (Number(months) || 0));
  d.setFullYear(d.getFullYear() - (Number(years) || 0));

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Universal patient age formatter prioritizing pediatric age (Months & Days) when age < 1 year.
 */
export function formatPatientAgeDisplay(
  ageYears?: number | string | null,
  ageMonths?: number | string | null,
  ageDays?: number | string | null,
  dob?: string | null
): string {
  if (dob) {
    const detailed = calculateDetailedAgeFromDOB(dob);
    return detailed.formatted;
  }
  const y = Number(ageYears) || 0;
  const m = Number(ageMonths) || 0;
  const d = Number(ageDays) || 0;

  if (y === 0 && m === 0 && d === 0) {
    return "০ দিন";
  }
  if (y === 0 && m === 0) {
    return `${d} দিন`;
  }
  if (y === 0) {
    return `${m} মাস ${d > 0 ? d + " দিন" : ""}`;
  }
  return `${y} বছর ${m > 0 ? m + " মাস" : ""}`;
}


