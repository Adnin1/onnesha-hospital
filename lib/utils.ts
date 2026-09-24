import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBDT(amount: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace("BDT", "৳");
}

export function formatDateBDT(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatTimeBDT(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
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

