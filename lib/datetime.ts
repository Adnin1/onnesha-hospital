/**
 * Authoritative timezone-aware date and time formatting utilities for OHMS.
 * All hospital day boundaries and date calculations operate in the Asia/Dhaka (UTC+6) timezone.
 */

export const DHAKA_TIMEZONE = "Asia/Dhaka";

/**
 * Returns YYYY-MM-DD string in Asia/Dhaka timezone.
 * Handles hospital day boundaries correctly (e.g., UTC 18:00+ is the next day in Bangladesh).
 */
export function getDhakaDateString(date: Date | string | number = new Date()): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Returns formatted 12-hour time in Asia/Dhaka timezone (e.g., "02:30:00 PM").
 */
export function getDhakaTimeString(date: Date | string | number = new Date()): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DHAKA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Checks if a given date string (YYYY-MM-DD) is today in Asia/Dhaka.
 */
export function isTodayDhaka(dateString: string): boolean {
  return dateString === getDhakaDateString();
}
