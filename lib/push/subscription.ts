/**
 * Push Notification Subscription Management
 * - VAPID public key from environment only
 * - VAPID private key NEVER exposed to client
 * - Tenant-isolated subscriptions
 * - Safe notification content (no PHI)
 */

import { createClient } from "@/lib/supabase/client";

export interface PushSubscriptionRecord {
  id: string;
  organization_id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  browser: string | null;
  device: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * Get VAPID public key from environment.
 * Private key must ONLY be used server-side.
 */
export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

/**
 * Subscribe the current browser to push notifications.
 */
export async function subscribeToPush(
  organizationId: string,
  userId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { success: false, error: "Push notifications not supported in this browser." };
  }

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    return { success: false, error: "Push notification configuration not available. Contact administrator." };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const subJson = subscription.toJSON();
    const supabase = createClient();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        endpoint: subJson.endpoint || "",
        p256dh: subJson.keys?.p256dh || "",
        auth: subJson.keys?.auth || "",
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" :
                 navigator.userAgent.includes("Firefox") ? "Firefox" :
                 navigator.userAgent.includes("Safari") ? "Safari" : "Other",
        device: /Mobile|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        last_used_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "endpoint" }
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Subscription failed." };
  }
}

/**
 * Revoke (unsubscribe) push notifications.
 */
export async function revokePushSubscription(): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { success: false, error: "Not supported." };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { success: true };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const supabase = createClient();
    await supabase
      .from("push_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("endpoint", endpoint);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unsubscribe failed." };
  }
}

/**
 * Safe notification content templates.
 * NEVER include PHI (patient names, diagnoses, prescriptions, etc.)
 */
export const SAFE_NOTIFICATION_TEMPLATES = {
  APPOINTMENT_REMINDER: {
    title: "Onnesha Hospital",
    body: "আপনার একটি অ্যাপয়েন্টমেন্ট বিজ্ঞপ্তি আছে।",
  },
  PAYMENT_UPDATE: {
    title: "Onnesha Hospital",
    body: "একটি পেমেন্ট আপডেট আছে। বিস্তারিত দেখতে লগইন করুন।",
  },
  GENERAL: {
    title: "Onnesha Hospital",
    body: "আপনার একটি নতুন বিজ্ঞপ্তি আছে।",
  },
} as const;
