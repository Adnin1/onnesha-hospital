/**
 * SSLCommerz Payment Gateway Adapter
 * 
 * Supports:
 * - Session initiation (Gateway Page redirect URL)
 * - Order Validation API (verifying `val_id` on SSLCommerz server)
 * - Refund API
 */

import {
  PaymentGatewayAdapter,
  PaymentProvider,
  ProviderInitiateResult,
  ProviderRefundParams,
  ProviderRefundResult,
  ProviderVerifyResult,
} from "../types";
import { HOSPITAL_METADATA } from "@/config/hospital";

export interface SslCommerzConfig {
  storeId: string;
  storePassword: string;
  isSandbox?: boolean;
}

export class SslCommerzAdapter implements PaymentGatewayAdapter {
  provider: PaymentProvider = "SSLCOMMERZ";
  private config: SslCommerzConfig | null;
  private baseUrl: string;

  constructor(config?: SslCommerzConfig | null) {
    this.config = config || null;
    this.baseUrl = config?.isSandbox
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com";
  }

  async initiatePayment(params: {
    intentNumber: string;
    amount: number;
    currency: string;
    callbackUrl: string;
    customerPhone: string;
    customerName: string;
  }): Promise<ProviderInitiateResult> {
    if (!this.config || !this.config.storeId || !this.config.storePassword) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: "SSLCommerz credentials not configured. Ready for integration setup.",
      };
    }

    try {
      const initUrl = `${this.baseUrl}/gwprocess/v4/api.php`;
      const form = new URLSearchParams({
        store_id: this.config.storeId,
        store_passwd: this.config.storePassword,
        total_amount: params.amount.toFixed(2),
        currency: params.currency || "BDT",
        tran_id: params.intentNumber,
        success_url: `${params.callbackUrl}?status=success&tran_id=${params.intentNumber}`,
        fail_url: `${params.callbackUrl}?status=fail&tran_id=${params.intentNumber}`,
        cancel_url: `${params.callbackUrl}?status=cancel&tran_id=${params.intentNumber}`,
        ipn_url: `${params.callbackUrl}/ipn`,
        cus_name: params.customerName || "Patient",
        cus_email: process.env.NEXT_PUBLIC_HOSPITAL_BILLING_EMAIL || HOSPITAL_METADATA.email,
        cus_add1: "Hospital Reception",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        cus_phone: params.customerPhone,
        shipping_method: "NO",
        product_name: "Hospital Services",
        product_category: "Healthcare",
        product_profile: "general",
      });

      const res = await fetch(initUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });

      const data = (await res.json()) as {
        status?: string;
        failedreason?: string;
        sessionkey?: string;
        GatewayPageURL?: string;
      };

      if (data.status === "SUCCESS" && data.GatewayPageURL) {
        return {
          success: true,
          provider: "SSLCOMMERZ",
          paymentId: data.sessionkey || params.intentNumber,
          redirectGatewayUrl: data.GatewayPageURL,
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      return {
        success: false,
        provider: "SSLCOMMERZ",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: data.failedreason || "SSLCommerz session creation failed",
        rawResponse: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: err instanceof Error ? err.message : "SSLCommerz initiate exception",
      };
    }
  }

  async verifyPayment(params: {
    paymentId: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<ProviderVerifyResult> {
    if (!this.config || !this.config.storeId || !this.config.storePassword) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        providerTransactionId: "",
        providerPaymentId: params.paymentId,
        amount: 0,
        currency: "BDT",
        status: "FAILED",
        errorMessage: "SSLCommerz credentials missing.",
      };
    }

    try {
      const valId = (params.rawPayload?.val_id as string) || params.paymentId;
      const validateUrl = `${this.baseUrl}/validator/api/validationserverAPI.php?val_id=${valId}&store_id=${this.config.storeId}&store_passwd=${this.config.storePassword}&v=1&format=json`;

      const res = await fetch(validateUrl);
      const data = (await res.json()) as {
        status?: string;
        tran_id?: string;
        val_id?: string;
        amount?: string;
        currency?: string;
        bank_tran_id?: string;
        error?: string;
      };

      if (data.status === "VALID" || data.status === "VALIDATED") {
        return {
          success: true,
          provider: "SSLCOMMERZ",
          providerTransactionId: data.bank_tran_id || data.tran_id || valId,
          providerPaymentId: data.val_id || valId,
          amount: parseFloat(data.amount || "0"),
          currency: data.currency || "BDT",
          status: "COMPLETED",
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      return {
        success: false,
        provider: "SSLCOMMERZ",
        providerTransactionId: data.tran_id || "",
        providerPaymentId: valId,
        amount: parseFloat(data.amount || "0"),
        currency: data.currency || "BDT",
        status: "FAILED",
        errorMessage: data.error || `SSLCommerz validation status: ${data.status}`,
        rawResponse: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        providerTransactionId: "",
        providerPaymentId: params.paymentId,
        amount: 0,
        currency: "BDT",
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "SSLCommerz validation exception",
      };
    }
  }

  async refundPayment(params: ProviderRefundParams): Promise<ProviderRefundResult> {
    if (!this.config || !this.config.storeId || !this.config.storePassword) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: "SSLCommerz credentials missing",
      };
    }

    try {
      const refundUrl = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?refund_amount=${params.amount.toFixed(2)}&refund_remarks=${encodeURIComponent(params.reason)}&bank_tran_id=${params.transactionId}&store_id=${this.config.storeId}&store_passwd=${this.config.storePassword}&v=1&format=json`;

      const res = await fetch(refundUrl);
      const data = (await res.json()) as { status?: string; refund_ref_id?: string; error_reason?: string };

      if (data.status === "success" && data.refund_ref_id) {
        return {
          success: true,
          provider: "SSLCOMMERZ",
          refundTransactionId: data.refund_ref_id,
          amount: params.amount,
          status: "REFUNDED",
        };
      }

      return {
        success: false,
        provider: "SSLCOMMERZ",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: data.error_reason || "SSLCommerz refund failed",
      };
    } catch (err) {
      return {
        success: false,
        provider: "SSLCOMMERZ",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "SSLCommerz refund exception",
      };
    }
  }
}
