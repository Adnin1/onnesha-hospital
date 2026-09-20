/**
 * Bangladesh Mobile Phone Normalization & Validation Utility
 * Standardizes mobile phone numbers across all variations (e.g., 017xxxxxxxx, 88017xxxxxxxx, +88017xxxxxxxx)
 * into a single canonical 11-digit local format: 01xxxxxxxxx.
 */

export function normalizeBDPhone(phone: string): string {
  if (!phone) return "";

  // Strip all whitespace, dashes, parens, and plus signs
  let cleaned = phone.replace(/[\s\-()+]/g, "");

  // Remove leading country code if present (880)
  if (cleaned.startsWith("880")) {
    cleaned = cleaned.substring(2); // keeps '01xxxxxxxxx'
  } else if (cleaned.startsWith("88")) {
    cleaned = cleaned.substring(2);
  }

  // Ensure leading 0
  if (cleaned.length === 10 && cleaned.startsWith("1")) {
    cleaned = "0" + cleaned;
  }

  return cleaned;
}

export function isValidNormalizedBDPhone(normalized: string): boolean {
  return /^01[3-9]\d{8}$/.test(normalized);
}

export function formatBDPhoneDisplay(phone: string): string {
  const norm = normalizeBDPhone(phone);
  if (norm.length === 11) {
    return `${norm.slice(0, 5)}-${norm.slice(5)}`;
  }
  return phone;
}
