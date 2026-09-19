import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Secure CORS configuration: Restrict to production and local authorized origins
const ALLOWED_ORIGINS = [
  "https://onnesha-hospital.pages.dev",
  "http://localhost:3000",
  "tauri://localhost",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-internal-webhook-secret",
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
 * Timing-safe string comparison for hex digests.
 */
function safeCompareHex(hexA: string, hexB: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(hexA.trim().toLowerCase());
  const bufB = encoder.encode(hexB.trim().toLowerCase());
  return timingSafeEqual(bufA, bufB);
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

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
      internalSecretHeader === configuredInternalSecret
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

    const normalizedProvider = String(provider).toUpperCase();

    // 4. Cryptographic HMAC Signature Verification for External Webhooks
    if (!isInternalService) {
      const providerSecretEnvKey = `${normalizedProvider}_WEBHOOK_SECRET`;
      const providerWebhookSecret = Deno.env.get(providerSecretEnvKey);

      if (!providerWebhookSecret) {
        // Production Safety Invariant: Real gateway merchant credentials are unconfigured/deferred.
        // Webhook fails closed safely if provider secret is not configured on server.
        return new Response(
          JSON.stringify({
            success: false,
            code: "WEBHOOK_SECRET_NOT_CONFIGURED",
            status: "REAL_MERCHANT_DEFERRED",
            error: `Webhook secret for ${normalizedProvider} is not configured. Gateway integration is intentionally deferred.`,
          }),
          { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      // Compute HMAC-SHA256 of raw request payload
      const expectedSignature = await computeHmacSha256Hex(providerWebhookSecret, rawBody);
      const isSignatureValid = safeCompareHex(expectedSignature, providerSig || "");

      if (!isSignatureValid) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "INVALID_WEBHOOK_SIGNATURE",
            error: "Cryptographic webhook signature verification failed. Request rejected.",
          }),
          { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Authoritatively load payment intent from database
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

    // 6. Verify provider integration credentials exist and are active
    const { data: integ } = await supabaseClient
      .from("organization_integrations")
      .select("encrypted_credentials, environment, is_enabled")
      .eq("organization_id", intent.organization_id)
      .eq("integration_type", "PAYMENT_GATEWAY")
      .eq("provider_name", intent.provider)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!integ || !integ.is_enabled || !integ.encrypted_credentials || Object.keys(integ.encrypted_credentials as object).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "NOT_CONFIGURED",
          error: `Payment provider ${intent.provider} credentials are not configured on server.`,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 7. Amount verification to prevent tampering
    if (Number(paidAmount) !== Number(intent.payable_amount)) {
      return new Response(
        JSON.stringify({ success: false, error: `Paid amount (${paidAmount}) does not match intent amount (${intent.payable_amount})` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 8. Execute atomic DB settlement RPC (runs as service_role)
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
