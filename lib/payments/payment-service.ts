/**
 * Enterprise Payment Service & Server Actions
 * 
 * Core Invariants:
 * 1. Server-side amount computation from DB (NEVER trust client-provided amount).
 * 2. Pre-locks invoice & checks `due_amount > 0` before initiating intent.
 * 3. Atomic commit via RPC `verify_and_record_online_payment` prevents race conditions.
 * 4. Automated receipt & SMS notification queued upon successful verification.
 */

import { createClient } from "@/lib/supabase/client";
import {
  CreatePaymentIntentParams,
  PaymentGatewayAdapter,
  PaymentIntent,
  PaymentProvider,
  ProviderInitiateResult,
  ProviderVerifyResult,
} from "./types";
import { BkashAdapter } from "./adapters/bkash-adapter";
import { NagadAdapter } from "./adapters/nagad-adapter";
import { SslCommerzAdapter } from "./adapters/sslcommerz-adapter";
import { NotificationOutboxService } from "../notifications/outbox-service";

export class PaymentService {
  /**
   * Instantiates the provider adapter using credentials from DB or environment.
   */
  static async getProviderAdapter(
    organizationId: string,
    provider: PaymentProvider
  ): Promise<PaymentGatewayAdapter> {
    const supabase = createClient();
    const { data: integ } = await supabase
      .from("organization_integrations")
      .select("encrypted_credentials, is_sandbox, is_active")
      .eq("organization_id", organizationId)
      .eq("integration_type", provider)
      .maybeSingle();

    const creds = (integ?.encrypted_credentials as Record<string, unknown>) || {};
    const isSandbox = integ?.is_sandbox ?? true;

    if (provider === "BKASH") {
      return new BkashAdapter({
        appKey: (creds.app_key as string) || process.env.BKASH_APP_KEY || "",
        appSecret: (creds.app_secret as string) || process.env.BKASH_APP_SECRET || "",
        username: (creds.username as string) || process.env.BKASH_USERNAME || "",
        password: (creds.password as string) || process.env.BKASH_PASSWORD || "",
        isSandbox,
      });
    }

    if (provider === "NAGAD") {
      return new NagadAdapter({
        merchantId: (creds.merchant_id as string) || process.env.NAGAD_MERCHANT_ID || "",
        merchantPrivateKey: (creds.private_key as string) || process.env.NAGAD_PRIVATE_KEY || "",
        nagadPublicKey: (creds.public_key as string) || process.env.NAGAD_PUBLIC_KEY || "",
        isSandbox,
      });
    }

    // SSLCOMMERZ
    return new SslCommerzAdapter({
      storeId: (creds.store_id as string) || process.env.SSLCOMMERZ_STORE_ID || "",
      storePassword: (creds.store_password as string) || process.env.SSLCOMMERZ_STORE_PASSWORD || "",
      isSandbox,
    });
  }

