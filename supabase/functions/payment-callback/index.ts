import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-internal-webhook-secret",
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
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-internal-webhook-secret",
    },
    isAllowed: true,
  };
}

/**
 * Constant-time comparison to prevent timing side-channel attacks.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Computes HMAC-SHA256 hex digest of raw request payload.
 */
async function computeHmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe string comparison for hex digests and bearer secrets.
 */
function safeCompareStrings(strA: string, strB: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(strA.trim());
  const bufB = encoder.encode(strB.trim());
  return timingSafeEqual(bufA, bufB);
}

// -------------------------------------------------------------------------------------
// Dedicated Provider Adapter Architecture
// Each provider encapsulates its own official verification protocol requirements.
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
 * Official Protocol: Requires bKash Public Key certificate or Tokenized API queryPayment.
 * Fails closed if live credentials are not configured.
 */
class BkashAdapter implements PaymentProviderAdapter {
  readonly providerName = "BKASH";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    if (!params.secret) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "bKash live merchant credentials not configured. Official merchant verification pending onboarding.",
      };
    }

    // In reconciliation or test mode with configured webhook secret
    const expected = await computeHmacSha256Hex(params.secret, params.rawBody);
    if (!safeCompareStrings(expected.toLowerCase(), (params.signature || "").toLowerCase())) {
      return { verified: false, code: "INVALID_WEBHOOK_SIGNATURE", error: "bKash webhook signature verification failed" };
    }
    return { verified: true };
  }
}

/**
 * Nagad Webhook / Notification Adapter
 * Official Protocol: Requires asymmetric RSA key pair and Nagad public certificate verification.
 * Fails closed if live credentials are not configured.
 */
class NagadAdapter implements PaymentProviderAdapter {
  readonly providerName = "NAGAD";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    if (!params.secret) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "Nagad live merchant credentials not configured. Official merchant verification pending onboarding.",
      };
    }

    const expected = await computeHmacSha256Hex(params.secret, params.rawBody);
    if (!safeCompareStrings(expected.toLowerCase(), (params.signature || "").toLowerCase())) {
      return { verified: false, code: "INVALID_WEBHOOK_SIGNATURE", error: "Nagad webhook signature verification failed" };
    }
    return { verified: true };
  }
}

/**
 * SSLCommerz IPN Adapter
 * Official Protocol: Requires Store ID, Store Password, and Order Validation API (validationserverAPI.php).
 * Fails closed if live credentials are not configured.
 */
class SslCommerzAdapter implements PaymentProviderAdapter {
  readonly providerName = "SSLCOMMERZ";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    if (!params.secret) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "SSLCommerz live merchant credentials not configured. Official merchant verification pending onboarding.",
      };
    }

    const expected = await computeHmacSha256Hex(params.secret, params.rawBody);
    if (!safeCompareStrings(expected.toLowerCase(), (params.signature || "").toLowerCase())) {
      return { verified: false, code: "INVALID_WEBHOOK_SIGNATURE", error: "SSLCommerz IPN signature verification failed" };
    }
    return { verified: true };
  }
}

const PROVIDER_ADAPTERS: Record<string, PaymentProviderAdapter> = {
  BKASH: new BkashAdapter(),
  NAGAD: new NagadAdapter(),
  SSLCOMMERZ: new SslCommerzAdapter(),
};

serve(async (req: Request) => {
  const { headers: cors, isAllowed } = getCorsHeaders(req);

  if (!isAllowed) {
    return new Response(
      JSON.stringify({ success: false, error: "CORS origin rejected" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed. Only POST is accepted." }),
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
        JSON.stringify({ success: false, error: "Empty request body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 2. Identify caller credentials
    const providerSig = req.headers.get("x-provider-signature") || req.headers.get("x-webhook-signature");
    const internalSecretHeader = req.headers.get("x-internal-webhook-secret");
    const configuredInternalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");

    const isInternalService = Boolean(
      internalSecretHeader &&
      configuredInternalSecret &&
      safeCompareStrings(internalSecretHeader, configuredInternalSecret)
    );

    // 3. Reject direct client browser settlement calls unconditionally
    if (!providerSig && !isInternalService) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "CLIENT_SETTLEMENT_PROHIBITED",
          error: "Direct client payment settlement is prohibited. Settlement must be driven by verified provider webhook or internal reconciliation service.",
        }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Malformed JSON payload" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const { provider, intentReference, providerTransactionId, paidAmount } = body as {
      provider?: string;
      intentReference?: string;
      providerTransactionId?: string;
      paidAmount?: number | string;
    };

    if (!provider || !intentReference || !providerTransactionId || !paidAmount) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing mandatory callback fields: provider, intentReference, providerTransactionId, paidAmount" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const normalizedCallbackProvider = String(provider).toUpperCase();
    const adapter = PROVIDER_ADAPTERS[normalizedCallbackProvider];
    if (!adapter) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported callback provider: ${provider}` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 4. Authoritatively load payment intent from database
    const { data: intent, error: intentError } = await supabaseClient
      .from("payment_intents")
      .select("id, organization_id, provider, status, payable_amount")
      .eq("intent_reference", intentReference)
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ success: false, error: "Payment intent not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 5. CRITICAL: Strict Provider Matching Check
    const storedIntentProvider = String(intent.provider).toUpperCase();
    if (normalizedCallbackProvider !== storedIntentProvider) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "PROVIDER_MISMATCH",
          error: `Provider mismatch: callback specifies ${normalizedCallbackProvider} but intent was created for ${storedIntentProvider}. Settlement rejected.`,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 6. Check intent status (Replay Protection)
    if (intent.status === "PAID") {
      return new Response(
        JSON.stringify({ success: true, message: "Payment intent is already settled" }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (intent.status !== "PENDING" && intent.status !== "AUTHORIZED") {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid payment intent state for settlement: ${intent.status}` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 7. Cryptographic Signature Verification via Provider Adapter
    if (!isInternalService) {
      const providerSecretEnvKey = `${normalizedCallbackProvider}_WEBHOOK_SECRET`;
      const providerWebhookSecret = Deno.env.get(providerSecretEnvKey);

      const verification = await adapter.verifyWebhook({
        rawBody,
        signature: providerSig || undefined,
        secret: providerWebhookSecret,
        body,
      });

      if (!verification.verified) {
        return new Response(
          JSON.stringify({
            success: false,
            code: verification.code || "INVALID_WEBHOOK_SIGNATURE",
            status: verification.code === "LIVE_MERCHANT_DEFERRED" ? "REAL_MERCHANT_DEFERRED" : undefined,
            error: verification.error || "Provider webhook verification failed",
          }),
          { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }

    // 8. Amount verification to prevent tampering
    if (Number(paidAmount) !== Number(intent.payable_amount)) {
      return new Response(
        JSON.stringify({ success: false, error: `Paid amount (${paidAmount}) does not match intent amount (${intent.payable_amount})` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 9. Execute atomic DB settlement RPC (runs as service_role)
    // cashier_id is omitted (defaults to NULL) for automated gateway settlement
    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("verify_and_record_online_payment", {
      p_org_id: intent.organization_id,
      p_intent_id: intent.id,
      p_provider_trx_id: providerTransactionId,
      p_paid_amount: Number(paidAmount),
      p_gateway_method: intent.provider,
    });

    if (rpcErr) {
      return new Response(
        JSON.stringify({ success: false, error: rpcErr.message }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(rpcRes),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal callback error";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
