/**
 * Conversation 3 Verification Test Suite:
 * Website Accessibility (WCAG 2.2), Touch Targets, Form Label Binding & Responsive UX
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Conversation 3: Accessibility (WCAG 2.2), Touch Targets & Responsive UX", () => {
  const navbarPath = path.join(ROOT, "components/public/PublicNavbar.tsx");
  const footerPath = path.join(ROOT, "components/public/PublicFooter.tsx");
  const doctorsPath = path.join(ROOT, "app/(public)/doctors/page.tsx");
  const appointmentPath = path.join(ROOT, "app/(public)/appointment/page.tsx");
  const checkTokenPath = path.join(ROOT, "app/(public)/check-token/page.tsx");
  const contactPath = path.join(ROOT, "app/(public)/contact/page.tsx");
  const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
  const homePath = path.join(ROOT, "app/(public)/page.tsx");
  const globalsCssPath = path.join(ROOT, "app/globals.css");

  test("1. PublicNavbar implements accessible mobile drawer toggle and touch-friendly targets", () => {
    assert.ok(fs.existsSync(navbarPath), "PublicNavbar.tsx must exist");
    const code = fs.readFileSync(navbarPath, "utf8");

    assert.ok(code.includes('aria-expanded={mobileOpen}'), "Must provide aria-expanded on menu button");
    assert.ok(code.includes('aria-controls="mobile-nav-menu"'), "Must provide aria-controls attribute");
    assert.ok(code.includes('min-h-[44px]'), "Menu button must meet 44px minimum touch target");
    assert.ok(code.includes('id="mobile-nav-menu"'), "Drawer must have matching id");
    assert.ok(code.includes('role="region"'), "Drawer must define region landmark");
  });

  test("2. PublicFooter includes comprehensive legal links and accurate clinical scope", () => {
    assert.ok(fs.existsSync(footerPath), "PublicFooter.tsx must exist");
    const code = fs.readFileSync(footerPath, "utf8");

    assert.ok(code.includes('href="/privacy"'), "Footer must link to /privacy");
    assert.ok(code.includes('href="/terms"'), "Footer must link to /terms");
    assert.ok(code.includes('href="/consent"'), "Footer must link to /consent");
    assert.ok(code.includes('href="/downloads/desktop"'), "Footer must link to desktop downloads");
    assert.ok(!code.includes("Intensive Care Unit (ICU & CCU)"), "Must not claim nonexistent ICU");
    assert.ok(!code.includes("Neonatal Care (NICU)"), "Must not claim nonexistent NICU");
  });

  test("3. Doctors Directory enforces search label accessibility and touch targets", () => {
    assert.ok(fs.existsSync(doctorsPath), "doctors page must exist");
    const code = fs.readFileSync(doctorsPath, "utf8");

    assert.ok(code.includes('aria-label="Search doctor by name, specialty, or degree"'), "Search input must have aria-label");
    assert.ok(code.includes('min-h-[44px]'), "Filter pills and action buttons must specify min-h-[44px]");
    assert.ok(code.includes("focus:ring-sky-500"), "Must provide visible sky-500 focus ring");
  });

  test("4. Appointment Booking wizard provides keyboard selection, labels, and touch targets", () => {
    assert.ok(fs.existsSync(appointmentPath), "appointment page must exist");
    const code = fs.readFileSync(appointmentPath, "utf8");

    // Step 1: Doctor selection card accessibility
    assert.ok(code.includes('role="button"'), "Doctor cards must have role=button");
    assert.ok(code.includes("tabIndex={0}"), "Doctor cards must be focusable via tabIndex={0}");
    assert.ok(code.includes("aria-pressed="), "Doctor cards must provide aria-pressed state");
    assert.ok(code.includes("onKeyDown="), "Doctor cards must handle keyboard events (Enter/Space)");

    // Step 2 & 3: Form labels and IDs
    assert.ok(code.includes('htmlFor="appointment-date"'), "Date input must be linked to label");
    assert.ok(code.includes('id="appointment-date"'), "Date input must have matching id");
    assert.ok(code.includes('htmlFor="patient-fullname"'), "Fullname input must be linked to label");
    assert.ok(code.includes('id="patient-fullname"'), "Fullname input must have matching id");
    assert.ok(code.includes('htmlFor="patient-phone"'), "Phone input must be linked to label");
    assert.ok(code.includes('id="patient-phone"'), "Phone input must have matching id");
    assert.ok(code.includes('htmlFor="patient-age"'), "Age input must be linked to label");
    assert.ok(code.includes('id="patient-age"'), "Age input must have matching id");
    assert.ok(code.includes('htmlFor="patient-gender"'), "Gender select must be linked to label");
    assert.ok(code.includes('id="patient-gender"'), "Gender select must have matching id");

    // Touch targets
    assert.ok(code.includes('min-h-[44px]'), "All inputs and submit buttons must have min-h-[44px]");
  });

  test("5. Check Token page implements labeled search input and touch-friendly submission", () => {
    assert.ok(fs.existsSync(checkTokenPath), "check-token page must exist");
    const code = fs.readFileSync(checkTokenPath, "utf8");

    assert.ok(code.includes('aria-label="Enter your token number"'), "Token input must have aria-label");
    assert.ok(code.includes('min-h-[44px]'), "Token input and check button must have min-h-[44px]");
  });

  test("6. Contact Form provides explicit label-input binding and touch targets", () => {
    assert.ok(fs.existsSync(contactPath), "contact page must exist");
    const code = fs.readFileSync(contactPath, "utf8");

    assert.ok(code.includes('htmlFor="contact-name"'), "Name input must have htmlFor");
    assert.ok(code.includes('id="contact-name"'), "Name input must have matching id");
    assert.ok(code.includes('htmlFor="contact-phone"'), "Phone input must have htmlFor");
    assert.ok(code.includes('id="contact-phone"'), "Phone input must have matching id");
    assert.ok(code.includes('htmlFor="contact-email"'), "Email input must have htmlFor");
    assert.ok(code.includes('id="contact-email"'), "Email input must have matching id");
    assert.ok(code.includes('htmlFor="contact-subject"'), "Subject input must have htmlFor");
    assert.ok(code.includes('id="contact-subject"'), "Subject input must have matching id");
    assert.ok(code.includes('htmlFor="contact-message"'), "Message textarea must have htmlFor");
    assert.ok(code.includes('id="contact-message"'), "Message textarea must have matching id");
    assert.ok(code.includes('min-h-[44px]'), "Contact inputs and submit button must have min-h-[44px]");
  });

  test("7. LoginPage provides accessible inputs and focus indicators", () => {
    assert.ok(fs.existsSync(loginPath), "login page must exist");
    const code = fs.readFileSync(loginPath, "utf8");

    assert.ok(code.includes('htmlFor="official-email"'), "Email label must have htmlFor");
    assert.ok(code.includes('id="official-email"'), "Email input must have id");
    assert.ok(code.includes('htmlFor="access-password"'), "Password label must have htmlFor");
    assert.ok(code.includes('id="access-password"'), "Password input must have id");
    assert.ok(code.includes('focus:ring-2 focus:ring-sky-500'), "Inputs must have visible focus indicators");
  });

  test("8. HomePage doctor card booking action complies with touch target sizes", () => {
    assert.ok(fs.existsSync(homePath), "homepage must exist");
    const code = fs.readFileSync(homePath, "utf8");

    assert.ok(code.includes("min-h-[44px] flex items-center justify-center"), "Doctor card booking link must have min-h-[44px]");
  });

  test("9. Global stylesheet declares WCAG 2.2 accessibility foundations", () => {
    assert.ok(fs.existsSync(globalsCssPath), "globals.css must exist");
    const css = fs.readFileSync(globalsCssPath, "utf8");

    assert.ok(css.includes(".skip-to-content"), "Must declare skip-to-content class");
    assert.ok(css.includes("*:focus-visible"), "Must declare focus-visible rule");
    assert.ok(css.includes("@media (pointer: coarse)"), "Must declare coarse pointer minimum touch targets");
    assert.ok(css.includes("min-height: 44px;"), "Must declare 44px touch target height");
    assert.ok(css.includes("prefers-reduced-motion"), "Must declare reduced motion media query");
  });
});
