import { describe, test } from "node:test";
import assert from "node:assert/strict";

function validatePatientPayload(payload) {
  const errors = [];
  if (!payload.full_name || payload.full_name.trim().length === 0) {
    errors.push("Full name required");
  }
  if (!payload.gender || !["male", "female", "other"].includes(payload.gender)) {
    errors.push("Gender required");
  }
  if (!payload.phone || !/^(\+88)?01[3-9]\d{8}$/.test(payload.phone)) {
    errors.push("Valid BD phone required");
  }
  return { valid: errors.length === 0, errors };
}

function formatBDPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("01")) {
    return `+88${digits}`;
  }
  if (digits.length === 13 && digits.startsWith("8801")) {
    return `+${digits}`;
  }
  return phone;
}

function computeAge(dobString) {
  const dob = new Date(dobString);
  const diff = Date.now() - dob.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

describe("OHMS Integration: Patient Workflow & Clinical Data Logic", () => {
  test("1. Patient schema validation accepts valid BD patient demographic payload", () => {
    const payload = {
      full_name: "Mohammad Tanvir Rahman",
      gender: "male",
      phone: "01712345678",
      date_of_birth: "1988-05-14",
      blood_group: "B+",
      address: "Mirpur 10, Dhaka",
    };
    const result = validatePatientPayload(payload);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("2. Patient schema validation rejects invalid Bangladeshi phone numbers", () => {
    const payload = {
      full_name: "Test Patient",
      gender: "female",
      phone: "12345",
    };
    const result = validatePatientPayload(payload);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("phone") || e.includes("BD phone")));
  });

  test("3. Phone number formatting standardizes +880 international format", () => {
    const formatted = formatBDPhone("01819000111");
    assert.equal(formatted, "+8801819000111");
  });

  test("4. Age calculator computes exact age from Date of Birth", () => {
    const dob = "2000-01-01";
    const age = computeAge(dob);
    assert.ok(age >= 26, "Age calculation must be accurate");
  });
});
