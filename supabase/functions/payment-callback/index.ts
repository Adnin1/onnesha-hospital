import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

// Secure CORS configuration: Restrict to production and local authorized origins
const ALLOWED_ORIGINS = [
  "https://onnesha-hospital.pages.dev",
  "http://localhost:3000",
  "tauri://localhost",
];

function getCorsHeaders(req: Request): { headers: Record<string, string>; isAllowed: boolean } {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser or server-to-server webhook request
    return {
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-correlation-id",
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
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-correlation-id",
    },
    isAllowed: true,
  };
}

/**
 * Constant-time comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Timing-safe string comparison for hex digests and bearer secrets.
 */
export function safeCompareStrings(strA: string, strB: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(strA.trim());
  const bufB = encoder.encode(strB.trim());
  return timingSafeEqual(bufA, bufB);
}

/**
 * RFC 1321 compliant MD5 hashing implementation in pure TypeScript/JavaScript.
 * Deterministic and portable across Deno, Node, and browser runtimes.
 */
export function md5Hex(str: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRol(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const utf8Bytes = typeof str === "string" ? new TextEncoder().encode(str) : str;
  const nBytes = utf8Bytes.length;
  const bin: number[] = [];
  for (let i = 0; i < nBytes; i++) {
    bin[i >> 2] = (bin[i >> 2] || 0) | (utf8Bytes[i] << ((i % 4) * 8));
  }
  bin[nBytes >> 2] = (bin[nBytes >> 2] || 0) | (0x80 << ((nBytes % 4) * 8));
  bin[(((nBytes + 8) >> 6) << 4) + 14] = nBytes * 8;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < bin.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;
    a = md5ff(a, b, c, d, bin[i] || 0, 7, -680876936);
    d = md5ff(d, a, b, c, bin[i + 1] || 0, 12, -389564586);
    c = md5ff(c, d, a, b, bin[i + 2] || 0, 17, 606105819);
    b = md5ff(b, c, d, a, bin[i + 3] || 0, 22, -1044525330);
    a = md5ff(a, b, c, d, bin[i + 4] || 0, 7, -176418897);
    d = md5ff(d, a, b, c, bin[i + 5] || 0, 12, 1200080426);
    c = md5ff(c, d, a, b, bin[i + 6] || 0, 17, -1473231341);
    b = md5ff(b, c, d, a, bin[i + 7] || 0, 22, -45705983);
    a = md5ff(a, b, c, d, bin[i + 8] || 0, 7, 1770035416);
    d = md5ff(d, a, b, c, bin[i + 9] || 0, 12, -1958414417);
    c = md5ff(c, d, a, b, bin[i + 10] || 0, 17, -42063);
    b = md5ff(b, c, d, a, bin[i + 11] || 0, 22, -1990404162);
    a = md5ff(a, b, c, d, bin[i + 12] || 0, 7, 1804603682);
    d = md5ff(d, a, b, c, bin[i + 13] || 0, 12, -40341101);
    c = md5ff(c, d, a, b, bin[i + 14] || 0, 17, -1502002290);
    b = md5ff(b, c, d, a, bin[i + 15] || 0, 22, 1236535329);

    a = md5gg(a, b, c, d, bin[i + 1] || 0, 5, -165796510);
    d = md5gg(d, a, b, c, bin[i + 6] || 0, 9, -1069501632);
    c = md5gg(c, d, a, b, bin[i + 11] || 0, 14, 643717713);
    b = md5gg(b, c, d, a, bin[i] || 0, 20, -373897302);
    a = md5gg(a, b, c, d, bin[i + 5] || 0, 5, -701558691);
    d = md5gg(d, a, b, c, bin[i + 10] || 0, 9, 38016083);
    c = md5gg(c, d, a, b, bin[i + 15] || 0, 14, -660478335);
    b = md5gg(b, c, d, a, bin[i + 4] || 0, 20, -405537848);
    a = md5gg(a, b, c, d, bin[i + 9] || 0, 5, 568446438);
    d = md5gg(d, a, b, c, bin[i + 14] || 0, 9, -1019803690);
    c = md5gg(c, d, a, b, bin[i + 3] || 0, 14, -187363961);
    b = md5gg(b, c, d, a, bin[i + 8] || 0, 20, 1163531501);
    a = md5gg(a, b, c, d, bin[i + 13] || 0, 5, -1444681467);
    d = md5gg(d, a, b, c, bin[i + 2] || 0, 9, -51403784);
    c = md5gg(c, d, a, b, bin[i + 7] || 0, 14, 1735328473);
    b = md5gg(b, c, d, a, bin[i + 12] || 0, 20, -1926607734);

    a = md5hh(a, b, c, d, bin[i + 5] || 0, 4, -378558);
    d = md5hh(d, a, b, c, bin[i + 8] || 0, 11, -2022574463);
    c = md5hh(c, d, a, b, bin[i + 11] || 0, 16, 1839030562);
    b = md5hh(b, c, d, a, bin[i + 14] || 0, 23, -35309556);
    a = md5hh(a, b, c, d, bin[i + 1] || 0, 4, -1530992060);
    d = md5hh(d, a, b, c, bin[i + 4] || 0, 11, 1272893353);
    c = md5hh(c, d, a, b, bin[i + 7] || 0, 16, -155497632);
    b = md5hh(b, c, d, a, bin[i + 10] || 0, 23, -1094730640);
    a = md5hh(a, b, c, d, bin[i + 13] || 0, 4, 681279174);
    d = md5hh(d, a, b, c, bin[i] || 0, 11, -358537222);
    c = md5hh(c, d, a, b, bin[i + 3] || 0, 16, -722521979);
    b = md5hh(b, c, d, a, bin[i + 6] || 0, 23, 76029189);
    a = md5hh(a, b, c, d, bin[i + 9] || 0, 4, -640364487);
    d = md5hh(d, a, b, c, bin[i + 12] || 0, 11, -421815835);
    c = md5hh(c, d, a, b, bin[i + 15] || 0, 16, 530742520);
    b = md5hh(b, c, d, a, bin[i + 2] || 0, 23, -995338651);

    a = md5ii(a, b, c, d, bin[i] || 0, 6, -198630844);
    d = md5ii(d, a, b, c, bin[i + 7] || 0, 10, 1126891415);
    c = md5ii(c, d, a, b, bin[i + 14] || 0, 15, -1416354905);
    b = md5ii(b, c, d, a, bin[i + 5] || 0, 21, -57434055);
    a = md5ii(a, b, c, d, bin[i + 12] || 0, 6, 1700485571);
    d = md5ii(d, a, b, c, bin[i + 3] || 0, 10, -1894986606);
    c = md5ii(c, d, a, b, bin[i + 10] || 0, 15, -1051523);
    b = md5ii(b, c, d, a, bin[i + 1] || 0, 21, -2054922799);
    a = md5ii(a, b, c, d, bin[i + 8] || 0, 6, 1873313359);
    d = md5ii(d, a, b, c, bin[i + 15] || 0, 10, -30611744);
    c = md5ii(c, d, a, b, bin[i + 6] || 0, 15, -1560198380);
    b = md5ii(b, c, d, a, bin[i + 13] || 0, 21, 1309151649);
    a = md5ii(a, b, c, d, bin[i + 4] || 0, 6, -145523070);
    d = md5ii(d, a, b, c, bin[i + 11] || 0, 10, -1120210379);
    c = md5ii(c, d, a, b, bin[i + 2] || 0, 15, 718787259);
    b = md5ii(b, c, d, a, bin[i + 9] || 0, 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const hex: string[] = [];
  for (const n of [a, b, c, d]) {
    for (let j = 0; j < 4; j++) {
      hex.push(((n >> (j * 8)) & 0xff).toString(16).padStart(2, "0"));
    }
  }
  return hex.join("");
}

// -------------------------------------------------------------------------------------
// Dedicated Official Provider Adapter Architecture
// Each provider encapsulates its own official verification protocol requirements:
// - bKash: Tokenized Checkout Query API / RSA signature verification
// - Nagad: Asymmetric RSA Key Exchange and Signature Verification
// - SSLCommerz: Form-urlencoded / JSON IPN Hash validation & Order Validation API
// When live merchant credentials are unconfigured, adapters fail closed safely.
// -------------------------------------------------------------------------------------
interface ProviderVerificationResult {
  verified: boolean;
  code?: string;
  error?: string;
  providerTransactionId?: string;
}

interface PaymentProviderAdapter {
  providerName: string;
  verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult>;
}

/**
 * bKash Webhook / IPN Adapter
 * Official Protocol: Requires bKash Tokenized Checkout queryPayment API (/tokenized/checkout/payment/query)
 * or RSA signature verification using official bKash public key certificate.
 * Live merchant onboarding is an external provider dependency (LIVE_MERCHANT_DEFERRED).
 * This adapter explicitly fails closed without simulating verification.
 */
class BkashAdapter implements PaymentProviderAdapter {
  readonly providerName = "BKASH";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const appKey = Deno.env.get("BKASH_APP_KEY");
    const appSecret = params.secret || Deno.env.get("BKASH_APP_SECRET");

    if (!appKey || !appSecret) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "bKash live merchant credentials (BKASH_APP_KEY, BKASH_APP_SECRET) not configured. Official Tokenized queryPayment deferred.",
      };
    }

    return {
      verified: false,
      code: "LIVE_MERCHANT_DEFERRED",
      error: "bKash live merchant onboarding and official Tokenized Checkout API query integration is pending activation (LIVE_MERCHANT_DEFERRED).",
    };
  }
}

