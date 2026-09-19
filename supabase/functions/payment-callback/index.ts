import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-internal-webhook-secret",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed. Only POST is accepted." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Check for verified provider webhook signature or trusted internal secret
    const providerSig = req.headers.get("x-provider-signature") || req.headers.get("x-webhook-signature");
    const internalSecret = req.headers.get("x-internal-webhook-secret");
    const configuredInternalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const isInternalService = internalSecret && configuredInternalSecret && internalSecret === configuredInternalSecret;

    // 2. Reject direct client browser settlement calls unconditionally
    // Client browsers calling this function with user JWTs or without provider signature are strictly rejected
    if (!providerSig && !isInternalService) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "CLIENT_SETTLEMENT_PROHIBITED",
          error: "Direct client payment settlement is prohibited. Settlement must be driven by verified provider webhook or internal reconciliation service.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { provider, intentReference, providerTransactionId, paidAmount } = body;

    if (!provider || !intentReference || !providerTransactionId || !paidAmount) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing mandatory callback fields: provider, intentReference, providerTransactionId, paidAmount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Find payment intent authoritatively
    const { data: intent, error: intentError } = await supabaseClient
      .from("payment_intents")
      .select("id, organization_id, provider, status, payable_amount")
      .eq("intent_reference", intentReference)
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ success: false, error: "Payment intent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (intent.status === "PAID") {
      return new Response(
        JSON.stringify({ success: true, message: "Payment intent is already settled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (intent.status !== "PENDING" && intent.status !== "AUTHORIZED") {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid payment intent state for settlement: ${intent.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify provider integration credentials are configured on server
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Amount verification to prevent tampering
    if (Number(paidAmount) !== Number(intent.payable_amount)) {
      return new Response(
        JSON.stringify({ success: false, error: `Paid amount (${paidAmount}) does not match intent amount (${intent.payable_amount})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Call atomic DB settlement RPC
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(rpcRes),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal callback error";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