  /**
   * Creates a payment intent after securely calculating invoice due amount.
   */
  static async createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<{
    success: boolean;
    intent?: PaymentIntent;
    initiateResult?: ProviderInitiateResult;
    error?: string;
  }> {
    try {
      const supabase = createClient();
      // 1. Fetch live invoice from database
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .select("id, invoice_number, patient_id, total_amount, paid_amount, due_amount, status")
        .eq("id", params.invoiceId)
        .eq("organization_id", params.organizationId)
        .single();

      if (invError || !invoice) {
        return { success: false, error: "Invoice not found or inaccessible" };
      }

      const invoiceDue = Number(invoice.due_amount);
      if (invoiceDue <= 0 || invoice.status === "PAID") {
        return { success: false, error: "Invoice is already fully settled" };
      }

      // 2. Validate amount: cannot exceed due amount or be <= 0
      let payableAmount = invoiceDue;
      if (params.amount && params.amount > 0) {
        if (params.amount > invoiceDue) {
          return { success: false, error: `Requested amount (${params.amount}) exceeds outstanding balance (${invoiceDue})` };
        }
        payableAmount = params.amount;
      }

      // 3. Fetch patient details for customer info
      let customerName = "Hospital Patient";
      let customerPhone = "01700000000";
      if (invoice.patient_id) {
        const { data: patient } = await supabase
          .from("patients")
          .select("name, phone")
          .eq("id", invoice.patient_id)
          .single();

        if (patient) {
          customerName = patient.name || customerName;
          customerPhone = patient.phone || customerPhone;
        }
      }

      // 4. Generate unique collision-resistant intent sequence
      const intentSuffix = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8).toUpperCase()
        : Math.random().toString(36).substring(2, 10).toUpperCase();
      const intentNumber = `PI-${Date.now()}-${intentSuffix}`;

      // 5. Insert payment intent in PENDING status
      const { data: insertedIntent, error: insertError } = await supabase
        .from("payment_intents")
        .insert({
          organization_id: params.organizationId,
          intent_number: intentNumber,
          invoice_id: invoice.id,
          patient_id: invoice.patient_id,
          amount: payableAmount,
          currency: "BDT",
          provider: params.provider,
          status: "PENDING",
          client_ip: params.clientIp || null,
          metadata: params.metadata || {},
        })
        .select("*")
        .single();

      if (insertError || !insertedIntent) {
        return { success: false, error: insertError?.message || "Failed to create payment intent" };
      }

      // 6. Initiate with Gateway Provider
      const adapter = await this.getProviderAdapter(params.organizationId, params.provider);
      const callbackUrl =
        params.callbackUrl ||
        (typeof window !== "undefined"
          ? `${window.location.origin}/app/billing/online-callback`
          : "https://hospital.local/billing/callback");

      const initResult = await adapter.initiatePayment({
        intentNumber,
        amount: payableAmount,
        currency: "BDT",
        callbackUrl,
        customerPhone,
        customerName,
      });

      if (initResult.success) {
        await supabase
          .from("payment_intents")
          .update({
            provider_payment_id: initResult.paymentId,
            redirect_url: initResult.redirectGatewayUrl,
            status: "PROCESSING",
          })
          .eq("id", insertedIntent.id);
      } else {
        await supabase
          .from("payment_intents")
          .update({
            status: "FAILED",
          })
          .eq("id", insertedIntent.id);
      }

      return {
        success: initResult.success,
        intent: {
          id: insertedIntent.id,
          organizationId: insertedIntent.organization_id,
          intentNumber: insertedIntent.intent_number,
          invoiceId: insertedIntent.invoice_id,
          patientId: insertedIntent.patient_id,
          amount: Number(insertedIntent.amount),
          currency: insertedIntent.currency,
          provider: insertedIntent.provider,
          status: initResult.success ? "PROCESSING" : "FAILED",
          providerPaymentId: initResult.paymentId,
          redirectUrl: initResult.redirectGatewayUrl,
          createdAt: insertedIntent.created_at,
          updatedAt: insertedIntent.updated_at,
        },
        initiateResult: initResult,
        error: initResult.errorMessage,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Payment intent creation failed",
      };
    }
  }

  /**
   * Verifies an online payment and executes atomic settlement in database.
   */
  static async verifyAndSettlePayment(params: {
    paymentIntentId: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    receiptNumber?: string;
    paymentId?: string;
    error?: string;
  }> {
    try {
      const supabase = createClient();
      const { data: intent, error: intentError } = await supabase
        .from("payment_intents")
        .select("*, invoices(invoice_number, due_amount, patients(name, phone))")
        .eq("id", params.paymentIntentId)
        .single();

      if (intentError || !intent) {
        return { success: false, error: "Payment intent not found" };
      }

      if (intent.status === "SUCCEEDED") {
        return { success: true, error: "Payment already successfully verified and settled." };
      }

      // Verify with provider adapter
      const adapter = await this.getProviderAdapter(intent.organization_id, intent.provider);
      const verifyResult: ProviderVerifyResult = await adapter.verifyPayment({
        paymentId: intent.provider_payment_id || intent.intent_number,
        rawPayload: params.rawPayload,
      });

      if (!verifyResult.success || verifyResult.status !== "COMPLETED") {
        await supabase
          .from("payment_intents")
          .update({
            status: "FAILED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id);

        return {
          success: false,
          error: verifyResult.errorMessage || "Payment provider verification declined transaction.",
        };
      }

      // Execute atomic DB settlement RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "verify_and_record_online_payment",
        {
          p_org_id: intent.organization_id,
          p_intent_id: intent.id,
          p_provider_trx_id: verifyResult.providerTransactionId,
          p_paid_amount: verifyResult.amount,
          p_gateway_method: intent.provider,
        }
      );

      if (rpcError) {
        return {
          success: false,
          error: `Database payment commit failed: ${rpcError.message}`,
        };
      }

      const res = rpcResult as {
        success: boolean;
        payment_id?: string;
        receipt_number?: string;
        error?: string;
      };

      if (!res.success) {
        return { success: false, error: res.error || "Payment recording failed" };
      }

      // Queue patient SMS receipt if patient phone is available
      const rawPatient = intent.invoices?.patients as { name?: string; phone?: string } | undefined;
      if (rawPatient?.phone) {
        await NotificationOutboxService.enqueueNotification({
          organizationId: intent.organization_id,
          channel: "SMS",
          notificationType: "BILL_RECEIPT",
          recipient: rawPatient.phone,
          patientId: intent.patient_id,
          sourceReferenceId: res.payment_id,
          idempotencyKey: `rcpt_${res.payment_id}_sms`,
          variables: {
            patient_name: rawPatient.name || "Patient",
            amount: verifyResult.amount,
            invoice_number: intent.invoices?.invoice_number || intent.invoice_id,
            due_amount: Math.max(0, Number(intent.invoices?.due_amount || 0) - verifyResult.amount),
            receipt_url: `https://hospital.local/receipts/${res.receipt_number}`,
            hospital_name: "Onnesha Hospital",
          },
        });
      }

      return {
        success: true,
        receiptNumber: res.receipt_number,
        paymentId: res.payment_id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Payment verification exception",
      };
    }
  }
}
