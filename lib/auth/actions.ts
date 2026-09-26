import { redirect } from "next/navigation";
import { SITE_CONFIG } from "@/config/site";

export interface AuthActionResult {
  success: boolean;
  error?: string;
  mfaRequired?: boolean;
}

/**
 * Maps internal/Supabase raw error messages to user-friendly safe messages without leaking sensitive account existence.
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

/**
 * Helper to dynamically load Supabase server client on demand without breaking client component imports.
 */
async function getServerSupabase() {
  const { createClient } = await import("../supabase/server");
  return createClient();
}

/**
 * Real Server Action for password-based login against Supabase Auth.
 */
export async function loginAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "ইমেইল এবং পাসওয়ার্ড প্রদান করা বাধ্যতামূলক।" };
  }

  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: mapSafeAuthError(error.message) };
    }

    // Check MFA Assurance level requirement
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
      return { success: true, mfaRequired: true };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? mapSafeAuthError(err.message) : "অথেন্টিকেশন সার্ভিসে সাময়িক সমস্যা হয়েছে।";
    return { success: false, error: message };
  }

  redirect("/app/dashboard");
}

/**
 * Real Server Action for staff logout.
 */
export async function logoutAction() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Real Server Action for password reset request.
 */
export async function requestPasswordResetAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim();

  if (!email) {
    return { success: false, error: "অনুগ্রহ করে আপনার রেজিস্টার্ড ইমেইল টাইপ করুন।" };
  }

  try {
    const supabase = await getServerSupabase();
    // Use configured site URL, defaulting to SITE_CONFIG or production domain https://onneshahospital.com
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || SITE_CONFIG.canonicalUrl || "https://onneshahospital.com";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });

    if (error) {
      return { success: false, error: mapSafeAuthError(error.message) };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? mapSafeAuthError(err.message) : "পাসওয়ার্ড রিকোয়েস্ট পাঠাতে ব্যর্থ হয়েছে।";
    return { success: false, error: message };
  }
}
