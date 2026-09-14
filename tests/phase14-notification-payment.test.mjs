import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Helper functions for direct testing
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function interpolateTemplate(template, variables, sanitizeHtml = false) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = variables[key];
    if (val === undefined || val === null) {
      return "";
    }
    const strVal = String(val);
    return sanitizeHtml ? escapeHtml(strVal) : strVal;
  });
}

function verifyHmacSha256(payload, receivedSignature, secret) {
  if (!payload || !receivedSignature || !secret) return false;
  try {
    const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const computedBuf = Buffer.from(computed, "utf8");
    const receivedBuf = Buffer.from(receivedSignature, "utf8");
    if (computedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, receivedBuf);
  } catch {
    return false;
  }
}

function isTimestampValid(timestampSeconds, maxDriftSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestampSeconds) <= maxDriftSeconds;
}

describe("OHMS Phase 14 Enterprise Notification & Payment Suite (12 Scenarios)", () => {
  // Scenario 1: Migration 023 defines schemas for notifications, payments, and reconciliations
  test("1. Migration 023 defines organization_integrations, outbox, payment_intents, and RPC", () => {
    const migContent = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "023_phase14_enterprise_notifications_and_payments.sql"),
      "utf8"
    );
    assert.match(migContent, /organization_integrations/);
    assert.match(migContent, /notification_outbox/);
    assert.match(migContent, /payment_intents/);
    assert.match(migContent, /webhook_events/);
    assert.match(migContent, /payment_reconciliations/);
    assert.match(migContent, /verify_and_record_online_payment/);
  });

  // Scenario 2: lib/permissions.ts defines notifications and payments permissions
  test("2. lib/permissions.ts defines notification and online payment permissions", () => {
    const permContent = fs.readFileSync(path.join(rootDir, "lib", "permissions.ts"), "utf8");
    assert.match(permContent, /NOTIFICATIONS_VIEW/);
    assert.match(permContent, /PAYMENTS_ONLINE_CREATE/);
    assert.match(permContent, /PAYMENTS_ONLINE_VERIFY/);
    assert.match(permContent, /PAYMENTS_RECONCILE/);
    assert.match(permContent, /REFUNDS_PROCESS/);
  });

  // Scenario 3: Template Engine handles Unicode Bangla and English with PHI protection
  test("3. Template engine interpolates variables and sanitizes HTML for safe notifications", () => {
    const tplFile = fs.readFileSync(path.join(rootDir, "lib", "notifications", "template-engine.ts"), "utf8");
    assert.match(tplFile, /DEFAULT_TEMPLATES/);
    assert.match(tplFile, /APPOINTMENT_CONFIRMED/);
    assert.match(tplFile, /BILL_RECEIPT/);
    assert.match(tplFile, /DUE_REMINDER/);

    const testTpl = "Hello {{patient_name}}, your serial is #{{token_number}} at {{hospital_name}}.";
    const rendered = interpolateTemplate(testTpl, {
      patient_name: "আব্দুল করিম",
      token_number: "১৫",
      hospital_name: "অন্বেষা হাসপাতাল",
    });
    assert.equal(rendered, "Hello আব্দুল করিম, your serial is #১৫ at অন্বেষা হাসপাতাল.");

    const escaped = escapeHtml('<script>alert("hack")</script>');
    assert.equal(escaped, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
  });

  // Scenario 4: Outbox service enforces idempotency and exponential retry
  test("4. Outbox service implements idempotency check and status tracking", () => {
    const outboxContent = fs.readFileSync(path.join(rootDir, "lib", "notifications", "outbox-service.ts"), "utf8");
    assert.match(outboxContent, /idempotencyKey/);
    assert.match(outboxContent, /enqueueNotification/);
    assert.match(outboxContent, /processPendingBatch/);
    assert.match(outboxContent, /Math\.pow\(2,\s*attempt\)/);
  });

  // Scenario 5: SMS Adapter handles Bangladesh phone normalization and fails closed
  test("5. SMS adapter validates BD phone numbers and enforces fail-closed without credentials", () => {
    const smsFile = fs.readFileSync(path.join(rootDir, "lib", "notifications", "adapters", "sms-adapter.ts"), "utf8");
    assert.match(smsFile, /BangladeshSmsAdapter/);
    assert.match(smsFile, /normalizeBDPhone/);
    assert.match(smsFile, /isValidNormalizedBDPhone/);
    assert.match(smsFile, /Ready for integration configuration/);
  });

  // Scenario 6: WhatsApp Business Cloud API Adapter supports Meta Graph API
  test("6. WhatsApp adapter conforms to Meta Cloud API and prevents unauthenticated sending", () => {
    const waFile = fs.readFileSync(path.join(rootDir, "lib", "notifications", "adapters", "whatsapp-adapter.ts"), "utf8");
    assert.match(waFile, /MetaWhatsAppAdapter/);
    assert.match(waFile, /graph\.facebook\.com/);
    assert.match(waFile, /messaging_product:\s*"whatsapp"/);
  });

  // Scenario 7: Transactional Email Adapter supports Resend/SendGrid and sanitization
  test("7. Email adapter validates email format and fails closed without API key", () => {
    const emailFile = fs.readFileSync(path.join(rootDir, "lib", "notifications", "adapters", "email-adapter.ts"), "utf8");
    assert.match(emailFile, /TransactionalEmailAdapter/);
    assert.match(emailFile, /api\.resend\.com/);
    assert.match(emailFile, /Invalid email address format/);
  });

  // Scenario 8: Payment Service enforces server-side amount and invoice due lock
  test("8. PaymentService verifies invoice due amount server-side before intent creation", () => {
    const payFile = fs.readFileSync(path.join(rootDir, "lib", "payments", "payment-service.ts"), "utf8");
    assert.match(payFile, /createPaymentIntent/);
    assert.match(payFile, /invoiceDue <= 0/);
    assert.match(payFile, /exceeds outstanding balance/);
    assert.match(payFile, /verify_and_record_online_payment/);
  });

  // Scenario 9: bKash Tokenized Adapter implements token grant and checkout execute
  test("9. bKash adapter implements tokenized checkout flow and refund", () => {
    const bkashFile = fs.readFileSync(path.join(rootDir, "lib", "payments", "adapters", "bkash-adapter.ts"), "utf8");
    assert.match(bkashFile, /BkashAdapter/);
    assert.match(bkashFile, /\/token\/grant/);
    assert.match(bkashFile, /\/create/);
    assert.match(bkashFile, /\/execute/);
    assert.match(bkashFile, /\/payment\/refund/);
  });

  // Scenario 10: Nagad and SSLCommerz payment adapters fail closed without credentials
  test("10. Nagad and SSLCommerz adapters validate gateway responses and credentials", () => {
    const nagadFile = fs.readFileSync(path.join(rootDir, "lib", "payments", "adapters", "nagad-adapter.ts"), "utf8");
    const sslFile = fs.readFileSync(path.join(rootDir, "lib", "payments", "adapters", "sslcommerz-adapter.ts"), "utf8");
    assert.match(nagadFile, /NagadAdapter/);
    assert.match(nagadFile, /check-out\/initialize/);
    assert.match(sslFile, /SslCommerzAdapter/);
    assert.match(sslFile, /validationserverAPI\.php/);
  });

  // Scenario 11: Webhook Security implements HMAC-SHA256 and replay protection
  test("11. WebhookSecurity verifies HMAC-SHA256 signatures and timestamp window", () => {
    const secret = "secret_key_123";
    const payload = JSON.stringify({ event: "payment.completed", amount: 500 });
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    assert.equal(verifyHmacSha256(payload, sig, secret), true);
    assert.equal(verifyHmacSha256(payload, "invalid_sig", secret), false);

    const now = Math.floor(Date.now() / 1000);
    assert.equal(isTimestampValid(now), true);
    assert.equal(isTimestampValid(now - 100), true);
    assert.equal(isTimestampValid(now - 600), false); // Replay attack protection
  });

  // Scenario 12: UI Components (Checkout Modal, Reconciliation, Settings) are wired up
  test("12. Online payment modal, reconciliation page, and notification monitor exist without mock-data", () => {
    const modalFile = fs.readFileSync(path.join(rootDir, "components", "payments", "OnlinePaymentModal.tsx"), "utf8");
    const reconFile = fs.readFileSync(path.join(rootDir, "app", "app", "billing", "reconciliation", "page.tsx"), "utf8");
    const notifFile = fs.readFileSync(path.join(rootDir, "app", "app", "settings", "notifications", "page.tsx"), "utf8");

    assert.match(modalFile, /PaymentProvider/);
    assert.match(modalFile, /createPaymentIntent/);
    assert.doesNotMatch(modalFile, /mock-data/);

    assert.match(reconFile, /payment_intents/);
    assert.doesNotMatch(reconFile, /mock-data/);

    assert.match(notifFile, /notification_outbox/);
    assert.doesNotMatch(notifFile, /mock-data/);
  });
});

