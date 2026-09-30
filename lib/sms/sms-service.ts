/**
 * Bangladesh SMS Gateway Service
 * 
 * ARCHITECTURE: This is the convenience entrypoint for SMS sending.
 * It delegates all actual delivery to BangladeshSmsAdapter (lib/notifications/adapters/sms-adapter.ts),
 * which is the SINGLE AUTHORITATIVE SMS transport implementation.
 * 
 * Callers should use either:
 *   1. This module's sendSMS() for simple one-off sends, OR
 *   2. NotificationOutboxService for transactional outbox-pattern sends (preferred for clinical use).
 * 
 * Both paths converge on BangladeshSmsAdapter — there is exactly ONE SMS gateway integration layer.
 */

import { HOSPITAL_METADATA } from "@/config/hospital";
import { BangladeshSmsAdapter } from "@/lib/notifications/adapters/sms-adapter";

export interface SendSMSOptions {
  recipientPhone: string;
  message: string;
  smsType: "appointment_confirm" | "token_alert" | "bill_receipt" | "lab_ready" | "otp";
}

export interface SMSResponse {
  success: boolean;
  providerResponseId?: string;
  error?: string;
}

// Singleton adapter instance — reuses environment config
let _adapter: BangladeshSmsAdapter | null = null;
function getAdapter(): BangladeshSmsAdapter {
  if (!_adapter) {
    _adapter = new BangladeshSmsAdapter();
  }
  return _adapter;
}

/**
 * Send an SMS via the authoritative BangladeshSmsAdapter.
 * Fails closed if gateway is not configured with live credentials.
 * Never returns success: true unless the provider actually accepted the message.
 */
export async function sendSMS(options: SendSMSOptions): Promise<SMSResponse> {
  const { recipientPhone, message, smsType } = options;

  // Guard debug logging to development only; mask phone number for PHI/PII compliance
  if (process.env.NODE_ENV === "development") {
    const cleaned = recipientPhone.replace(/[^0-9]/g, "");
    const masked = cleaned.length > 6
      ? `${cleaned.slice(0, 4)}****${cleaned.slice(-3)}`
      : "****";
    console.log(`[SMS Gateway BD] [${smsType.toUpperCase()}] To: ${masked}`);
  }

  const apiKey = process.env.SMS_API_KEY || process.env.SMS_GATEWAY_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "SMS Gateway not configured: SMS_API_KEY or SMS_GATEWAY_API_KEY environment variable required.",
    };
  }

  const adapter = getAdapter();
  const result = await adapter.send({
    recipientPhone,
    message,
  });

  return {
    success: result.success,
    providerResponseId: result.providerMessageId,
    error: result.error,
  };
}

/**
 * Helper to generate appointment SMS template
 */
export function buildAppointmentSMS(
  doctorName: string,
  tokenNumber: string,
  timeSlot: string
): string {
  const hotline = HOSPITAL_METADATA.emergencyHotline || "01718835623";
  return `Onnesha Hospital: Your appointment with ${doctorName} is confirmed. Token: ${tokenNumber}. Time: ${timeSlot}. Hotline: ${hotline}.`;
}

/**
 * Helper to generate token call SMS template
 */
export function buildTokenCallSMS(tokenNumber: string, roomNumber: string): string {
  return `Onnesha Hospital: Token ${tokenNumber}, please proceed to ${roomNumber}. Your consultation is starting now.`;
}