/**
 * Nagad Webhook / Notification Adapter
 * Official Protocol: Requires Nagad Public Key and Merchant Private Key with asymmetric RSA decryption
 * and server-to-server verification endpoint (/check-payment-status).
 * Live merchant onboarding is an external provider dependency (LIVE_MERCHANT_DEFERRED).
 * This adapter explicitly fails closed without simulating verification.
 */
class NagadAdapter implements PaymentProviderAdapter {
  readonly providerName = "NAGAD";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const merchantId = Deno.env.get("NAGAD_MERCHANT_ID");
    const nagadPublicKey = params.secret || Deno.env.get("NAGAD_PUBLIC_KEY");

    if (!merchantId || !nagadPublicKey) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "Nagad live merchant credentials (NAGAD_MERCHANT_ID, NAGAD_PUBLIC_KEY) not configured. Cryptographic verification deferred.",
      };
    }

    return {
      verified: false,
      code: "LIVE_MERCHANT_DEFERRED",
      error: "Nagad live merchant onboarding and official Asymmetric Key verification is pending activation (LIVE_MERCHANT_DEFERRED).",
    };
  }
}

/**
 * SSLCommerz IPN Adapter
 * Official Protocol:
 * 1. IPN Payload Integrity: Validates MD5 hash using verify_sign, verify_key, and md5(store_passwd)
 * 2. Risk Evaluation: Detects risk_level = 1 and flags for manual review (HOLD_FOR_REVIEW)
 * 3. Server-to-Server Order Validation API (validationserverAPI.php): Authoritatively validates
 *    status, transaction reference, amount, and BDT currency.
 */
