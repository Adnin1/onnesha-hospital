/**
 * Pure client/server safe error mapper for Supabase authentication.
 * Maps raw internal database/auth messages to user-friendly messages without leaking account existence.
 */
export function mapSafeAuthError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে পরীক্ষা করুন।";
  }
  if (lower.includes("email not confirmed")) {
    return "আপনার অ্যাকাউন্টটি এখনো ইমেইল এর মাধ্যমে নিশ্চিত করা হয়নি।";
  }
  if (lower.includes("email") && (lower.includes("rate limit") || lower.includes("rate_limit"))) {
    return "অতিরিক্ত রিকোয়েস্টের কারণে সাময়িকভাবে রিকভারি ইমেইল প্রেরণ স্থগিত আছে। কিছুক্ষণ পর চেষ্টা করুন, অথবা আপনার পাসওয়ার্ড দিয়ে সরাসরি লগইন করুন।";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return "অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে অনুরোধটি স্থগিত করা হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।";
  }
  if (lower.includes("user disabled") || lower.includes("user_disabled")) {
    return "আপনার অ্যাকাউন্টটি সাময়িকভাবে নিষ্ক্রিয় আছে। সিস্টেম অ্যাডমিনের সাথে যোগাযোগ করুন।";
  }

  return "অ্যালার্ট: লগইন সম্পন্ন করা সম্ভব হয়নি। আপনার ইমেইল ও পাসওয়ার্ড চেক করুন।";
}

/**
 * Strict internal URL sanitizer to prevent open redirect vulnerabilities (CWE-601).
 * Rejects absolute URLs, external protocol prefixes, double slashes, backslashes,
 * URL-encoded evasion vectors (%2f%2f, %5c), control characters, and non-http schemes.
 */
export function sanitizeRedirectPath(path: string | null | undefined, fallback: string = "/app/dashboard"): string {
  if (!path || typeof path !== "string") return fallback;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  // Check for ASCII control characters and DEL
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }
  // Check for external protocol specifiers
  if (trimmed.includes("://")) {
    return fallback;
  }

  // Iteratively decode to catch nested percent-encoding (up to 3 levels)
  let decoded = trimmed;
  for (let i = 0; i < 3; i++) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch (err: unknown) {
      console.error("[SafeErrors] decodeURIComponent error:", err);
      return fallback;
    }
  }

  const decodedLower = decoded.toLowerCase();
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decodedLower.includes("://") ||
    decodedLower.includes("javascript:") ||
    decodedLower.includes("data:") ||
    decodedLower.includes("vbscript:") ||
    /[\x00-\x1F\x7F]/.test(decoded)
  ) {
    return fallback;
  }

  return trimmed;
}
