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
  if (lower.includes("too many requests") || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return "অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে লগইন ব্লক করা হয়েছে। কয়েক মিনিট পর চেষ্টা করুন।";
  }
  if (lower.includes("user disabled") || lower.includes("user_disabled")) {
    return "আপনার অ্যাকাউন্টটি সাময়িকভাবে নিষ্ক্রিয় আছে। সিস্টেম অ্যাডমিনের সাথে যোগাযোগ করুন।";
  }

  return "অ্যালার্ট: লগইন সম্পন্ন করা সম্ভব হয়নি। আপনার ইমেইল ও পাসওয়ার্ড চেক করুন।";
}