class SslCommerzAdapter implements PaymentProviderAdapter {
  readonly providerName = "SSLCOMMERZ";

  async verifyWebhook(params: {
    rawBody: string;
    signature?: string;
    secret?: string;
    body: Record<string, unknown>;
  }): Promise<ProviderVerificationResult> {
    const storePassword = params.secret || Deno.env.get("SSLCOMMERZ_STORE_PASSWD");
    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
    const valId = (params.body?.val_id as string) || (params.body?.providerTransactionId as string);

    if (!storeId || !storePassword) {
      return {
        verified: false,
        code: "LIVE_MERCHANT_DEFERRED",
        error: "SSLCommerz live credentials (STORE_ID, STORE_PASSWD) not configured. Order Validation API deferred.",
      };
    }

    if (!valId) {
      return {
        verified: false,
        code: "INVALID_CALLBACK",
        error: "SSLCommerz callback missing val_id for Order Validation API verification.",
      };
    }

    // Step 1: Verify IPN verify_sign hash if present in documented IPN payload
    const verifySign = params.body?.verify_sign as string | undefined;
    const verifyKey = params.body?.verify_key as string | undefined;

    if (verifySign && verifyKey) {
      const keys = verifyKey.split(",").map((k) => k.trim()).filter(Boolean);
      const postData: Record<string, string> = {};
      for (const k of keys) {
        if (params.body[k] !== undefined && params.body[k] !== null) {
          postData[k] = String(params.body[k]);
        }
      }
      postData["store_passwd"] = md5Hex(storePassword);
      const sortedKeys = Object.keys(postData).sort();
      const queryString = sortedKeys.map((k) => `${k}=${postData[k]}`).join("&");
      const calculatedSign = md5Hex(queryString);

      if (!safeCompareStrings(calculatedSign.toLowerCase(), verifySign.toLowerCase())) {
        return {
          verified: false,
          code: "INVALID_IPN_HASH",
          error: "SSLCommerz IPN verify_sign hash validation failed. Payload integrity rejected.",
        };
      }
    } else {
      return {
        verified: false,
        code: "MISSING_IPN_SIGNATURE",
        error: "SSLCommerz IPN requires verify_sign and verify_key for cryptographic payload integrity verification.",
      };
    }

    // Step 2: Risk indicator evaluation from callback body
    const incomingRiskLevel = params.body?.risk_level;
    if (incomingRiskLevel !== undefined && (String(incomingRiskLevel) === "1" || Number(incomingRiskLevel) === 1)) {
      return {
        verified: false,
        code: "RISK_REVIEW",
        error: "Payment flagged for risk evaluation by gateway. Settlement held for review.",
      };
    }

    // Step 3: Order Validation API Server-to-Server Verification
    try {
      const isSandbox = Deno.env.get("SSLCOMMERZ_IS_SANDBOX") === "true";
      const baseUrl = isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
      const validationUrl = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePassword)}&v=1&format=json`;

      // Bounded 10-second timeout prevents hung requests
      const res = await fetch(validationUrl, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (data.status === "VALID" || data.status === "VALIDATED") {
        // Risk evaluation from official validation API
        if (data.risk_level !== undefined && (String(data.risk_level) === "1" || Number(data.risk_level) === 1)) {
          return {
            verified: false,
            code: "RISK_REVIEW",
            error: "Payment flagged for risk evaluation by gateway validation. Settlement held for review.",
          };
        }

        // Strict reference matching: tran_id from gateway must match intentReference
        if (params.body?.intentReference && data.tran_id && String(data.tran_id).trim() !== String(params.body.intentReference).trim()) {
          return {
            verified: false,
            code: "REFERENCE_MISMATCH",
            error: "Payment reference mismatch between gateway validation and payment intent.",
          };
        }

        // Authoritative verification of amount against Order Validation response
        if (params.body?.paidAmount !== undefined && params.body?.paidAmount !== null) {
          const callbackAmount = Number(params.body.paidAmount);
          const validatedAmount = Number(data.amount);
          if (Number.isFinite(validatedAmount) && Math.abs(callbackAmount - validatedAmount) > 0.01) {
            return {
              verified: false,
              code: "AMOUNT_MISMATCH",
              error: "Payment amount mismatch between gateway validation and payment intent.",
            };
          }
        }

        // Strict currency validation: BOTH currency_type and currency (if present) must be BDT
        if (!data.currency_type || String(data.currency_type).toUpperCase() !== "BDT" || (data.currency && String(data.currency).toUpperCase() !== "BDT")) {
          return {
            verified: false,
            code: "CURRENCY_MISMATCH",
            error: "Payment currency mismatch: Only BDT transactions are accepted.",
          };
        }

        return {
          verified: true,
          providerTransactionId: data.bank_tran_id || data.tran_id || valId,
        };
      }
      return {
        verified: false,
        code: "PROVIDER_VALIDATION_FAILED",
        error: "Payment gateway validation failed or returned unconfirmed status.",
      };
    } catch {
      return {
        verified: false,
        code: "PROVIDER_UNAVAILABLE",
        error: "Payment gateway validation service is temporarily unavailable or timed out.",
      };
    }
  }
}

function sanitizeWebhookPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set([
    "card_number", "card_no", "pan", "cvv", "cvv2", "cvc", "password", "store_passwd",
    "pin", "otp", "token", "auth_token", "secret", "apikey", "api_key"
  ]);
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (sensitiveKeys.has(k.toLowerCase())) {
      sanitized[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      sanitized[k] = sanitizeWebhookPayload(v as Record<string, unknown>);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

const PROVIDER_ADAPTERS: Record<string, PaymentProviderAdapter> = {
  BKASH: new BkashAdapter(),
  NAGAD: new NagadAdapter(),
  SSLCOMMERZ: new SslCommerzAdapter(),
};

serve(async (req: Request) => {
  const { headers: cors, isAllowed } = getCorsHeaders(req);
  const rawCorrId = req.headers.get("x-correlation-id") || "";
  const correlationId = /^[0-9a-fA-F-]{8,64}$/.test(rawCorrId.trim())
    ? rawCorrId.trim()
    : crypto.randomUUID();

  if (!isAllowed) {
    return new Response(
      JSON.stringify({ success: false, code: "UNAUTHORIZED", error: "CORS origin rejected", correlationId }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Method not allowed. Only POST is accepted.", correlationId }),
      { status: 405, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Read raw body text for exact cryptographic signature / hash verification
    const rawBody = await req.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Empty request body", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request payload: support application/x-www-form-urlencoded (SSLCommerz IPN) and application/json
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      for (const [k, v] of params.entries()) {
        body[k] = v;
      }
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch {
        if (rawBody.includes("=") && rawBody.includes("&")) {
          const params = new URLSearchParams(rawBody);
          for (const [k, v] of params.entries()) {
            body[k] = v;
          }
        } else {
          return new Response(
            JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Malformed request payload", correlationId }),
            { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 3. Authenticity gate: external cryptographic signature header OR documented SSLCommerz IPN parameters
    const providerSig = req.headers.get("x-provider-signature") || req.headers.get("x-webhook-signature");
    const isSslCommerzIpn = Boolean((body.val_id && body.tran_id) || (body.verify_sign && body.verify_key));

    if (!providerSig && !isSslCommerzIpn) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "CLIENT_SETTLEMENT_PROHIBITED",
          error: "Direct client payment settlement is prohibited. Settlement must be driven by verified external provider webhook or IPN.",
          correlationId,
        }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 4. Extract and normalize parameters
    const rawProvider = (body.provider as string) || (isSslCommerzIpn ? "SSLCOMMERZ" : undefined);
    const intentReference = (body.intentReference as string) || (body.tran_id as string);
    const providerTransactionId = (body.providerTransactionId as string) || (body.bank_tran_id as string) || (body.val_id as string);
    const rawPaidAmount = body.paidAmount !== undefined ? body.paidAmount : body.amount;

    if (!rawProvider || !intentReference || !providerTransactionId || rawPaidAmount === undefined || rawPaidAmount === null) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "INVALID_CALLBACK",
          error: "Missing mandatory callback fields: provider, intentReference, providerTransactionId, paidAmount",
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Strict non-empty trimmed transaction ID validation
    const trimmedClientTrxId = typeof providerTransactionId === "string" ? providerTransactionId.trim() : "";
    if (trimmedClientTrxId.length === 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Missing or empty provider transaction ID", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Strict finite positive numeric amount parsing & validation
    const parsedAmount = typeof rawPaidAmount === "number" ? rawPaidAmount : Number(rawPaidAmount);
    if (!Number.isFinite(parsedAmount) || isNaN(parsedAmount) || parsedAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: "Invalid payment amount: must be a positive finite number", correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const normalizedCallbackProvider = String(rawProvider).toUpperCase();
    const adapter = PROVIDER_ADAPTERS[normalizedCallbackProvider];
    if (!adapter) {
      return new Response(
        JSON.stringify({ success: false, code: "PROVIDER_MISMATCH", error: `Unsupported callback provider: ${rawProvider}`, correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 5. Authoritatively load payment intent from database
    const { data: intent, error: intentError } = await supabaseClient
      .from("payment_intents")
      .select("id, organization_id, provider, status, payable_amount, provider_transaction_id")
      .eq("intent_reference", intentReference)
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ success: false, code: "PAYMENT_INTENT_NOT_FOUND", error: "Payment intent not found", correlationId }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 6. Durable Webhook Events Ledger (Audit & Deduplication)
    const providerEventId = (typeof body.provider_event_id === "string" && body.provider_event_id.trim())
      || (typeof body.val_id === "string" && body.val_id.trim())
      || trimmedClientTrxId;

    const { data: existingEvent } = await supabaseClient
      .from("webhook_events")
      .select("id, processing_status")
      .eq("organization_id", intent.organization_id)
      .eq("provider", normalizedCallbackProvider)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (existingEvent && existingEvent.processing_status === "PROCESSED") {
      return new Response(
        JSON.stringify({
          success: true,
          code: "DUPLICATE_TRANSACTION",
          message: "Webhook event has already been processed successfully",
          correlationId,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    let webhookEventId: string | null = null;
    const sanitizedPayload = sanitizeWebhookPayload(body);
    const { data: insertedEvent } = await supabaseClient
      .from("webhook_events")
      .insert({
        organization_id: intent.organization_id,
        provider: normalizedCallbackProvider,
        event_type: "PAYMENT_NOTIFICATION",
        provider_event_id: providerEventId,
        signature_header: (providerSig || (body.verify_sign as string) || "").slice(0, 250),
        is_signature_valid: false,
        payload: sanitizedPayload,
        processing_status: "RECEIVED",
        correlation_id: correlationId,
      })
      .select("id")
      .maybeSingle();

    if (insertedEvent?.id) {
      webhookEventId = insertedEvent.id;
    } else if (providerEventId) {
      const { data: existingEvent } = await supabaseClient
        .from("webhook_events")
        .select("id, processing_status")
        .eq("organization_id", intent.organization_id)
        .eq("provider", normalizedCallbackProvider)
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

      if (existingEvent?.id) {
        if (existingEvent.processing_status === "PROCESSED") {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Webhook event already processed (idempotent duplicate)",
              correlationId,
            }),
            { headers: { ...cors, "Content-Type": "application/json" } }
          );
        }
        webhookEventId = existingEvent.id;
      }
    }

    if (!webhookEventId) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "LEDGER_PERSISTENCE_FAILED",
          error: "Failed to persist webhook ledger event. Settlement aborted to prevent financial drift.",
          correlationId,
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 7. Strict Provider Matching Check
    const storedIntentProvider = String(intent.provider).toUpperCase();
    if (normalizedCallbackProvider !== storedIntentProvider) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "PROVIDER_MISMATCH",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "PROVIDER_MISMATCH",
          error: `Provider mismatch: callback specifies ${normalizedCallbackProvider} but intent was created for ${storedIntentProvider}. Settlement rejected.`,
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 8. Replay Protection
    if (intent.status === "PAID") {
      if (intent.provider_transaction_id && intent.provider_transaction_id === trimmedClientTrxId) {
        if (webhookEventId) {
          await supabaseClient.from("webhook_events").update({
            processing_status: "PROCESSED",
            processed_at: new Date().toISOString(),
          }).eq("id", webhookEventId);
        }
        return new Response(
          JSON.stringify({ success: true, message: "Payment intent is already settled with this transaction ID", correlationId }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "REPLAY_CONFLICT",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }

      return new Response(
        JSON.stringify({
          success: false,
          code: "REPLAY_CONFLICT",
          error: `Payment intent is already settled with transaction ID '${intent.provider_transaction_id}', but callback received '${trimmedClientTrxId}'. Conflict rejected.`,
          correlationId,
        }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (intent.status !== "PENDING" && intent.status !== "AUTHORIZED") {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "INVALID_INTENT_STATE",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_CALLBACK", error: `Invalid payment intent state for settlement: ${intent.status}`, correlationId }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 9. Mandatory Provider Verification
    let authoritativeTrxId = trimmedClientTrxId;
    const providerSecretEnvKey = `${normalizedCallbackProvider}_WEBHOOK_SECRET`;
    const providerWebhookSecret = Deno.env.get(providerSecretEnvKey);

    const verification = await adapter.verifyWebhook({
      rawBody,
      signature: providerSig || undefined,
      secret: providerWebhookSecret,
      body,
    });

    if (!verification.verified) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: verification.code || "UNAUTHORIZED",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: verification.code || "UNAUTHORIZED",
          status: verification.code === "LIVE_MERCHANT_DEFERRED" ? "REAL_MERCHANT_DEFERRED" : (verification.code === "RISK_REVIEW" ? "HOLD_FOR_REVIEW" : undefined),
          error: verification.error || "Provider webhook verification failed",
          correlationId,
        }),
        { status: verification.code === "RISK_REVIEW" ? 400 : 401, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (webhookEventId) {
      await supabaseClient.from("webhook_events").update({ is_signature_valid: true }).eq("id", webhookEventId);
    }

    if (verification.providerTransactionId && typeof verification.providerTransactionId === "string" && verification.providerTransactionId.trim().length > 0) {
      authoritativeTrxId = verification.providerTransactionId.trim();
    }

    // 10. Amount verification against intent to prevent tampering
    if (parsedAmount !== Number(intent.payable_amount)) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "AMOUNT_MISMATCH",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "AMOUNT_MISMATCH",
          error: `Paid amount (${parsedAmount}) does not match intent amount (${intent.payable_amount})`,
          correlationId,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 11. Execute atomic DB settlement RPC (runs as service_role)
    // The RPC atomically settles invoice, updates intent, inserts payment, inserts audit record,
    // and updates webhook_events to 'PROCESSED' in a single database transaction.
    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("verify_and_record_online_payment", {
      p_org_id: intent.organization_id,
      p_intent_id: intent.id,
      p_provider_trx_id: authoritativeTrxId,
      p_paid_amount: parsedAmount,
      p_gateway_method: intent.provider,
      p_cashier_id: null,
      p_webhook_event_id: webhookEventId,
    });

    if (rpcErr) {
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: "INTERNAL_ERROR",
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code: "INTERNAL_ERROR",
          error: "Payment settlement transaction failed",
          correlationId,
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (rpcRes && rpcRes.success === false) {
      const code = rpcRes.code === "DUPLICATE_TRANSACTION" ? "DUPLICATE_TRANSACTION" : (rpcRes.code || "INVALID_CALLBACK");
      const status = code === "DUPLICATE_TRANSACTION" ? 409 : 400;
      if (webhookEventId) {
        await supabaseClient.from("webhook_events").update({
          processing_status: "FAILED",
          failure_reason: code,
          processed_at: new Date().toISOString(),
        }).eq("id", webhookEventId);
      }
      return new Response(
        JSON.stringify({
          success: false,
          code,
          error: rpcRes.error || "Payment settlement could not be completed",
          correlationId,
        }),
        { status, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ...rpcRes, correlationId }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        code: "INTERNAL_ERROR",
        error: "An unexpected error occurred during webhook processing",
        correlationId,
      }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
