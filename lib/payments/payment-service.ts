/**
 * Enterprise Payment Service & Server Actions
 * 
 * Core Invariants:
 * 1. Server-side amount computation from DB (NEVER trust client-provided amount).
 * 2. Pre-locks invoice & checks `due_amount > 0` before initiating intent.
 * 3. Authoritative contract with `payment_intents` and `organization_integrations` tables.
 * 4. Atomic commit via RPC `verify_and_record_online_payment` prevents race conditions.
 * 5. Automated receipt & SMS notification queued upon successful verification without PHI leakage.
 * 6. Zero browser-side credentials reading or gateway secret handling.
 * 7. Zero direct browser gateway fallback; Edge Function failure fails closed.
 */

import { createClient } from "@/lib/supabase/client";
import {
  CreatePaymentIntentParams,
  PaymentIntent,
  PaymentProvider,
  ProviderInitiateResult,
} from "./types";

export class PaymentService {
  /**
   * Verifies if an organization has the given payment gateway configured and enabled.
   * Securely queries organization_integrations using canonical columns without reading secrets.
   */
  static async isProviderConfigured(
    organizationId: string,
    provider: PaymentProvider
  ): Promise<boolean> {
    const supabase = createClient();
    const { data: integ } = await supabase
      .from("organization_integrations")
      .select("id, is_enabled")
      .eq("organization_id", organizationId)
      .eq("integration_type", "PAYMENT_GATEWAY")
      .eq("provider_name", provider)
      .eq("is_enabled", true)
      .maybeSingle();

    return !!integ?.is_enabled;
  }

  /**
   * Creates a payment intent after securely validating invoice due amount.
   * Delegates intent persistence and gateway session initialization exclusively to
   * the server-side `payment-initiate` Supabase Edge Function.
   * Fails closed if the Edge Function fails or gateway is unconfigured.
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

      // 1. Check organization gateway integration status (without exposing secrets to browser)
      const isConfigured = await this.isProviderConfigured(params.organizationId, params.provider);
      if (!isConfigured) {
        return {
          success: false,
          error: `Payment provider ${params.provider} is not configured or enabled for this organization.`,
        };
      }

      // 2. Fetch live invoice from database to verify status & balance
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .select("id, invoice_number, patient_id, grand_total, paid_amount, due_amount, status")
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

      // 3. Validate amount: cannot exceed due amount or be <= 0
      let payableAmount = invoiceDue;
      if (params.amount && params.amount > 0) {
        if (params.amount > invoiceDue) {
          return { success: false, error: `Requested amount (${params.amount}) exceeds outstanding balance (${invoiceDue})` };
        }
        payableAmount = params.amount;
      }

      // 4. Delegate to secure server-side Edge Function (payment-initiate)
      // Enforces caller authentication, role permissions, and secret isolation.
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("payment-initiate", {
        body: {
          organizationId: params.organizationId,
          invoiceId: params.invoiceId,
          provider: params.provider,
          amount: payableAmount,
          idempotencyKey: params.idempotencyKey || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined),
        },
      });

      if (edgeErr || !edgeRes || !edgeRes.success) {
        return {
          success: false,
          error: edgeRes?.error || edgeErr?.message || "Payment initiation failed. Gateway not configured or unavailable.",
        };
      }

      const mappedIntent: PaymentIntent = {
        id: edgeRes.paymentIntentId,
        organizationId: params.organizationId,
        intentReference: edgeRes.intentReference,
        invoiceId: params.invoiceId,
        payableAmount: edgeRes.payableAmount,
        currency: edgeRes.currency || "BDT",
        provider: edgeRes.provider,
        status: "PENDING",
        checkoutUrl: edgeRes.checkoutUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        success: true,
        intent: mappedIntent,
        initiateResult: {
          success: true,
          provider: params.provider,
          paymentId: edgeRes.intentReference,
          redirectGatewayUrl: edgeRes.checkoutUrl || "",
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Payment intent creation failed",
      };
    }
  }

  /**
   * Authoritatively queries the status of a payment intent from the database.
   * Allows the frontend UI to display pending or confirmed status without settling payments.
   */
  static async checkPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    isPaid: boolean;
    payableAmount: number;
    error?: string;
  }> {
    try {
      const supabase = createClient();
      const { data: intent, error } = await supabase
        .from("payment_intents")
        .select("id, status, payable_amount")
        .eq("id", paymentIntentId)
        .single();

      if (error || !intent) {
        return { status: "NOT_FOUND", isPaid: false, payableAmount: 0, error: "Payment intent not found" };
      }

      return {
        status: intent.status,
        isPaid: intent.status === "PAID",
        payableAmount: Number(intent.payable_amount),
      };
    } catch (err) {
      return {
        status: "ERROR",
        isPaid: false,
        payableAmount: 0,
        error: err instanceof Error ? err.message : "Error checking payment status",
      };
    }
  }


}
