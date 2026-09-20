/**
 * Meta WhatsApp Business Cloud API Adapter
 * 
 * Complies with WhatsApp Cloud API Graph endpoints.
 * Requires pre-approved HSM templates. Fails closed if not configured.
 */

import { ProviderSendResult, WhatsAppProviderAdapter } from "../types";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "../../patient/phone";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  businessAccountId?: string;
}

export class MetaWhatsAppAdapter implements WhatsAppProviderAdapter {
  providerName = "whatsapp_cloud_api";
  private config: WhatsAppConfig | null;

  constructor(config?: WhatsAppConfig | null) {
    this.config = config || null;
  }

  async sendTemplate(options: {
    recipientPhone: string;
    templateName: string;
    languageCode: string;
    parameters: Array<{ type: "text"; text: string }>;
  }): Promise<ProviderSendResult> {
    const norm = normalizeBDPhone(options.recipientPhone);
    if (!isValidNormalizedBDPhone(norm)) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: `Invalid Bangladesh mobile phone number for WhatsApp: ${options.recipientPhone}`,
      };
    }

    if (!this.config || !this.config.accessToken || !this.config.phoneNumberId) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: "WhatsApp Cloud API not configured. Ready for credential configuration.",
      };
    }

    const recipientE164 = `88${norm}`;
    const apiVersion = this.config.apiVersion || "v19.0";
    const url = `https://graph.facebook.com/${apiVersion}/${this.config.phoneNumberId}/messages`;

    try {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientE164,
        type: "template",
        template: {
          name: options.templateName,
          language: { code: options.languageCode },
          components: [
            {
              type: "body",
              parameters: options.parameters,
            },
          ],
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string; code: number };
      };

      if (res.ok && data.messages && data.messages.length > 0) {
        return {
          success: true,
          providerName: this.providerName,
          status: "SENT",
          providerMessageId: data.messages[0].id,
        };
      }

      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: data.error?.message || `WhatsApp API error HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: err instanceof Error ? err.message : "WhatsApp transport error",
      };
    }
  }
}
