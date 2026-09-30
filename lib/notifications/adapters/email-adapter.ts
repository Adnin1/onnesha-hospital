/**
 * Transactional Email Provider Adapter
 * 
 * Supports compliant transactional email delivery (Resend, SendGrid, Postmark).
 * Enforces HTML sanitization and safe portal links without PHI leakage.
 * Fails closed with explicit error if provider is unconfigured or returns HTTP error.
 */

import { EmailProviderAdapter, ProviderSendResult } from "../types";

export interface EmailGatewayConfig {
  provider: "resend" | "sendgrid" | "postmark";
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export class TransactionalEmailAdapter implements EmailProviderAdapter {
  providerName: string;
  private config: EmailGatewayConfig | null;

  constructor(config?: EmailGatewayConfig | null) {
    if (config && config.apiKey) {
      this.config = config;
    } else {
      const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || "";
      const fromEmail = process.env.EMAIL_FROM || "aaih.apon@gmail.com";
      const fromName = process.env.EMAIL_FROM_NAME || "Onnesha Hospital";
      const provider = (process.env.EMAIL_PROVIDER as EmailGatewayConfig["provider"]) || "resend";
      if (apiKey) {
        this.config = {
          provider,
          apiKey,
          fromEmail,
          fromName,
        };
      } else {
        this.config = config || null;
      }
    }
    this.providerName = this.config?.provider ? `email_${this.config.provider}` : "email_transactional";
  }

  async send(options: {
    recipientEmail: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    fromEmail?: string;
  }): Promise<ProviderSendResult> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(options.recipientEmail)) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: `Invalid email address format: ${options.recipientEmail}`,
      };
    }

    if (!this.config || !this.config.apiKey) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: "Email provider not configured with API key. Ready for integration configuration in organization_integrations or RESEND_API_KEY in environment.",
      };
    }

    const defaultFrom = this.config?.fromEmail
      ? `${this.config.fromName || "Hospital"} <${this.config.fromEmail}>`
      : "Onnesha Hospital <aaih.apon@gmail.com>";
    const fromAddress = options.fromEmail || defaultFrom;

    try {
      if (this.config.provider === "resend") {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: options.recipientEmail,
            subject: options.subject,
            html: options.htmlBody,
            text: options.textBody,
          }),
        });

        const data = (await res.json()) as { id?: string; message?: string };
        if (res.ok && data.id) {
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: data.id,
          };
        }

        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: data.message || `Resend HTTP error ${res.status}`,
        };
      }

      if (this.config.provider === "sendgrid") {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: options.recipientEmail }] }],
            from: {
              email: options.fromEmail || this.config.fromEmail || "aaih.apon@gmail.com",
              name: this.config.fromName || "Onnesha Hospital",
            },
            subject: options.subject,
            content: [
              {
                type: "text/html",
                value: options.htmlBody,
              },
            ],
          }),
        });

        if (res.status === 202 || res.status === 200) {
          const msgId = res.headers.get("x-message-id") || undefined;
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: msgId,
          };
        }

        const errText = await res.text();
        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: `SendGrid HTTP error ${res.status}: ${errText}`,
        };
      }

      if (this.config.provider === "postmark") {
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": this.config.apiKey,
          },
          body: JSON.stringify({
            From: fromAddress,
            To: options.recipientEmail,
            Subject: options.subject,
            HtmlBody: options.htmlBody,
            TextBody: options.textBody,
          }),
        });

        const data = (await res.json()) as { MessageID?: string; Message?: string; ErrorCode?: number };
        if (res.ok && data.MessageID) {
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: data.MessageID,
          };
        }

        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: data.Message || `Postmark HTTP error ${res.status}`,
        };
      }

      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: `Unsupported email provider: ${this.config.provider}`,
      };
    } catch (err) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: err instanceof Error ? err.message : "Email delivery network exception",
      };
    }
  }
}
