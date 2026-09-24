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
 * Normalizes role names from database (e.g., "Super Admin", "Lab Technician", "Cashier")
 * to standard lowercase snake_case RoleType identifiers (e.g., "super_admin", "lab_technician", "accountant").
 */
export function normalizeRole(roleName: string | null | undefined): string {
  if (!roleName) return "";
  const cleaned = roleName.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (cleaned === "cashier") return "accountant";
  if (cleaned === "pathologist") return "lab_technician";
  return cleaned;
}

