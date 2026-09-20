/**
 * Enterprise Notification Outbox Service
 * 
 * Implements the transactional outbox pattern:
 * 1. Enqueue job into `notification_outbox` with unique idempotencyKey
 * 2. Checks recipient preferences & opt-outs
 * 3. Dispatches via provider adapter
 * 4. Updates outbox status with exponential retry backoff
 */

import { createClient } from "@/lib/supabase/client";
import {
  NotificationChannel,
  NotificationJob,
  NotificationType,
  ProviderSendResult,
} from "./types";
import { DEFAULT_TEMPLATES, interpolateTemplate, TemplateVariables } from "./template-engine";
import { BangladeshSmsAdapter } from "./adapters/sms-adapter";
import { MetaWhatsAppAdapter } from "./adapters/whatsapp-adapter";
import { TransactionalEmailAdapter } from "./adapters/email-adapter";

export class NotificationOutboxService {
  /**
   * Enqueues a notification into the outbox table.
   * If an existing pending/sent job with identical idempotencyKey exists, returns existing ID.
   */
  static async enqueueNotification(params: {
    organizationId: string;
    channel: NotificationChannel;
    notificationType: NotificationType;
    recipient: string;
    patientId?: string | null;
    sourceReferenceId?: string | null;
    idempotencyKey: string;
    variables: TemplateVariables;
    language?: "en" | "bn";
  }): Promise<{ success: boolean; jobId?: string; skipped?: boolean; error?: string }> {
    try {
      const lang = params.language || "bn";
      const template = DEFAULT_TEMPLATES[params.notificationType];
      
      let messageContent = "";
      let subject: string | null = null;

      if (params.channel === "SMS") {
        messageContent = interpolateTemplate(
          lang === "bn" ? template.sms_bn : template.sms_en,
          params.variables
        );
      } else if (params.channel === "WHATSAPP") {
        messageContent = interpolateTemplate(
          lang === "bn" ? template.sms_bn : template.sms_en,
          params.variables
        );
      } else if (params.channel === "EMAIL") {
        subject = interpolateTemplate(
          lang === "bn" ? template.email_subject_bn : template.email_subject_en,
          params.variables
        );
        messageContent = interpolateTemplate(
          lang === "bn" ? template.email_body_bn : template.email_body_en,
          params.variables,
          true
        );
      }

      const supabase = createClient();

      // Check recipient preferences if patientId provided
      if (params.patientId) {
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("sms_consent, whatsapp_consent, email_consent")
          .eq("patient_id", params.patientId)
          .maybeSingle();

        if (pref) {
          if (params.channel === "SMS" && !pref.sms_consent) {
            return { success: true, skipped: true, error: "Patient opted out of SMS" };
          }
          if (params.channel === "WHATSAPP" && !pref.whatsapp_consent) {
            return { success: true, skipped: true, error: "Patient opted out of WhatsApp" };
          }
          if (params.channel === "EMAIL" && !pref.email_consent) {
            return { success: true, skipped: true, error: "Patient opted out of Email" };
          }
        }
      }

      const { data, error } = await supabase
        .from("notification_outbox")
        .insert({
          organization_id: params.organizationId,
          channel: params.channel,
          notification_type: params.notificationType,
          recipient: params.recipient,
          patient_id: params.patientId || null,
          source_reference_id: params.sourceReferenceId || null,
          idempotency_key: params.idempotencyKey,
          subject,
          message_content: messageContent,
          status: "QUEUED",
        })
        .select("id")
        .single();

      if (error) {
        // Unique constraint violation on idempotency_key means it's already queued/sent
        if (error.code === "23505") {
          const { data: existing } = await supabase
            .from("notification_outbox")
            .select("id")
            .eq("organization_id", params.organizationId)
            .eq("idempotency_key", params.idempotencyKey)
            .maybeSingle();
          return { success: true, jobId: existing?.id, skipped: true };
        }
        return { success: false, error: error.message };
      }

      return { success: true, jobId: data.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Outbox enqueue failed",
      };
    }
  }

  /**
   * Dispatches a single outbox job via the corresponding provider adapter.
   */
  static async dispatchJob(
    job: NotificationJob,
    integrations?: Record<string, unknown>
  ): Promise<ProviderSendResult> {
    if (job.channel === "SMS") {
      const smsAdapter = new BangladeshSmsAdapter(
        (integrations?.sms as ConstructorParameters<typeof BangladeshSmsAdapter>[0]) || null
      );
      return await smsAdapter.send({
        recipientPhone: job.recipient,
        message: job.messageContent,
      });
    }

    if (job.channel === "WHATSAPP") {
      const waAdapter = new MetaWhatsAppAdapter(
        (integrations?.whatsapp as ConstructorParameters<typeof MetaWhatsAppAdapter>[0]) || null
      );
      return await waAdapter.sendTemplate({
        recipientPhone: job.recipient,
        templateName: job.notificationType.toLowerCase(),
        languageCode: "bn",
        parameters: [{ type: "text", text: job.messageContent }],
      });
    }

    if (job.channel === "EMAIL") {
      const emailAdapter = new TransactionalEmailAdapter(
        (integrations?.email as ConstructorParameters<typeof TransactionalEmailAdapter>[0]) || null
      );
      return await emailAdapter.send({
        recipientEmail: job.recipient,
        subject: job.subject || "Hospital Notification",
        htmlBody: job.messageContent,
      });
    }

    return {
      success: false,
      providerName: "unknown",
      status: "FAILED",
      error: `Unsupported channel: ${job.channel}`,
    };
  }

  /**
   * Processes a batch of queued outbox items with exponential backoff.
   */
  static async processPendingBatch(limit = 10): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const supabase = createClient();
    const { data: jobs, error } = await supabase
      .from("notification_outbox")
      .select("*")
      .in("status", ["QUEUED", "FAILED"])
      .lt("attempt_count", 3)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !jobs) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const rawJob of jobs) {
      const job: NotificationJob = {
        id: rawJob.id,
        organizationId: rawJob.organization_id,
        channel: rawJob.channel,
        notificationType: rawJob.notification_type,
        recipient: rawJob.recipient,
        patientId: rawJob.patient_id,
        sourceReferenceId: rawJob.source_reference_id,
        idempotencyKey: rawJob.idempotency_key,
        subject: rawJob.subject,
        messageContent: rawJob.message_content,
        status: rawJob.status,
        attemptCount: rawJob.attempt_count || 0,
      };

      const result = await this.dispatchJob(job);
      const attempt = (job.attemptCount || 0) + 1;

      if (result.success) {
        sent++;
        await supabase
          .from("notification_outbox")
          .update({
            status: "SENT",
            provider_name: result.providerName,
            provider_message_id: result.providerMessageId,
            attempt_count: attempt,
            sent_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } else {
        failed++;
        // Exponential backoff: next retry after 2^(attempt) * 60s
        const backoffMs = Math.pow(2, attempt) * 60 * 1000;
        const nextRetry = new Date(Date.now() + backoffMs).toISOString();

        await supabase
          .from("notification_outbox")
          .update({
            status: attempt >= 3 ? "FAILED" : "QUEUED",
            provider_name: result.providerName,
            attempt_count: attempt,
            failure_reason: result.error,
            failed_at: new Date().toISOString(),
            next_retry_at: attempt >= 3 ? null : nextRetry,
          })
          .eq("id", job.id);
      }
    }

    return { processed: jobs.length, sent, failed };
  }
}
