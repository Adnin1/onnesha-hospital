/**
 * Enterprise Payment Gateway Types & Contracts
 * 
 * Supports bKash Tokenized Checkout, Nagad Direct Merchant API,
 * and SSLCommerz Session Redirect / IPN.
 * 
 * Invariants:
 * - Authoritative DB columns: intent_reference, payable_amount, provider_session_id, checkout_url, status
 * - Authoritative DB statuses: CREATED, PENDING, AUTHORIZED, PAID, FAILED, EXPIRED, REFUNDED
 */

export type PaymentProvider = "BKASH" | "NAGAD" | "SSLCOMMERZ";

export type PaymentIntentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  // Backward compatibility aliases
  | "PROCESSING"
  | "SUCCEEDED"
  | "CANCELLED"
  | "PARTIALLY_REFUNDED";

export interface PaymentIntent {
  id: string;
  organizationId: string;
  intentReference: string;
  invoiceId: string;
  patientId?: string | null;
  payableAmount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentIntentStatus;
  idempotencyKey?: string;
  providerSessionId?: string | null;
  providerTransactionId?: string | null;
  checkoutUrl?: string | null;
  expiresAt?: string;
  verifiedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;

  // Backward-compatibility field aliases:
  intentNumber?: string;
  amount?: number;
  providerPaymentId?: string | null;
  redirectUrl?: string | null;
  clientIp?: string | null;
  webhookReceivedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreatePaymentIntentParams {
  organizationId: string;
  invoiceId: string;
  provider: PaymentProvider;
  amount?: number; // Optional partial pay; validated against server invoice due
  clientIp?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderInitiateResult {
  success: boolean;
  provider: PaymentProvider;
  paymentId: string;
  redirectGatewayUrl: string;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderVerifyResult {
  success: boolean;
  provider: PaymentProvider;
  providerTransactionId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderRefundParams {
  paymentId: string;
  transactionId: string;
  amount: number;
  reason: string;
  sku?: string;
}

export interface ProviderRefundResult {
  success: boolean;
  provider: PaymentProvider;
  refundTransactionId: string;
  amount: number;
  status: "REFUNDED" | "FAILED";
  errorMessage?: string;
}

export interface PaymentGatewayAdapter {
  provider: PaymentProvider;
  initiatePayment(params: {
    intentNumber: string;
    amount: number;
    currency: string;
    callbackUrl: string;
    customerPhone: string;
    customerName: string;
  }): Promise<ProviderInitiateResult>;

  verifyPayment(params: {
    paymentId: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<ProviderVerifyResult>;

  refundPayment(params: ProviderRefundParams): Promise<ProviderRefundResult>;
}
