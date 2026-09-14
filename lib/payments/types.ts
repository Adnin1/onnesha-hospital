/**
 * Enterprise Payment Gateway Types & Contracts
 * 
 * Supports bKash Tokenized Checkout, Nagad Direct Merchant API,
 * and SSLCommerz Session Redirect / IPN.
 */

export type PaymentProvider = "BKASH" | "NAGAD" | "SSLCOMMERZ";

export type PaymentIntentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface PaymentIntent {
  id: string;
  organizationId: string;
  intentNumber: string;
  invoiceId: string;
  patientId?: string | null;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentIntentStatus;
  providerTransactionId?: string | null;
  providerPaymentId?: string | null;
  clientIp?: string | null;
  redirectUrl?: string | null;
  webhookReceivedAt?: string | null;
  verifiedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
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
