/**
 * Bangladesh Enterprise SMS Adapter
 * 
 * Supports compliant Bangladesh telecom SMS Gateways (SSL Wireless, Greenweb, Elitbuzz)
 * Integrates BD mobile number normalization (01xxxxxxxxx -> 8801xxxxxxxxx for SMS API).
 * Never mocks delivery in production: fails closed if unconfigured.
 */

import { ProviderSendResult, SmsProviderAdapter } from "../types";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "../../patient/phone";

export interface SmsGatewayConfig {
  provider: "ssl_wireless" | "greenweb" | "elitbuzz";
  apiToken: string;
  senderId: string;
  apiUrl?: string;
  accountSid?: string;
}

export class BangladeshSmsAdapter implements SmsProviderAdapter {
  providerName: string;
  private config: SmsGatewayConfig | null;

  constructor(config?: SmsGatewayConfig | null) {
    if (config && config.apiToken) {
      this.config = config;
    } else {
      const apiToken = process.env.SMS_GATEWAY_API_KEY || process.env.SMS_API_KEY || "";
      const apiUrl = process.env.SMS_GATEWAY_URL || process.env.SMS_API_ENDPOINT || "https://api.sms-gateway-bd.com/v2/send";
      const senderId = process.env.SMS_SENDER_ID || "ONNESHA";
      const provider = (process.env.SMS_PROVIDER as SmsGatewayConfig["provider"]) || "ssl_wireless";
      if (apiToken) {
        this.config = {
          provider,
          apiToken,
          senderId,
          apiUrl,
        };
      } else {
        this.config = config || null;
      }
    }
    this.providerName = this.config?.provider ? `sms_${this.config.provider}` : "sms_bd_gateway";
  }

  async send(options: {
    recipientPhone: string;
    message: string;
    senderId?: string;
  }): Promise<ProviderSendResult> {
    const norm = normalizeBDPhone(options.recipientPhone);
    if (!isValidNormalizedBDPhone(norm)) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: `Invalid Bangladesh mobile phone number: ${options.recipientPhone}`,
      };
    }

    // Fail closed if gateway is not configured with live credentials
    if (!this.config || !this.config.apiToken) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: "SMS Gateway not configured with credentials. Ready for integration configuration in organization_integrations or SMS_GATEWAY_API_KEY in environment.",
      };
    }

    const internationalNumber = `88${norm}`;
    const sender = options.senderId || this.config.senderId;

    try {
      if (this.config.provider === "greenweb") {
        const url = this.config.apiUrl || "https://api.greenweb.com.bd/api.php";
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: this.config.apiToken,
            to: internationalNumber,
            message: options.message,
          }),
        });

        const text = await response.text();
        if (response.ok && !text.toLowerCase().includes("error")) {
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: `gw_${Date.now()}`,
          };
        }
        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: `Greenweb SMS failure: ${text}`,
        };
      }

      if (this.config.provider === "ssl_wireless") {
        const url = this.config.apiUrl || "https://smsplus.sslwireless.com/api/v3/send-sms";
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiToken}`,
          },
          body: JSON.stringify({
            api_token: this.config.apiToken,
            sid: sender,
            msisdn: internationalNumber,
            sms: options.message,
            csms_id: `csms_${Date.now()}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").substring(0, 8) : Date.now().toString(36)}`,
          }),
        });

        const data = (await response.json()) as { status?: string; status_code?: number; error?: string; smsinfo?: Array<{ csms_id?: string }> };
        if (response.ok && (data.status === "SUCCESS" || data.status_code === 200)) {
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: data.smsinfo?.[0]?.csms_id || `ssl_${Date.now()}`,
          };
        }
        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: data.error || `SSL Wireless HTTP ${response.status}`,
        };
      }

      if (this.config.provider === "elitbuzz") {
        const url = this.config.apiUrl || "https://msg.elitbuzz-bd.com/smsapi";
        const queryParams = new URLSearchParams({
          api_key: this.config.apiToken,
          type: "text",
          contacts: internationalNumber,
          senderid: sender,
          msg: options.message,
        });
        const response = await fetch(`${url}?${queryParams.toString()}`, {
          method: "GET",
        });

        const text = await response.text();
        const trimmedText = text.trim();
        if (response.ok && trimmedText && !trimmedText.toLowerCase().includes("error") && !trimmedText.toLowerCase().includes("invalid")) {
          return {
            success: true,
            providerName: this.providerName,
            status: "SENT",
            providerMessageId: trimmedText.substring(0, 40),
          };
        }
        return {
          success: false,
          providerName: this.providerName,
          status: "FAILED",
          error: `Elitbuzz SMS failure: ${text}`,
        };
      }

      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: `Unsupported SMS provider: ${this.config.provider}`,
      };
    } catch (err) {
      return {
        success: false,
        providerName: this.providerName,
        status: "FAILED",
        error: err instanceof Error ? err.message : "SMS Network transport exception",
      };
    }
  }
}
