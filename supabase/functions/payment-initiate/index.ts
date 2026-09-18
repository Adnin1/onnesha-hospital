import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const { organizationId, invoiceId, provider, amount } = body;

    if (!organizationId || !invoiceId || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required parameters: organizationId, invoiceId, provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Role-based Access Control: Caller must have an active membership in the organization
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role, organization_id, is_active")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (roleError || !userRole) {
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

    // 4. Verify provider integration exists, has credentials, and is active
    const { data: integ } = await supabaseClient
      .from("organization_integrations")
      .select("encrypted_credentials, environment, is_enabled")
      .eq("organization_id", organizationId)
      .eq("integration_type", "PAYMENT_GATEWAY")
      .eq("provider_name", provider)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!integ || !integ.is_enabled || !integ.encrypted_credentials || Object.keys(integ.encrypted_credentials as object).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "NOT_CONFIGURED",
          error: `Payment provider ${provider} is not configured on server. Please configure credentials in Settings.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Create server-managed payment intent
    const intentSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const intentReference = `PI-${Date.now()}-${intentSuffix}`;
    const idempotencyKey = `pi_${organizationId}_${invoice.id}_${provider}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: intent, error: intentError } = await supabaseClient
      .from("payment_intents")
      .insert({
        organization_id: organizationId,
        intent_reference: intentReference,
        invoice_id: invoice.id,
        patient_id: invoice.patient_id,
        payable_amount: payableAmount,
        currency: "BDT",
        provider,
        status: "PENDING",
        idempotency_key: idempotencyKey,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ success: false, error: intentError?.message || "Failed to persist payment intent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutUrl = `/app/billing/online-callback?intent=${intentReference}&status=AUTHORIZED`;

    return new Response(
      JSON.stringify({
        success: true,
        intentReference,
        paymentIntentId: intent.id,
        payableAmount,
        currency: "BDT",
        provider,
        checkoutUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal edge function error";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
