import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

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

    // 2. Role-based Access Control: Caller profile must be active, and caller must belong to the organization
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: User account is inactive" }),
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

    const payableAmount = amount && Number(amount) > 0 && Number(amount) <= dueAmount
      ? Number(amount)
      : dueAmount;

    // 4. Check idempotency key if provided
    const idempotencyKey = clientIdempotencyKey || `pi_${organizationId}_${invoice.id}_${normalizedProvider}_${Date.now()}`;
    const { data: existingIntent } = await supabaseClient
      .from("payment_intents")
      .select("id, intent_reference, status, payable_amount, checkout_url")
      .eq("organization_id", organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingIntent) {
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
