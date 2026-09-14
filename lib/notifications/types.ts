export type NotificationChannel = "SMS" | "WHATSAPP" | "EMAIL";

export type NotificationType =
  | "APPOINTMENT_CONFIRMED"
  | "TOKEN_ASSIGNED"
  | "APPOINTMENT_REMINDER"
  | "BILL_RECEIPT"
  | "PAYMENT_FAILED"
  | "DUE_REMINDER"
  | "REPORT_READY"
  | "ADMISSION_NOTICE"
  | "DISCHARGE_NOTICE"
  | "OTP";

export type NotificationStatus =
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export interface NotificationJob {
  id?: string;
  organizationId: string;
  channel: NotificationChannel;
  notificationType: NotificationType;
  recipient: string; // E.164 / BD phone (01XXXXXXXXX) or Email
  patientId?: string | null;
  sourceReferenceId?: string | null; // appointmentId, invoiceId, token
  idempotencyKey: string;
  subject?: string | null;
  messageContent: string;
  status?: NotificationStatus;
  providerName?: string;
  providerMessageId?: string;
  attemptCount?: number;
  maxRetries?: number;
  nextRetryAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  createdAt?: string;
}

export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  providerName: string;
  status: "SENT" | "DELIVERED" | "FAILED";
  error?: string;
}

export interface SmsProviderAdapter {
  providerName: string;
  send(options: {
    recipientPhone: string;
    message: string;
    senderId?: string;
  }): Promise<ProviderSendResult>;
}

export interface WhatsAppProviderAdapter {
  providerName: string;
  sendTemplate(options: {
    recipientPhone: string;
    templateName: string;
    languageCode: string;
    parameters: Array<{ type: "text"; text: string }>;
  }): Promise<ProviderSendResult>;
}

export interface EmailProviderAdapter {
  providerName: string;
  send(options: {
    recipientEmail: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    fromEmail?: string;
  }): Promise<ProviderSendResult>;
}
