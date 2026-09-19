import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

// Secure CORS configuration: Restrict to production and local authorized origins
const ALLOWED_ORIGINS = [
  "https://onnesha-hospital.pages.dev",
  "http://localhost:3000",
  "tauri://localhost",
];

function getCorsHeaders(req: Request): { headers: Record<string, string>; isAllowed: boolean } {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser or server-to-server webhook request
    return {
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-correlation-id",
      },
      isAllowed: true,
    };
  }

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return {
      headers: {},
      isAllowed: false,
    };
  }

  return {
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-correlation-id",
    },
    isAllowed: true,
  };
}

/**
 * Constant-time comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Timing-safe string comparison for hex digests and bearer secrets.
 */
export function safeCompareStrings(strA: string, strB: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(strA.trim());
  const bufB = encoder.encode(strB.trim());
  return timingSafeEqual(bufA, bufB);
}

// -------------------------------------------------------------------------------------
// Dedicated Official Provider Adapter Architecture
// Each provider encapsulates its own official verification protocol requirements:
// - bKash: Tokenized Checkout Query API / RSA signature verification
// - Nagad: Asymmetric RSA Key Exchange and Signature Verification
// - SSLCommerz: Server-to-Server Order Validation API (validationserverAPI.php)
// When live merchant credentials are unconfigured, adapters fail closed safely.
// -------------------------------------------------------------------------------------
interface ProviderVerificationResult {
  verified: boolean;
  code?: string;
  error?: string;
  providerTransactionId?: string;
}

interface PaymentProviderAdapter {
  providerName: string;
  verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult>;
}

/**
 * bKash Webhook / IPN Adapter
 * Official Protocol: Requires bKash Tokenized Checkout queryPayment API (/tokenized/checkout/payment/query)
 * or RSA signature verification using official bKash public key certificate.
 * Live merchant onboarding and direct checkout integration is an external provider dependency (LIVE_MERCHANT_DEFERRED).
 * This adapter explicitly fails closed without simulating verification or using generic HMAC.
 */
class BkashAdapter implements PaymentProviderAdapter {
  readonly providerName = "BKASH";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const appKey = Deno.env.get("BKASH_APP_KEY");
    const appSecret = params.secret || Deno.env.get("BKASH_APP_SECRET");

    if (!appKey || !appSecret) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "bKash live merchant credentials (BKASH_APP_KEY, BKASH_APP_SECRET) not configured. Official Tokenized queryPayment deferred.",
      };
    }

    // Official bKash Tokenized Checkout protocol requires server-to-server queryPayment or official RSA certificate verification.
    // Generic HMAC is not the official protocol; live settlement is deferred until live merchant onboarding completes.
    return {
      verified: false,
      code: "LIVE_MERCHANT_DEFERRED",
      error: "bKash live merchant onboarding and official Tokenized Checkout API query integration is pending activation (LIVE_MERCHANT_DEFERRED).",
    };
  }
}

/**
 * Nagad Webhook / Notification Adapter
 * Official Protocol: Requires Nagad Public Key and Merchant Private Key with asymmetric RSA decryption
 * and server-to-server verification endpoint (/check-payment-status).
 * Live merchant onboarding is an external provider dependency (LIVE_MERCHANT_DEFERRED).
 * This adapter explicitly fails closed without simulating verification or using generic HMAC.
 */
class NagadAdapter implements PaymentProviderAdapter {
  readonly providerName = "NAGAD";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const merchantId = Deno.env.get("NAGAD_MERCHANT_ID");
    const nagadPublicKey = params.secret || Deno.env.get("NAGAD_PUBLIC_KEY");

    if (!merchantId || !nagadPublicKey) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "Nagad live merchant credentials (NAGAD_MERCHANT_ID, NAGAD_PUBLIC_KEY) not configured. Cryptographic verification deferred.",
      };
    }

    // Official Nagad protocol requires Asymmetric RSA verification and server query.
    // Generic HMAC is not the official protocol; live settlement is deferred until live merchant onboarding completes.
    return {
      verified: false,
      code: "LIVE_MERCHANT_DEFERRED",
      error: "Nagad live merchant onboarding and official Asymmetric Key verification is pending activation (LIVE_MERCHANT_DEFERRED).",
    };
  }
}

