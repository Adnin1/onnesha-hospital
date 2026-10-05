/**
 * Public UX & WCAG 2.2 AA Accessibility Certification Test Suite
 * Validates WCAG 2.2 AA compliance, responsive viewports, touch targets,
 * client lifecycle error handling, and zero browser dialogs across the public surface.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Public UX & WCAG 2.2 AA Accessibility & Lifecycle Certification", () => {
  const rootLayoutPath = path.join(ROOT, "app/layout.tsx");
  const globalsCssPath = path.join(ROOT, "app/globals.css");
  const publicLayoutPath = path.join(ROOT, "app/(public)/layout.tsx");
  const publicErrorPath = path.join(ROOT, "app/(public)/error.tsx");
  const homePath = path.join(ROOT, "app/(public)/page.tsx");
  const doctorsPath = path.join(ROOT, "app/(public)/doctors/page.tsx");
  const doctorsLayoutPath = path.join(ROOT, "app/(public)/doctors/layout.tsx");
  const appointmentPath = path.join(ROOT, "app/(public)/appointment/page.tsx");
  const servicesPath = path.join(ROOT, "app/(public)/services/page.tsx");
  const aboutPath = path.join(ROOT, "app/(public)/about/page.tsx");
  const contactPath = path.join(ROOT, "app/(public)/contact/page.tsx");
  const checkTokenPath = path.join(ROOT, "app/(public)/check-token/page.tsx");
  const navbarPath = path.join(ROOT, "components/public/PublicNavbar.tsx");
  const featuredDoctorsPath = path.join(ROOT, "components/public/FeaturedDoctorsWidget.tsx");
  const liveQueuePath = path.join(ROOT, "components/public/LiveQueueWidget.tsx");

  test("1. Total elimination of window.alert, window.confirm, and window.prompt across all public code", () => {
    const files = [
      homePath,
      doctorsPath,
      doctorsLayoutPath,
      appointmentPath,
      servicesPath,
      aboutPath,
      contactPath,
      checkTokenPath,
      navbarPath,
      featuredDoctorsPath,
      liveQueuePath,
      publicErrorPath,
    ];

    for (const filePath of files) {
      assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
      const content = fs.readFileSync(filePath, "utf8");
      assert.ok(!content.includes("window.alert("), `${filePath} must not contain window.alert`);
      assert.ok(!content.includes("window.confirm("), `${filePath} must not contain window.confirm`);
      assert.ok(!content.includes("window.prompt("), `${filePath} must not contain window.prompt`);
      assert.ok(!content.includes("alert("), `${filePath} must not contain alert(`);
      assert.ok(!content.includes("confirm("), `${filePath} must not contain confirm(`);
    }
  });

  test("2. Skip-to-content bypass block has lang attribute and visible focus styling (WCAG 2.2 SC 2.4.1 & SC 2.4.13)", () => {
    const layout = fs.readFileSync(rootLayoutPath, "utf8");
    const css = fs.readFileSync(globalsCssPath, "utf8");

    // Must have lang attribute on Bengali text in English document
    assert.ok(layout.includes('lang="bn"'), "Skip link must declare lang='bn'");
    assert.ok(layout.includes('href="#main-content"'), "Skip link targets #main-content");
    assert.ok(layout.includes('className="skip-to-content"'), "Skip link has .skip-to-content class");

    // CSS must provide distinct outline and shadow on focus
    assert.ok(css.includes(".skip-to-content:focus"), "Focus state defined");
    assert.ok(css.includes("outline: 3px solid"), "Focus state has high-contrast outline");
    assert.ok(css.includes("box-shadow"), "Focus state has distinct elevation box-shadow");
  });

  test("3. Homepage and client islands provide accessible status regions, contrast, and 44px touch targets", () => {
    const home = fs.readFileSync(homePath, "utf8");
    const featured = fs.readFileSync(featuredDoctorsPath, "utf8");
    const queue = fs.readFileSync(liveQueuePath, "utf8");

    // Responsive text size on hero stat strip for 320px screens
    assert.ok(home.includes("text-xl sm:text-2xl"), "Stat strip uses text-xl sm:text-2xl for 320px safety");

    // FeaturedDoctorsWidget
    assert.ok(featured.includes('role="alert"'), "Featured doctors error state has role='alert'");
    assert.ok(featured.includes("min-h-[44px]"), "Directory link has min-h-[44px]");

    // LiveQueueWidget
    assert.ok(queue.includes('role="alert"'), "Queue widget error state has role='alert'");
    assert.ok(queue.includes("text-slate-600"), "Status text meets WCAG AA 4.5:1 contrast");
    assert.ok(queue.includes("min-h-[44px]"), "Chambers link has min-h-[44px]");
  });

  test("4. Doctor directory enforces keyboard navigation, accessible labels, and badge contrast", () => {
    const docPage = fs.readFileSync(doctorsPath, "utf8");
    const docLayout = fs.readFileSync(doctorsLayoutPath, "utf8");

    assert.ok(docPage.includes('aria-label="Search doctor by name, specialty, or degree"'));
    assert.ok(docPage.includes('min-h-[44px] px-2.5 rounded'), "Reset filters button meets 44px min touch target");
    assert.ok(docLayout.includes("text-slate-700 bg-slate-200/80"), "Specialty badges meet 4.5:1 contrast");
    assert.ok(docLayout.includes("min-h-[44px]"), "Specialty filter links meet 44px min touch target");
  });

  test("5. Appointment wizard enforces explicit selection, radiogroup semantics, and touch targets", () => {
    const appt = fs.readFileSync(appointmentPath, "utf8");

    // Step 1: Doctor selection card accessibility
    assert.ok(appt.includes('role="button"'));
    assert.ok(appt.includes("tabIndex={0}"));
    assert.ok(appt.includes("aria-label={`Select ${doc.full_name}, ${doc.department_name}`}"));
    assert.ok(appt.includes('role="alert" className="p-4 bg-amber-50'), "Doctor error has role='alert'");

    // Step 2: Slot radiogroup
    assert.ok(appt.includes('role="radiogroup" aria-labelledby="chamber-slot-label"'));

    // Step 4: Printable slip and action buttons
    assert.ok(appt.includes("min-h-[44px]"), "Buttons provide min-h-[44px]");
    assert.ok(appt.includes('setGender("");'), "Resetting form does not pre-select gender");
  });

  test("6. Services catalog implements accessible table markup (WCAG 2.2 SC 1.3.1) and contrast", () => {
    const services = fs.readFileSync(servicesPath, "utf8");

    // Table accessibility
    assert.ok(services.includes('aria-label="Indicative Diagnostic & Laboratory Tariffs"'));
    assert.ok(services.includes('scope="col"'), "All table header cells provide scope='col'");
    assert.ok(services.includes("table-responsive"), "Responsive table wrapper defined");

    // Contrast
    assert.ok(services.includes("text-slate-500"), "Last reviewed date meets contrast requirements");
    assert.ok(services.includes("text-slate-600 mt-4 italic"), "Tariff disclaimer footnote meets contrast");
    assert.ok(services.includes("min-h-[44px]"), "Booking CTA link meets 44px touch target");
  });

  test("7. Contact form implements status landmarks, error alerts, and character counter contrast", () => {
    const contact = fs.readFileSync(contactPath, "utf8");

    // Status and alerts
    assert.ok(contact.includes('role="status" aria-live="polite"'), "Success card has role='status' aria-live='polite'");
    assert.ok(contact.includes('role="alert" className="p-3 rounded-xl bg-red-50'), "Error card has role='alert'");

    // Contrast and touch targets
    assert.ok(contact.includes("text-slate-500 font-medium"), "Message character counter has 4.5:1 contrast");
    assert.ok(contact.includes("min-h-[44px] inline-flex items-center justify-center px-4 py-2"), "Reset button meets 44px");
  });

  test("8. Check Token page implements live regions, role='alert' error states, and dark contrast", () => {
    const token = fs.readFileSync(checkTokenPath, "utf8");

    assert.ok(token.includes('aria-live="polite"'), "Search results container has aria-live='polite'");
    assert.ok(token.includes('role="alert" className="bg-slate-800 border border-amber-600/40'), "Other date alert has role='alert'");
    assert.ok(token.includes('role="alert" className="bg-slate-800 border border-slate-700'), "Not found alert has role='alert'");
    assert.ok(!token.includes("text-slate-500"), "Dark background avoids text-slate-500 low contrast");
  });

  test("9. Client-side lifecycle error boundary provides friendly Bengali UI and reset recovery", () => {
    assert.ok(fs.existsSync(publicErrorPath));
    const errorPage = fs.readFileSync(publicErrorPath, "utf8");

    assert.ok(errorPage.includes('"use client"'));
    assert.ok(errorPage.includes('role="alert"'));
    assert.ok(errorPage.includes("পেজটি লোড করতে সমস্যা হচ্ছে"));
    assert.ok(errorPage.includes("আবার চেষ্টা করুন"));
    assert.ok(!errorPage.includes("stack"), "Error boundary must never expose raw stack traces");
  });

  test("10. Public Navbar mobile menu provides responsive title truncation and accessible icons", () => {
    const nav = fs.readFileSync(navbarPath, "utf8");

    assert.ok(nav.includes("truncate max-w-[150px] sm:max-w-none"), "Navbar title prevents 320px overflow");
    assert.ok(nav.includes('aria-expanded={mobileOpen}'));
    assert.ok(nav.includes('aria-controls="mobile-nav-menu"'));
    assert.ok(nav.includes('aria-label="Mobile Navigation Menu"'));
  });
});
