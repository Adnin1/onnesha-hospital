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

    const { organizationId, invoiceId, provider, amount } = await req.json();

    if (!organizationId || !invoiceId || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required parameters: organizationId, invoiceId, provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch live invoice
    const { data: invoice, error: invError } = await supabaseClient
      .from("invoices")
      .select("id, invoice_number, patient_id, grand_total, paid_amount, due_amount, status")
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

    const payableAmount = amount && amount > 0 && amount <= dueAmount ? amount : dueAmount;

    // 2. Verify provider integration exists and is active without returning secrets to caller
    const { data: integ } = await supabaseClient
      .from("organization_integrations")
      .select("environment, is_enabled")
      .eq("organization_id", organizationId)
      .eq("integration_type", "PAYMENT_GATEWAY")
      .eq("provider_name", provider)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!integ || !integ.is_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: `Payment provider ${provider} is not configured or disabled.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create server-managed payment intent
    const intentReference = `PI-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const idempotencyKey = `pi_${organizationId}_${invoice.id}_${Date.now()}`;
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

    return new Response(
      JSON.stringify({
        success: true,
        intentReference,
        paymentIntentId: intent.id,
        payableAmount,
        currency: "BDT",
        provider,
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