/**
 * SSLCommerz IPN Adapter
 * Official Protocol: Requires Store ID, Store Password, and Order Validation API (validationserverAPI.php).
 * Authoritatively verifies amount, currency, and transaction status via validationserverAPI.php.
 */
class SslCommerzAdapter implements PaymentProviderAdapter {
  readonly providerName = "SSLCOMMERZ";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const storePassword = params.secret || Deno.env.get("SSLCOMMERZ_STORE_PASSWD");
    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
    const valId = (params.body?.val_id as string) || (params.body?.providerTransactionId as string);

    if (!storeId || !storePassword) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "SSLCommerz live credentials (STORE_ID, STORE_PASSWD) not configured. Order Validation API deferred.",
      };
    }

    if (!valId) {
      return {
        verified: false,
        code: "INVALID_CALLBACK",
        error: "SSLCommerz callback missing val_id for Order Validation API verification.",
      };
    }

    try {
      const isSandbox = Deno.env.get("SSLCOMMERZ_IS_SANDBOX") === "true";
      const baseUrl = isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
      const validationUrl = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePassword)}&v=1&format=json`;

      // Bounded 10-second timeout prevents hung requests
      const res = await fetch(validationUrl, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (data.status === "VALID" || data.status === "VALIDATED") {
        // Strict reference matching: tran_id from gateway must match intentReference
        if (params.body?.intentReference && data.tran_id && String(data.tran_id).trim() !== String(params.body.intentReference).trim()) {
          return {
            verified: false,
            code: "REFERENCE_MISMATCH",
            error: `SSLCommerz Order Validation transaction reference (${data.tran_id}) does not match payment intent reference (${params.body.intentReference})`,
          };
        }

        // Authoritative verification of amount against Order Validation response
        if (params.body?.paidAmount !== undefined && params.body?.paidAmount !== null) {
          const callbackAmount = Number(params.body.paidAmount);
          const validatedAmount = Number(data.amount);
          if (Number.isFinite(validatedAmount) && Math.abs(callbackAmount - validatedAmount) > 0.01) {
            return {
              verified: false,
              code: "AMOUNT_MISMATCH",
              error: `SSLCommerz Order Validation amount (${validatedAmount}) does not match callback amount (${callbackAmount})`,
            };
          }
        }

        // Strict currency validation: BOTH currency_type and currency (if present) must be BDT
        if (!data.currency_type || String(data.currency_type).toUpperCase() !== "BDT" || (data.currency && String(data.currency).toUpperCase() !== "BDT")) {
          return {
            verified: false,
            code: "CURRENCY_MISMATCH",
            error: `SSLCommerz Order Validation currency (${data.currency_type || data.currency || "MISSING"}) is not authorized BDT`,
          };
        }

        return {
          verified: true,
          providerTransactionId: data.bank_tran_id || data.tran_id || valId,
        };
      }
      return {
        verified: false,
        code: "UNAUTHORIZED",
        error: data.failedreason || data.error || "SSLCommerz Order Validation API returned invalid status",
      };
    } catch (err: unknown) {
      return {
        verified: false,
        code: "PROVIDER_UNAVAILABLE",
        error: err instanceof Error ? err.message : "SSLCommerz validation request failed or timed out",
      };
    }
  }
}

const PROVIDER_ADAPTERS: Record<string, PaymentProviderAdapter> = {
  BKASH: new BkashAdapter(),
  NAGAD: new NagadAdapter(),
  SSLCOMMERZ: new SslCommerzAdapter(),
};

serve(async (req: Request) => {
  const { headers: cors, isAllowed } = getCorsHeaders(req);
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();

  if (!isAllowed) {
    return new Response(
      JSON.stringify({ success: false, code: "UNAUTHORIZED", error: "CORS origin rejected", correlationId }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Method not allowed. Only POST is accepted.", correlationId }),
      { status: 405, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Read raw body text for exact cryptographic signature verification
    const rawBody = await req.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Empty request body", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 2. Strict external provider signature verification (Internal webhook bypasses eliminated)
    const providerSig = req.headers.get("x-provider-signature") || req.headers.get("x-webhook-signature");

    if (!providerSig) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "CLIENT_SETTLEMENT_PROHIBITED",
          error: "Direct client payment settlement is prohibited. Settlement must be driven by verified external provider webhook.",
          correlationId,
        }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Malformed JSON payload", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const { provider, intentReference, providerTransactionId, paidAmount } = body as {
      provider?: string;
      intentReference?: string;
      providerTransactionId?: string;
      paidAmount?: number | string;
    };

    if (!provider || !intentReference || !providerTransactionId || paidAmount === undefined || paidAmount === null) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "INVALID_CALLBACK",
          error: "Missing mandatory callback fields: provider, intentReference, providerTransactionId, paidAmount",
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Strict non-empty trimmed transaction ID validation
    const trimmedClientTrxId = typeof providerTransactionId === "string" ? providerTransactionId.trim() : "";
    if (trimmedClientTrxId.length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Missing or empty provider transaction ID", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Strict finite positive numeric amount parsing & validation
    const parsedAmount = typeof paidAmount === "number" ? paidAmount : Number(paidAmount);
    if (!Number.isFinite(parsedAmount) || isNaN(parsedAmount) || parsedAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Invalid payment amount: must be a positive finite number", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const normalizedCallbackProvider = String(provider).toUpperCase();
    const adapter = PROVIDER_ADAPTERS[normalizedCallbackProvider];
    if (!adapter) {
      return new Response(
        JSON.stringify({ success: false, code: "PROVIDER_MISMATCH", error: `Unsupported callback provider: ${provider}`, correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 3. Authoritatively load payment intent from database
    const { data: intent, error: intentError } = await supabaseClient
      .from("payment_intents")
      .select("id, organization_id, provider, status, payable_amount, provider_transaction_id")
      .eq("intent_reference", intentReference)
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ success: false, code: "PAYMENT_INTENT_NOT_FOUND", error: "Payment intent not found", correlationId }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 4. Durable Webhook Events Ledger (Audit & Deduplication)
    const providerEventId = (typeof body.provider_event_id === "string" && body.provider_event_id.trim())
      || (typeof body.val_id === "string" && body.val_id.trim())
      || trimmedClientTrxId;

    const { data: existingEvent } = await supabaseClient
      .from("webhook_events")
      .select("id, processing_status")
      .eq("organization_id", intent.organization_id)
      .eq("provider", normalizedCallbackProvider)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (existingEvent && existingEvent.processing_status === "PROCESSED") {
      return new Response(
        JSON.stringify({
          success: true,
          code: "DUPLICATE_TRANSACTION",
          message: "Webhook event has already been processed successfully",
          correlationId,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    let webhookEventId: string | null = null;
    const { data: insertedEvent } = await supabaseClient
      .from("webhook_events")
      .insert({
        organization_id: intent.organization_id,
        provider: normalizedCallbackProvider,
        event_type: "PAYMENT_NOTIFICATION",
        provider_event_id: providerEventId,
        signature_header: (providerSig || "").slice(0, 250),
        is_signature_valid: false,
        payload: body,
        processing_status: "RECEIVED",
        correlation_id: correlationId,
      })
      .select("id")
      .maybeSingle();

    if (insertedEvent?.id) {
      webhookEventId = insertedEvent.id;
    }

    // 5. CRITICAL: Strict Provider Matching Check
    const storedIntentProvider = String(intent.provider).toUpperCase();
    if (normalizedCallbackProvider !== storedIntentProvider) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "PROVIDER_MISMATCH",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "PROVIDER_MISMATCH",
          error: `Provider mismatch: callback specifies ${normalizedCallbackProvider} but intent was created for ${storedIntentProvider}. Settlement rejected.`,
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 6. Check intent status (Replay Protection)
    if (intent.status === "PAID") {
      if (intent.provider_transaction_id && intent.provider_transaction_id === trimmedClientTrxId) {
        if (webhookEventId) {
          await supabaseClient.from("webhook_events").update({
            processing_status: "PROCESSED",
            processed_at: new Date().toISOString(),
          }).eq("id", webhookEventId);
        }
        return new Response(
          JSON.stringify({ success: true, message: "Payment intent is already settled with this transaction ID", correlationId }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "REPLAY_CONFLICT",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }

      return new Response(
        JSON.stringify({
          success: false,
          code: "REPLAY_CONFLICT",
          error: `Payment intent is already settled with transaction ID '${intent.provider_transaction_id}', but callback received '${trimmedClientTrxId}'. Conflict rejected.`,
          correlationId,
        }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (intent.status !== "PENDING" && intent.status !== "AUTHORIZED") {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "INVALID_INTENT_STATE",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: `Invalid payment intent state for settlement: ${intent.status}`, correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 7. Mandatory Provider Official Verification (Fails closed if live credentials unconfigured)
    let authoritativeTrxId = trimmedClientTrxId;
    const providerSecretEnvKey = `${normalizedCallbackProvider}_WEBHOOK_SECRET`;
    const providerWebhookSecret = Deno.env.get(providerSecretEnvKey);

    const verification = await adapter.verifyWebhook({
      rawBody,
      signature: providerSig || undefined,
      secret: providerWebhookSecret,
      body,
    });

    if (!verification.verified) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: verification.code || "UNAUTHORIZED",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: verification.code || "UNAUTHORIZED",
          status: verification.code === "LIVE_MERCHANT_DEFERRED" ? "REAL_MERCHANT_DEFERRED" : undefined,
          error: verification.error || "Provider webhook verification failed",
          correlationId,
        }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (webhookEventId) {
      await supabaseClient.from("webhook_events").update({ is_signature_valid: true }).eq("id", webhookEventId);
    }

    // If provider returns an authoritative transaction ID (e.g. SSLCommerz bank_tran_id), enforce it
    if (verification.providerTransactionId && typeof verification.providerTransactionId === "string" && verification.providerTransactionId.trim().length > 0) {
      authoritativeTrxId = verification.providerTransactionId.trim();
    }

    // 8. Amount verification against intent to prevent tampering
    if (parsedAmount !== Number(intent.payable_amount)) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "AMOUNT_MISMATCH",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "AMOUNT_MISMATCH",
          error: `Paid amount (${parsedAmount}) does not match intent amount (${intent.payable_amount})`,
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 9. Execute atomic DB settlement RPC (runs as service_role)
    // cashier_id is omitted (defaults to NULL) for automated gateway settlement.
    // The RPC atomically settles invoice, updates intent, inserts payment, and logs audit record in one transaction.
    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("verify_and_record_online_payment", {
      p_org_id: intent.organization_id,
      p_intent_id: intent.id,
      p_provider_trx_id: authoritativeTrxId,
      p_paid_amount: parsedAmount,
      p_gateway_method: intent.provider,
    });

    if (rpcErr) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "INTERNAL_ERROR",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "INTERNAL_ERROR",
          error: "Payment settlement transaction failed",
          correlationId,
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (rpcRes && rpcRes.success === false) {
      const code = rpcRes.code === "DUPLICATE_TRANSACTION" ? "DUPLICATE_TRANSACTION" : (rpcRes.code || "INVALID_CALLBACK");
      const status = code === "DUPLICATE_TRANSACTION" ? 409 : 400;
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: code,
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code,
          error: rpcRes.error || "Payment settlement could not be completed",
          correlationId,
        }),
        { status, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Settlement succeeded atomically! Update durable webhook ledger to PROCESSED
    if (webhookEventId) {
      await supabaseClient.from("webhook_events").update({
        processing_status: "PROCESSED",
        processed_at: new Date().toISOString(),
      }).eq("id", webhookEventId);
    }

    return new Response(
      JSON.stringify({ ...rpcRes, correlationId }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        code: "INTERNAL_ERROR",
        error: "An unexpected error occurred during webhook processing",
        correlationId,
      }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
