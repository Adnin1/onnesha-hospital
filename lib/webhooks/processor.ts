/**
 * Enterprise Webhook Processor
 * 
 * Logs incoming webhook events to `webhook_events`, enforces event deduplication
 * via unique provider_event_id, and processes callbacks for payments and delivery statuses.
 */

import { createClient } from "@/lib/supabase/client";
import { PaymentService } from "../payments/payment-service";

export class WebhookProcessor {
  /**
   * Logs and processes an incoming webhook.
   */
  static async processWebhook(params: {
    organizationId?: string | null;
    provider: string;
    eventType: string;
    providerEventId?: string;
    headers: Record<string, string>;
    payload: Record<string, unknown>;
  }): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
    try {
      const supabase = createClient();
      // 1. Check deduplication on providerEventId
      if (params.providerEventId) {
        const { data: existing } = await supabase
          .from("webhook_events")
          .select("id, processing_status")
          .eq("provider", params.provider)
          .eq("provider_event_id", params.providerEventId)
          .maybeSingle();

        if (existing) {
          return { success: true, duplicate: true };
        }
      }

      // 2. Insert into webhook_events log
      const { data: logEntry, error: logError } = await supabase
        .from("webhook_events")
        .insert({
          organization_id: params.organizationId || null,
          provider: params.provider,
          event_type: params.eventType,
          provider_event_id: params.providerEventId || null,
          signature_header: params.headers ? JSON.stringify(params.headers).slice(0, 250) : null,
          payload: params.payload,
          processing_status: "RECEIVED",
        })
        .select("id")
        .single();

      if (logError && logError.code === "23505") {
        return { success: true, duplicate: true };
      }

      const logId = logEntry?.id;

      // 3. Dispatch according to provider event
      if (params.provider === "SSLCOMMERZ" && params.eventType === "PAYMENT_IPN") {
        const tranId = params.payload.tran_id as string;
        const valId = params.payload.val_id as string;

        if (tranId && valId) {
          const { data: intent } = await supabase
            .from("payment_intents")
            .select("id")
            .eq("intent_reference", tranId)
            .maybeSingle();

          if (intent) {
            await PaymentService.verifyAndSettlePayment({
              paymentIntentId: intent.id,
              rawPayload: params.payload,
            });
          }
        }
      } else if (params.provider === "SMS" || params.provider === "WHATSAPP") {
        // Delivery status callback
        const messageId = (params.payload.messageId || params.payload.id || params.payload.csms_id) as string;
        const deliveryStatus = (params.payload.status || params.payload.delivery_status) as string;

        if (messageId && deliveryStatus) {
          const isDelivered = deliveryStatus.toUpperCase().includes("DELIV");
          await supabase
            .from("notification_outbox")
            .update({
              status: isDelivered ? "DELIVERED" : "FAILED",
              delivered_at: isDelivered ? new Date().toISOString() : null,
              failed_at: !isDelivered ? new Date().toISOString() : null,
            })
            .eq("provider_message_id", messageId);
        }
      }

      // 4. Mark webhook event processed
      if (logId) {
        await supabase
          .from("webhook_events")
          .update({
            processing_status: "PROCESSED",
            processed_at: new Date().toISOString(),
          })
          .eq("id", logId);
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Webhook processing exception",
      };
    }
  }
}
