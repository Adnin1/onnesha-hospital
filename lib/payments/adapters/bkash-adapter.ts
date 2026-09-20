/**
 * bKash Tokenized Checkout Adapter
 * 
 * Supports:
 * - Token grant / refresh
 * - Create payment session (returns bKash checkout URL)
 * - Execute payment (verifies payment on server)
 * - Query payment
 * - Refund transaction
 * 
 * Fails closed if integration credentials not present. Zero mock confirmation.
 */

import {
  PaymentGatewayAdapter,
  PaymentProvider,
  ProviderInitiateResult,
  ProviderRefundParams,
  ProviderRefundResult,
  ProviderVerifyResult,
} from "../types";

export interface BkashConfig {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  isSandbox?: boolean;
}

export class BkashAdapter implements PaymentGatewayAdapter {
  provider: PaymentProvider = "BKASH";
  private config: BkashConfig | null;
  private baseUrl: string;

  constructor(config?: BkashConfig | null) {
    this.config = config || null;
    this.baseUrl = config?.isSandbox
      ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
      : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";
  }

  private async getGrantToken(): Promise<string | null> {
    if (!this.config || !this.config.appKey || !this.config.appSecret) {
      return null;
    }

    const res = await fetch(`${this.baseUrl}/token/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        username: this.config.username,
        password: this.config.password,
      },
      body: JSON.stringify({
        app_key: this.config.appKey,
        app_secret: this.config.appSecret,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { id_token?: string };
    return data.id_token || null;
  }

  async initiatePayment(params: {
    intentNumber: string;
    amount: number;
    currency: string;
    callbackUrl: string;
    customerPhone: string;
    customerName: string;
  }): Promise<ProviderInitiateResult> {
    if (!this.config || !this.config.appKey) {
      return {
        success: false,
        provider: "BKASH",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: "bKash gateway not configured with merchant credentials. Ready for organization_integrations setup.",
      };
    }

    try {
      const idToken = await this.getGrantToken();
      if (!idToken) {
        return {
          success: false,
          provider: "BKASH",
          paymentId: "",
          redirectGatewayUrl: "",
          errorMessage: "Failed to obtain bKash auth token with provided credentials.",
        };
      }

      const res = await fetch(`${this.baseUrl}/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "X-APP-Key": this.config.appKey,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: params.customerPhone,
          callbackURL: params.callbackUrl,
          amount: params.amount.toFixed(2),
          currency: params.currency || "BDT",
          intent: "sale",
          merchantInvoiceNumber: params.intentNumber,
        }),
      });

      const data = (await res.json()) as {
        paymentID?: string;
        bkashURL?: string;
        statusMessage?: string;
        statusCode?: string;
      };

      if (res.ok && data.paymentID && data.bkashURL) {
        return {
          success: true,
          provider: "BKASH",
          paymentId: data.paymentID,
          redirectGatewayUrl: data.bkashURL,
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      return {
        success: false,
        provider: "BKASH",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: data.statusMessage || `bKash payment initiation failed (${data.statusCode})`,
        rawResponse: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        provider: "BKASH",
        paymentId: "",
        redirectGatewayUrl: "",
        errorMessage: err instanceof Error ? err.message : "bKash network transport error",
      };
    }
  }

  async verifyPayment(params: {
    paymentId: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<ProviderVerifyResult> {
    if (!this.config || !this.config.appKey) {
      return {
        success: false,
        provider: "BKASH",
        providerTransactionId: "",
        providerPaymentId: params.paymentId,
        amount: 0,
        currency: "BDT",
        status: "FAILED",
        errorMessage: "bKash gateway not configured.",
      };
    }

    try {
      const idToken = await this.getGrantToken();
      if (!idToken) {
        return {
          success: false,
          provider: "BKASH",
          providerTransactionId: "",
          providerPaymentId: params.paymentId,
          amount: 0,
          currency: "BDT",
          status: "FAILED",
          errorMessage: "Failed to authenticate with bKash for verification.",
        };
      }

      const res = await fetch(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "X-APP-Key": this.config.appKey,
        },
        body: JSON.stringify({ paymentID: params.paymentId }),
      });

      const data = (await res.json()) as {
        paymentID?: string;
        trxID?: string;
        amount?: string;
        currency?: string;
        transactionStatus?: string;
        statusMessage?: string;
      };

      if (res.ok && data.trxID && data.transactionStatus === "Completed") {
        return {
          success: true,
          provider: "BKASH",
          providerTransactionId: data.trxID,
          providerPaymentId: data.paymentID || params.paymentId,
          amount: parseFloat(data.amount || "0"),
          currency: data.currency || "BDT",
          status: "COMPLETED",
          rawResponse: data as unknown as Record<string, unknown>,
        };
      }

      return {
        success: false,
        provider: "BKASH",
        providerTransactionId: data.trxID || "",
        providerPaymentId: data.paymentID || params.paymentId,
        amount: parseFloat(data.amount || "0"),
        currency: data.currency || "BDT",
        status: data.transactionStatus === "Cancelled" ? "CANCELLED" : "FAILED",
        errorMessage: data.statusMessage || "bKash execution rejected.",
        rawResponse: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        provider: "BKASH",
        providerTransactionId: "",
        providerPaymentId: params.paymentId,
        amount: 0,
        currency: "BDT",
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "bKash verify exception",
      };
    }
  }

  async refundPayment(params: ProviderRefundParams): Promise<ProviderRefundResult> {
    if (!this.config || !this.config.appKey) {
      return {
        success: false,
        provider: "BKASH",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: "bKash config missing.",
      };
    }

    try {
      const idToken = await this.getGrantToken();
      if (!idToken) {
        return {
          success: false,
          provider: "BKASH",
          refundTransactionId: "",
          amount: params.amount,
          status: "FAILED",
          errorMessage: "Auth token failed",
        };
      }

      const res = await fetch(`${this.baseUrl}/payment/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "X-APP-Key": this.config.appKey,
        },
        body: JSON.stringify({
          paymentID: params.paymentId,
          amount: params.amount.toFixed(2),
          trxID: params.transactionId,
          sku: params.sku || "hospital_service",
          reason: params.reason,
        }),
      });

      const data = (await res.json()) as { refundTrxID?: string; transactionStatus?: string; statusMessage?: string };

      if (res.ok && data.refundTrxID) {
        return {
          success: true,
          provider: "BKASH",
          refundTransactionId: data.refundTrxID,
          amount: params.amount,
          status: "REFUNDED",
        };
      }

      return {
        success: false,
        provider: "BKASH",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: data.statusMessage || "bKash refund rejected",
      };
    } catch (err) {
      return {
        success: false,
        provider: "BKASH",
        refundTransactionId: "",
        amount: params.amount,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "bKash refund exception",
      };
    }
  }
}
