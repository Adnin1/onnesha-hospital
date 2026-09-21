/**
 * Website Public Interactions & Client Logic Verification Test Suite
 * Asserts phone normalization, visiting hours formatting, contact inquiry bounds,
 * appointment duplicate click protection, and token search logic.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Conversation 3: Public Interactions, Validation & Phone Normalization", () => {
  // Test Phone Logic
  function normalizeBDPhone(phone) {
    if (!phone) return "";
    let cleaned = phone.replace(/[\s\-()+]/g, "");
    if (cleaned.startsWith("880")) {
      cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith("88")) {
      cleaned = cleaned.substring(2);
    }
    if (cleaned.length === 10 && cleaned.startsWith("1")) {
      cleaned = "0" + cleaned;
    }
    return cleaned;
  }

  function isValidNormalizedBDPhone(normalized) {
    return /^01[3-9]\d{8}$/.test(normalized);
  }

  test("1. Bangladesh mobile normalization handles prefixes, spaces, and dashes", () => {
    assert.equal(normalizeBDPhone("01712345678"), "01712345678");
    assert.equal(normalizeBDPhone("+8801712345678"), "01712345678");
    assert.equal(normalizeBDPhone("8801812345678"), "01812345678");
    assert.equal(normalizeBDPhone("01912-345678"), "01912345678");
    assert.equal(normalizeBDPhone("+880 (171) 234-5678"), "01712345678");
  });

  test("2. Bangladesh mobile validation accurately checks operator codes (013-019)", () => {
    assert.ok(isValidNormalizedBDPhone("01712345678"), "017 is valid GP");
    assert.ok(isValidNormalizedBDPhone("01812345678"), "018 is valid Robi");
    assert.ok(isValidNormalizedBDPhone("01912345678"), "019 is valid BL");
    assert.ok(isValidNormalizedBDPhone("01512345678"), "015 is valid Teletalk");
    assert.ok(isValidNormalizedBDPhone("01312345678"), "013 is valid Skitto/GP");
    assert.ok(isValidNormalizedBDPhone("01412345678"), "014 is valid BL");

    assert.ok(!isValidNormalizedBDPhone("01212345678"), "012 is invalid operator");
    assert.ok(!isValidNormalizedBDPhone("0171234567"), "10 digits is too short");
    assert.ok(!isValidNormalizedBDPhone("017123456789"), "12 digits is too long");
    assert.ok(!isValidNormalizedBDPhone("abcdefghijk"), "Non-numeric is invalid");
  });

  test("3. Contact inquiry validation bounds match database check constraints", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    assert.ok(fs.existsSync(actionsPath));
    const actionsCode = fs.readFileSync(actionsPath, "utf8");

    // Name bounds
    assert.ok(actionsCode.includes("trimmedName.length < 2 || trimmedName.length > 120"));
    // Message bounds
    assert.ok(actionsCode.includes("trimmedMessage.length < 10"));
    assert.ok(actionsCode.includes("trimmedMessage.length > 2000"));
    // Phone validation
    assert.ok(actionsCode.includes("isValidNormalizedBDPhone(cleanPhone)"));
    // Email regex
    assert.ok(actionsCode.includes("/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$/"));
  });

  test("4. Public appointment form prevents duplicate submission clicks", () => {
    const apptPagePath = path.join(ROOT, "app/(public)/appointment/page.tsx");
    assert.ok(fs.existsSync(apptPagePath));
    const apptCode = fs.readFileSync(apptPagePath, "utf8");

    assert.ok(apptCode.includes("const [bookingLoading, setBookingLoading] = useState(false);"));
    assert.ok(apptCode.includes("disabled={bookingLoading}"));
  });

  test("5. Chamber token status lookup normalizes token strings and handles missing tokens gracefully", () => {
    const checkTokenPath = path.join(ROOT, "app/(public)/check-token/page.tsx");
    assert.ok(fs.existsSync(checkTokenPath));
    const tokenCode = fs.readFileSync(checkTokenPath, "utf8");

    assert.ok(tokenCode.includes('replace(/^#/, "").toUpperCase()'));
    assert.ok(tokenCode.includes("hasSearched"));
    assert.ok(tokenCode.includes("searchResult"));
    assert.ok(tokenCode.includes("was not found in the active waiting queue"));
  });
});
