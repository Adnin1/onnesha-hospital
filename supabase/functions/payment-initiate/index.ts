import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const ALLOWED_ORIGINS = [
  "https://onnesha-hospital.pages.dev",
  "http://localhost:3000",
  "tauri://localhost",
];

function getCorsHeaders(req: Request): { headers: Record<string, string>; isAllowed: boolean } {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser or same-origin request
    return {
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
    isAllowed: true,
  };
}

serve(async (req: Request) => {
  const { headers: corsHeaders, isAllowed } = getCorsHeaders(req);

  if (!isAllowed) {
    return new Response(
      JSON.stringify({ success: false, error: "CORS origin rejected" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

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

    // 1. Caller Authentication via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid or expired authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { organizationId, invoiceId, provider, amount, idempotencyKey: clientIdempotencyKey } = body;

    if (!organizationId || !invoiceId || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required parameters: organizationId, invoiceId, provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedProvider = String(provider).toUpperCase();
    if (!["BKASH", "NAGAD", "SSLCOMMERZ"].includes(normalizedProvider)) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported payment provider: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Role-based Access Control: Caller profile must exist and be active, and caller must belong to the organization
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.is_active !== true) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Active user profile is required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userRoleRecords, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role_id, organization_id, roles(name)")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId);

    if (roleError || !userRoleRecords || userRoleRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: User does not have an active role in this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Authoritatively load invoice from database (never trust client-supplied amounts or org boundaries)
    const { data: invoice, error: invError } = await supabaseClient
      .from("invoices")
      .select("id, invoice_number, patient_id, grand_total, paid_amount, due_amount, status, organization_id")
      .eq("id", invoiceId)
      .eq("organization_id", organizationId)
      .single();

    if (invError || !invoice) {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice not found or inaccessible" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dueAmount = Number(invoice.due_amount);
    if (dueAmount <= 0 || invoice.status === "PAID") {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice already fully settled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strict amount validation: Do not silently fallback on invalid input
    let payableAmount: number;
    if (amount !== undefined && amount !== null) {
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid payment amount: must be a positive finite number" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (numAmount > dueAmount) {
        return new Response(
          JSON.stringify({ success: false, error: `Requested payment amount (${numAmount}) exceeds outstanding invoice due (${dueAmount})` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      payableAmount = numAmount;
    } else {
      payableAmount = dueAmount;
    }

    // 4. Robust Database-backed Idempotency Check (Zero Date.now() timestamp fallback)
    const idempotencyKey = clientIdempotencyKey && typeof clientIdempotencyKey === "string" && clientIdempotencyKey.trim().length > 0
      ? clientIdempotencyKey.trim()
      : `idem_${organizationId}_${invoiceId}_${normalizedProvider}`;

    const { data: existingIntent } = await supabaseClient
      .from("payment_intents")
      .select("id, invoice_id, provider, intent_reference, status, payable_amount, checkout_url")
      .eq("organization_id", organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingIntent) {
      // Reject if idempotency key is reused with conflicting parameters
      if (
        existingIntent.invoice_id !== invoiceId ||
        existingIntent.provider !== normalizedProvider ||
        Number(existingIntent.payable_amount) !== Number(payableAmount)
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "IDEMPOTENCY_CONFLICT",
            error: "Idempotency key conflict: key was previously used with different payment parameters (invoice, provider, or amount).",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          isDuplicate: true,
          paymentIntentId: existingIntent.id,
          intentReference: existingIntent.intent_reference,
          status: existingIntent.status,
          payableAmount: existingIntent.payable_amount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Verify provider integration exists, has credentials, and is active
    const { data: integ } = await supabaseClient
      .from("organization_integrations")
      .select("encrypted_credentials, environment, is_enabled")
      .eq("organization_id", organizationId)
      .eq("integration_type", "PAYMENT_GATEWAY")
      .eq("provider_name", normalizedProvider)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!integ || !integ.is_enabled || !integ.encrypted_credentials || Object.keys(integ.encrypted_credentials as object).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "NOT_CONFIGURED",
          error: `Payment provider ${normalizedProvider} is not configured on server. Please configure credentials in Settings.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Production Safety Invariant: Real gateway transactions are intentionally deferred.
    // Fake simulated checkout URLs are strictly prohibited. The system fails closed.
    return new Response(
      JSON.stringify({
        success: false,
        status: "PROVIDER_UNAVAILABLE",
        code: "REAL_MERCHANT_DEFERRED",
        payableAmount,
        error: `Real payment gateway integration for ${normalizedProvider} is intentionally unconfigured/deferred. Direct simulated checkout is disabled for security.`,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal edge function error";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
