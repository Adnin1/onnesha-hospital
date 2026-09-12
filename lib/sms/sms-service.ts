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

/**
 * Bangladesh SMS Gateway Abstraction Service
 * Easily swap between SSL Wireless, Greenweb, Elitbuzz, or Twilio
 */
export async function sendSMS(options: SendSMSOptions): Promise<SMSResponse> {
  const { recipientPhone, message, smsType } = options;

  // Clean Bangladeshi phone number to format 8801XXXXXXXXX
  const cleanedPhone = recipientPhone.replace(/[^0-9]/g, "");
  const formattedNumber = cleanedPhone.startsWith("88")
    ? cleanedPhone
    : cleanedPhone.startsWith("01")
    ? `88${cleanedPhone}`
    : cleanedPhone;

  // Log in console during development
  console.log(`[SMS Gateway BD] [${smsType.toUpperCase()}] To: ${formattedNumber}`);
  console.log(`Message: "${message}"`);

  const apiEndpoint = process.env.SMS_API_ENDPOINT;
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || "ONNESHA";

  if (!apiEndpoint || !apiKey) {
    // Development / Simulation mode
    return {
      success: true,
      providerResponseId: `SIM-${Date.now()}`,
    };
  }

  try {
    const res = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        senderid: senderId,
        number: formattedNumber,
        message: message,
      }),
    });

    const data = await res.json();
    return {
      success: res.ok,
      providerResponseId: data?.msg_id || data?.message_id || "OK",
    };
  } catch (err: any) {
    console.error("SMS Gateway Delivery Error:", err);
    return {
      success: false,
      error: err.message || "Failed to dispatch SMS",
    };
  }
}

/**
 * Helper to generate appointment SMS template
 */
export function buildAppointmentSMS(
  doctorName: string,
  tokenNumber: string,
  timeSlot: string
): string {
  return `Onnesha Hospital: Your appointment with ${doctorName} is confirmed. Token: ${tokenNumber}. Time: ${timeSlot}. Hotline: 01712-345678.`;
}

/**
 * Helper to generate token call SMS template
 */
export function buildTokenCallSMS(tokenNumber: string, roomNumber: string): string {
  return `Onnesha Hospital: Token ${tokenNumber}, please proceed to ${roomNumber}. Your consultation is starting now.`;
}
