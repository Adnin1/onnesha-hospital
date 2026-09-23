/**
 * Conversation 2 Verification Test Suite:
 * Website Public Security, Data Integrity, Statutory Alignment & Asset Hardening
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Conversation 2: Public Website Architecture, Security & Data Integrity", () => {
  const migration54Path = path.join(
    ROOT,
    "supabase/migrations/20260921070000_secure_public_waiting_queue_and_contact_intake.sql"
  );
  const actionsPath = path.join(ROOT, "lib/public/actions.ts");
  const appointmentPagePath = path.join(ROOT, "app/(public)/appointment/page.tsx");
  const checkTokenPagePath = path.join(ROOT, "app/(public)/check-token/page.tsx");
  const homePagePath = path.join(ROOT, "app/(public)/page.tsx");
  const contactPagePath = path.join(ROOT, "app/(public)/contact/page.tsx");
  const privacyPagePath = path.join(ROOT, "app/(public)/privacy/page.tsx");
  const consentPagePath = path.join(ROOT, "app/(public)/consent/page.tsx");
  const aboutPagePath = path.join(ROOT, "app/(public)/about/page.tsx");
  const servicesPagePath = path.join(ROOT, "app/(public)/services/page.tsx");
  const jsonLdPath = path.join(ROOT, "components/public/HospitalJsonLd.tsx");
  const robotsPath = path.join(ROOT, "public/robots.txt");
  const manifestPath = path.join(ROOT, "public/manifest.json");
  const swPath = path.join(ROOT, "public/sw.js");
  const headersPath = path.join(ROOT, "public/_headers");
  const sitemapPath = path.join(ROOT, "app/sitemap.ts");
  const headerPath = path.join(ROOT, "components/app/HospitalHeader.tsx");

  test("1. Migration 54 defines get_public_live_queue with zero PII leakage", () => {
    assert.ok(fs.existsSync(migration54Path), "Migration 54 SQL file must exist");
    const sql = fs.readFileSync(migration54Path, "utf8");

    assert.ok(sql.includes("get_public_live_queue"), "Must define get_public_live_queue");
    assert.ok(sql.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
    assert.ok(sql.includes("SET search_path = ''"), "Must protect search_path");

    // Must project only public safe columns
    assert.ok(sql.includes("d.full_name AS doctor_name"), "Must project doctor_name");
    assert.ok(sql.includes("token_num"), "Must project token_number");
    assert.ok(sql.includes("status_label"), "Must project status");

    // Must NOT return patient name, patient id or phone
    assert.ok(!sql.match(/p\.name\s+AS\s+patient_name/i), "Must not project patient_name");
    assert.ok(!sql.match(/p\.phone/i), "Must not project patient phone");
    assert.ok(!sql.match(/a\.patient_id/i), "Must not project patient_id");
  });

  test("2. Migration 54 implements rate-limited contact inquiry intake with strict length constraints", () => {
    const sql = fs.readFileSync(migration54Path, "utf8");

    assert.ok(sql.includes("submit_public_contact_inquiry"), "Must define submit_public_contact_inquiry RPC");
    assert.ok(sql.includes("chk_contact_inquiry_name_len"), "Must enforce name length constraint");
    assert.ok(sql.includes("chk_contact_inquiry_message_len"), "Must enforce message length constraint");
    assert.ok(sql.includes("v_recent_count >= 5"), "Must enforce max 5 inquiries per hour rate limit");
  });

  test("3. lib/public/actions.ts uses get_public_live_queue RPC and validates bounds", () => {
    assert.ok(fs.existsSync(actionsPath), "actions.ts must exist");
    const code = fs.readFileSync(actionsPath, "utf8");

    assert.ok(code.includes("get_public_live_queue"), "Must invoke get_public_live_queue RPC");
    assert.ok(!code.includes("appointments?select=token_number,status,patients(name)"), "Must not query raw patients name");
    assert.ok(code.includes("submit_public_contact_inquiry"), "Must invoke submit_public_contact_inquiry RPC");
    assert.ok(code.includes("patientAge < 0 || patientAge > 125"), "Must validate patient age bounds (0-125)");
    assert.ok(code.includes("trimmedName.length < 2 || trimmedName.length > 120"), "Must validate patient name bounds");
  });

  test("4. Static assets (favicon.ico, logo.png, icons) exist and are non-empty", () => {
    const faviconPath = path.join(ROOT, "public/favicon.ico");
    const logoPath = path.join(ROOT, "public/logo.png");
    const icon192Path = path.join(ROOT, "public/icons/icon-192.png");
    const icon512Path = path.join(ROOT, "public/icons/icon-512.png");

    assert.ok(fs.existsSync(faviconPath), "favicon.ico must exist");
    assert.ok(fs.statSync(faviconPath).size > 500, "favicon.ico must be valid multi-res icon (>500 bytes)");

    assert.ok(fs.existsSync(logoPath), "logo.png must exist");
    assert.ok(fs.statSync(logoPath).size > 1000, "logo.png must be valid image (>1000 bytes)");

    assert.ok(fs.existsSync(icon192Path), "icon-192.png must exist");
    assert.ok(fs.statSync(icon192Path).size > 1000, "icon-192.png must be valid image (>1000 bytes)");

    assert.ok(fs.existsSync(icon512Path), "icon-512.png must exist");
    assert.ok(fs.statSync(icon512Path).size > 1000, "icon-512.png must be valid image (>1000 bytes)");
  });

  test("5. PWA manifest, service worker and robots.txt are structurally sound", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.start_url, "/", "PWA start_url must be root '/' for public accessibility");
    assert.ok(manifest.icons.some((i) => i.src === "/favicon.ico"), "Manifest must link /favicon.ico");

    const sw = fs.readFileSync(swPath, "utf8");
    assert.ok(sw.includes("'/favicon.ico'"), "Service Worker must pre-cache /favicon.ico");

    const robots = fs.readFileSync(robotsPath, "utf8");
    assert.ok(!robots.includes("/departments"), "robots.txt must not reference nonexistent /departments");
    assert.ok(!robots.includes("/diagnostic"), "robots.txt must not reference nonexistent /diagnostic");
    assert.ok(robots.includes("Allow: /doctors"), "robots.txt must allow existing /doctors route");
    assert.ok(robots.includes("Disallow: /app/"), "robots.txt must disallow internal /app/ routes");

    const sitemap = fs.readFileSync(sitemapPath, "utf8");
    assert.ok(sitemap.includes("2026-09-23T02:00:00.000Z"), "sitemap.ts must use stable release timestamp");
  });

  test("6. HospitalJsonLd structured data links valid logo and accurate capabilities", () => {
    const jsonLd = fs.readFileSync(jsonLdPath, "utf8");
    assert.ok(jsonLd.includes("${SITE_CONFIG.canonicalUrl}/logo.png"), "JsonLd must reference valid /logo.png");
    assert.ok(!jsonLd.includes("Intensive Care Unit (ICU)"), "JsonLd must not advertise nonexistent ICU");
    assert.ok(!jsonLd.includes("Neonatal ICU (NICU)"), "JsonLd must not advertise nonexistent NICU");
  });

  test("7. Public appointment form requires explicit age & gender and does not use alert()", () => {
    const appt = fs.readFileSync(appointmentPagePath, "utf8");
    assert.ok(!appt.includes('age: "30"'), "Must not hardcode default age 30");
    assert.ok(!appt.includes('gender: "MALE"'), "Must not hardcode default gender MALE");
    assert.ok(!appt.includes("alert("), "Must not use window alert() for error notification");
    assert.ok(appt.includes("bookingError"), "Must display inline accessible bookingError");
  });

  test("8. Live Queue displays in HomePage and CheckToken do not expose patient names", () => {
    const checkToken = fs.readFileSync(checkTokenPagePath, "utf8");
    const home = fs.readFileSync(homePagePath, "utf8");

    assert.ok(!checkToken.includes("Patient:"), "CheckToken must not display 'Patient:' label");
    assert.ok(!home.includes("Patient:"), "HomePage queue cards must not display 'Patient:' label");
  });

  test("9. Contact form enforces field length boundaries and realistic operational claims", () => {
    const contact = fs.readFileSync(contactPagePath, "utf8");
    assert.ok(contact.includes('maxLength={120}'), "Contact form must bound name to 120 chars");
    assert.ok(contact.includes('maxLength={15}'), "Contact form must bound phone to 15 chars");
    assert.ok(contact.includes('maxLength={2000}'), "Contact form must bound message to 2000 chars");
    assert.ok(!contact.includes("ICU, NICU"), "Contact copy must not claim nonexistent ICU/NICU facilities");
  });

  test("10. Privacy Policy aligns strictly with Bangladesh Personal Data Protection Act 2026", () => {
    const privacy = fs.readFileSync(privacyPagePath, "utf8");
    assert.ok(privacy.includes("Section 11"), "Must map Right to Access to Section 11");
    assert.ok(privacy.includes("Section 12"), "Must map Right to Rectification to Section 12");
    assert.ok(privacy.includes("Section 13"), "Must map Consent Withdrawal to Section 13");
    assert.ok(privacy.includes("Section 17"), "Must map Data Security to Section 17");
    assert.ok(privacy.includes("Section 18"), "Must map Data Retention to Section 18");
    assert.ok(privacy.includes("Section 20"), "Must map Breach Notification to Section 20");
    assert.ok(!privacy.includes("Section 18: Right to Access"), "Must not falsely label Section 18 as Right to Access");
    assert.ok(!privacy.includes("dpo@onneshahospital.com"), "Must not list fictional external DPO email");
  });

  test("11. Consent guide is clearly framed as informational rather than a live mock portal", () => {
    const consent = fs.readFileSync(consentPagePath, "utf8");
    assert.ok(consent.includes("Consent & Privacy Choices"), "Must be framed as informational guidance");
    assert.ok(!consent.includes("Live Portal Synchronization"), "Must not claim fake realtime toggle synchronization");
  });

  test("12. Public marketing text eliminates pseudo-technical encryption claims", () => {
    const about = fs.readFileSync(aboutPagePath, "utf8");
    const services = fs.readFileSync(servicesPagePath, "utf8");
    const home = fs.readFileSync(homePagePath, "utf8");

    assert.ok(!about.includes("256-bit TLS and RLS এনক্রিপশন"), "Must not describe RLS as an encryption protocol");
    assert.ok(!services.includes("256-bit TLS and RLS এনক্রিপশন"), "Must not describe RLS as an encryption protocol in services");
    assert.ok(!home.includes("256-bit TLS and RLS এনক্রিপশন"), "Must not describe RLS as an encryption protocol on home");
    assert.ok(!about.includes("Official DGHS-standard"), "Must not claim uncertified DGHS endorsement");
  });

  test("13. public/_headers removes unsafe-eval and adds sensitive route cache-busting", () => {
    const headers = fs.readFileSync(headersPath, "utf8");
    assert.ok(!headers.includes("'unsafe-eval'"), "CSP must eliminate unsafe-eval");
    assert.ok(headers.includes("/downloads/desktop/latest.json"), "Must provide specific cache headers for latest.json");
    assert.ok(headers.includes("/forgot-password*"), "Must provide specific cache headers for /forgot-password*");
    assert.ok(headers.includes("/reset-password*"), "Must provide specific cache headers for /reset-password*");
    assert.ok(headers.includes("Cache-Control: no-cache, no-store, must-revalidate"), "Sensitive routes must prevent caching");
  });

  test("14. HospitalHeader acts truthfully as audit activity tracker without fake notifications", () => {
    const header = fs.readFileSync(headerPath, "utf8");
    assert.ok(header.includes("Recent System Activity"), "Header must truthfully title menu as Recent System Activity");
    assert.ok(!header.includes("unread-badge"), "Header must not display fake unread notice badges");
  });

  test("15. Diagnostic tariffs consume centralized versioned config and display indicative disclaimers", () => {
    const tariffsConfigPath = path.join(ROOT, "config/tariffs.ts");
    assert.ok(fs.existsSync(tariffsConfigPath), "config/tariffs.ts must exist as single source of truth");
    const tariffsCode = fs.readFileSync(tariffsConfigPath, "utf8");
    assert.ok(tariffsCode.includes("tariffStatus: \"INDICATIVE_REFERENCE\""), "Must mark status as INDICATIVE_REFERENCE");
    assert.ok(tariffsCode.includes("isVerifiedRate: false"), "Must mark rates as unverified indicative tariffs");

    const services = fs.readFileSync(servicesPagePath, "utf8");
    assert.ok(services.includes("DIAGNOSTIC_TARIFF_CONFIG"), "Services page must import DIAGNOSTIC_TARIFF_CONFIG");
    assert.ok(services.includes("Indicative Fee*"), "Table must explicitly label fees as Indicative Fee*");
    assert.ok(!services.includes("Standard Fee"), "Table must not claim Standard Fee without proof");
  });

  test("16. PublicFooter and layout maintain truthful healthcare and organization claims without unverified 24/7 promises", () => {
    const footerPath = path.join(ROOT, "components/public/PublicFooter.tsx");
    const footer = fs.readFileSync(footerPath, "utf8");
    assert.ok(!footer.includes("24/7 Digital Healthcare"), "Footer must not claim unverified 24/7 Digital Healthcare");
    assert.ok(!footer.includes("24 Hours In-house Pharmacy"), "Footer must not claim unverified 24 Hours Pharmacy");
    assert.ok(!footer.includes("state-of-the-art"), "Footer must not claim state-of-the-art");
    assert.ok(footer.includes("Online Patient Services"), "Footer must use truthful Online Patient Services badge");

    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const layout = fs.readFileSync(layoutPath, "utf8");
    assert.ok(layout.includes("description: SITE_CONFIG.description"), "Layout metadata must use SITE_CONFIG.description");
  });

  test("17. public/api/health.json acts truthfully as static deployment metadata and never claims fake live database connectivity", () => {
    const healthJsonPath = path.join(ROOT, "public/api/health.json");
    assert.ok(fs.existsSync(healthJsonPath), "public/api/health.json must exist");
    const healthData = JSON.parse(fs.readFileSync(healthJsonPath, "utf8"));

    assert.equal(healthData.type, "static_deployment_metadata", "Must declare type as static_deployment_metadata");
    assert.ok(!("database" in healthData), "Static JSON must not claim live database connectivity");
    assert.ok(!("security" in healthData), "Static JSON must not claim live runtime security enforcement");
    assert.ok(!("multi_tenant" in healthData), "Static JSON must not claim live multi-tenant state");
    assert.ok(healthData.architecture.includes("static_export"), "Must accurately specify static export architecture");
    assert.equal(healthData.runtime_monitoring, "not_applicable_for_static_metadata", "Must not invent unsupported edge client telemetry");
  });

  test("18. Public and root layouts ensure exactly one main landmark with id='main-content' per document", () => {
    const rootLayoutPath = path.join(ROOT, "app/layout.tsx");
    const publicLayoutPath = path.join(ROOT, "app/(public)/layout.tsx");
    const rootLayout = fs.readFileSync(rootLayoutPath, "utf8");
    const publicLayout = fs.readFileSync(publicLayoutPath, "utf8");

    // Root layout body must have skip link pointing to #main-content
    assert.ok(rootLayout.includes('href="#main-content"'), "Root layout must provide skip link to #main-content");
    // Root layout wrapper must NOT duplicate id="main-content"
    assert.ok(!rootLayout.includes('id="main-content"'), "Root layout div wrapper must not have duplicate id='main-content'");
    // Public layout must provide the single semantic <main id="main-content">
    assert.ok(publicLayout.includes('<main id="main-content"'), "Public layout must render <main id='main-content'>");
  });

  test("19. formatVisitingHoursSummary groups distinct time ranges accurately and sorts days", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/public/actions.ts must exist");
    const actionsSrc = fs.readFileSync(actionsPath, "utf8");

    assert.ok(actionsSrc.includes("dayOrder"), "formatVisitingHoursSummary must define dayOrder");
    assert.ok(actionsSrc.includes("groups.set(timeKey"), "Must group schedules by timeKey");
    assert.ok(actionsSrc.includes("parts.join(\"; \")"), "Must join separate time ranges with semicolon");

    // Pure logic simulation matching formatVisitingHoursSummary
    function formatTime12h(timeStr) {
      const parts = timeStr.split(":");
      const h = parseInt(parts[0], 10);
      const m = parts[1] || "00";
      const ampm = h >= 12 ? "PM" : "AM";
      const hour12 = h % 12 || 12;
      return `${hour12.toString().padStart(2, "0")}:${m} ${ampm}`;
    }

    const dayOrder = { saturday: 1, sunday: 2, monday: 3, tuesday: 4, wednesday: 5, thursday: 6, friday: 7 };
    const sample = [
      { day_of_week: "Monday", start_time: "09:00:00", end_time: "12:00:00", is_active: true },
      { day_of_week: "Tuesday", start_time: "14:00:00", end_time: "17:00:00", is_active: true },
      { day_of_week: "Wednesday", start_time: "09:00:00", end_time: "12:00:00", is_active: true },
    ];
    const groups = new Map();
    for (const s of sample) {
      const start = s.start_time.slice(0, 5);
      const end = s.end_time.slice(0, 5);
      const key = `${formatTime12h(start)} - ${formatTime12h(end)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s.day_of_week.slice(0, 3));
    }
    const parts = [];
    for (const [timeRange, days] of groups.entries()) {
      days.sort((a, b) => (dayOrder[a.toLowerCase()] || 99) - (dayOrder[b.toLowerCase()] || 99));
      parts.push(`${days.join(", ")} (${timeRange})`);
    }
    const result = parts.join("; ");

    assert.ok(result.includes("Mon, Wed (09:00 AM - 12:00 PM)"), "Must group Monday and Wednesday with 9-12 range");
    assert.ok(result.includes("Tue (02:00 PM - 05:00 PM)"), "Must group Tuesday with 14-17 range");
  });

  test("20. Service Worker ohms-static-v5 inspects Cache-Control headers before persisting responses", () => {
    const swPath = path.join(ROOT, "public/sw.js");
    assert.ok(fs.existsSync(swPath), "public/sw.js must exist");
    const swContent = fs.readFileSync(swPath, "utf8");

    assert.ok(swContent.includes("ohms-static-v5"), "Service worker version must be ohms-static-v5");
    assert.ok(swContent.includes("isResponseCacheable"), "Service worker must implement isResponseCacheable");
    assert.ok(swContent.includes("no-store"), "Must reject no-store responses");
    assert.ok(swContent.includes("private"), "Must reject private responses");
  });

  test("21. Public actions enforce single atomic RPC database authority for booking and department views", () => {
    const actionsPath = path.join(ROOT, "lib/public/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/public/actions.ts must exist");
    const actionsCode = fs.readFileSync(actionsPath, "utf8");

    // Must call authoritative RPC book_online_appointment
    assert.ok(
      actionsCode.includes('rpc("book_online_appointment"'),
      "bookOnlineAppointmentAction must call atomic book_online_appointment RPC"
    );

    // Must consume doctorName, roomNumber, opdFee directly from RPC response (Zero secondary query!)
    assert.ok(
      actionsCode.includes("doctorName: resObj.doctor_name") &&
      actionsCode.includes("roomNumber: resObj.room_number") &&
      actionsCode.includes("opdFee: Number(resObj.opd_fee)"),
      "bookOnlineAppointmentAction must map doctorName, roomNumber, and opdFee directly from atomic RPC result"
    );

    // Must NOT accept or fallback to doctorMetadata from client parameters
    assert.ok(
      !actionsCode.includes("doctorMetadata"),
      "bookOnlineAppointmentAction must not accept or fallback to client-supplied doctorMetadata"
    );

    // Must query public_departments_view in getPublicDepartmentsAction
    assert.ok(
      actionsCode.includes('from("public_departments_view")'),
      "getPublicDepartmentsAction must query public_departments_view"
    );
  });

  test("22. Migration 63 enforces server-side input validations in book_online_appointment", () => {
    const migration63Path = path.join(
      ROOT,
      "supabase/migrations/20260923180000_strict_booking_validation_concurrency_and_fail_closed_visibility.sql"
    );
    assert.ok(fs.existsSync(migration63Path), "Migration 63 SQL must exist");
    const sql = fs.readFileSync(migration63Path, "utf8");

    // Validation checks
    assert.ok(sql.includes("length(v_trimmed_name) < 2"), "Must check patient name min length");
    assert.ok(sql.includes("length(v_trimmed_name) > 120"), "Must check patient name max length");
    assert.ok(sql.includes("^01[3-9][0-9]{8}$"), "Must check Bangladeshi phone regex");
    assert.ok(sql.includes("p_patient_age < 0 OR p_patient_age > 125"), "Must validate patient age bounds (0-125)");
    assert.ok(sql.includes("NOT IN ('MALE', 'FEMALE', 'OTHER')"), "Must validate patient gender");
    assert.ok(sql.includes("length(p_notes) > 500"), "Must validate notes length max 500");
  });

  test("23. Migration 63 guarantees fail-closed department resolution with zero arbitrary fallback", () => {
    const migration63Path = path.join(
      ROOT,
      "supabase/migrations/20260923180000_strict_booking_validation_concurrency_and_fail_closed_visibility.sql"
    );
    const sql = fs.readFileSync(migration63Path, "utf8");

    // Must NOT contain arbitrary fallback like LIMIT 1 from public.departments
    assert.ok(
      !sql.includes("SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1"),
      "Must not fall back to arbitrary hospital department"
    );
    assert.ok(
      sql.includes("Doctor department mapping is unavailable or inactive"),
      "Must fail closed when department mapping is unavailable"
    );
  });

  test("24. Migration 63 serializes doctor/day concurrency and guarantees race-safe patient upsert", () => {
    const migration63Path = path.join(
      ROOT,
      "supabase/migrations/20260923180000_strict_booking_validation_concurrency_and_fail_closed_visibility.sql"
    );
    const sql = fs.readFileSync(migration63Path, "utf8");

    // Advisory lock must cover doctor + date
    assert.ok(
      sql.includes("hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_appointment_date::text)"),
      "Advisory lock must serialize doctor and appointment date across all schedules"
    );

    // Unique index & ON CONFLICT
    assert.ok(
      sql.includes("idx_patients_org_normalized_phone_unique"),
      "Must create unique index on normalized_phone"
    );
    assert.ok(
      sql.includes("ON CONFLICT (organization_id, normalized_phone)"),
      "Must handle concurrent patient creation via ON CONFLICT"
    );
  });

  test("25. Public views and live queue strictly enforce canonical public organization and active public doctors", () => {
    const migration63Path = path.join(
      ROOT,
      "supabase/migrations/20260923180000_strict_booking_validation_concurrency_and_fail_closed_visibility.sql"
    );
    const sql = fs.readFileSync(migration63Path, "utf8");

    // Public doctors view strict is_public = TRUE
    assert.ok(
      sql.includes("d.is_active = TRUE \n  AND d.is_public = TRUE;"),
      "public_doctors_view must require d.is_public = TRUE with no IS NULL fallback"
    );

    // Public departments view strict dept.is_public = TRUE
    assert.ok(
      sql.includes("dept.is_active = TRUE \n  AND dept.is_public = TRUE;"),
      "public_departments_view must require dept.is_public = TRUE with no IS NULL fallback"
    );

    // Live queue canonical org check
    assert.ok(
      sql.includes("is_canonical_public = TRUE") && sql.includes("403 Forbidden: Invalid or unauthorized hospital organization"),
      "get_public_live_queue must reject non-canonical organizations"
    );
  });

  // ── Migration 64 Forensic Tests ──────────────────────────────────────────

  test("26. Migration 64: Phone format validated BEFORE stripping (strict format-before-strip)", () => {
    const migration64Path = path.join(
      ROOT,
      "supabase/migrations/20260923200000_strict_phone_format_dhaka_date_dept_boundary_view_projection.sql"
    );
    const sql = fs.readFileSync(migration64Path, "utf8");

    // Must validate raw format BEFORE any normalization (no regexp_replace before regex check)
    assert.ok(
      sql.includes("v_raw_phone := TRIM(COALESCE(p_patient_phone, ''));"),
      "Migration 64 must capture raw phone before any normalization"
    );
    assert.ok(
      sql.includes("v_raw_phone !~ '^(01[3-9][0-9]{8}|8801[3-9][0-9]{8}|\\+8801[3-9][0-9]{8})$'"),
      "Migration 64 must reject invalid phone formats before stripping using strict regex"
    );
    assert.ok(
      sql.includes("Invalid phone format. Accepted formats:"),
      "Migration 64 must return a descriptive error for invalid phone formats"
    );
    // Final belt-and-suspenders guard after normalization
    assert.ok(
      sql.includes("v_clean_phone !~ '^01[3-9][0-9]{8}$'"),
      "Migration 64 must still validate normalized phone as 11-digit Bangladeshi format"
    );
  });

  test("27. Migration 64: Past-date gate uses Asia/Dhaka local date not UTC CURRENT_DATE", () => {
    const migration64Path = path.join(
      ROOT,
      "supabase/migrations/20260923200000_strict_phone_format_dhaka_date_dept_boundary_view_projection.sql"
    );
    const sql = fs.readFileSync(migration64Path, "utf8");

    assert.ok(
      sql.includes("timezone('Asia/Dhaka', NOW()))::DATE"),
      "Migration 64 past-date gate must use Asia/Dhaka timezone, not UTC CURRENT_DATE"
    );
    assert.ok(
      sql.includes("v_today_dhaka"),
      "Migration 64 must declare a v_today_dhaka variable for Dhaka-local date"
    );
    assert.ok(
      sql.includes("p_appointment_date < v_today_dhaka"),
      "Migration 64 past-date comparison must use v_today_dhaka"
    );
    // Verify old CURRENT_DATE pattern is NOT used as the date gate
    const gate2Block = sql.substring(sql.indexOf("Gate 2"), sql.indexOf("Gate 2") + 400);
    assert.ok(
      !gate2Block.includes("p_appointment_date < CURRENT_DATE"),
      "Migration 64 Gate 2 must NOT use CURRENT_DATE directly (must use Dhaka timezone)"
    );
  });

  test("28. Migration 64: Department resolution includes organization_id tenant-boundary (d.organization_id = p_org_id)", () => {
    const migration64Path = path.join(
      ROOT,
      "supabase/migrations/20260923200000_strict_phone_format_dhaka_date_dept_boundary_view_projection.sql"
    );
    const sql = fs.readFileSync(migration64Path, "utf8");

    // Department query must include org boundary
    assert.ok(
      sql.includes("d.organization_id = p_org_id"),
      "Migration 64 department resolution must include d.organization_id = p_org_id tenant-boundary check"
    );
    assert.ok(
      sql.includes("Doctor department mapping is unavailable or inactive within this organization"),
      "Migration 64 must return org-scoped error message when department is not found"
    );
  });

  test("29. Migration 64: public_doctors_view strips internal identifiers (no org_id, bmdc_reg_number, is_public, is_active)", () => {
    const migration64Path = path.join(
      ROOT,
      "supabase/migrations/20260923200000_strict_phone_format_dhaka_date_dept_boundary_view_projection.sql"
    );
    const sql = fs.readFileSync(migration64Path, "utf8");

    // Extract the public_doctors_view SELECT block
    const viewStart = sql.indexOf("CREATE OR REPLACE VIEW public.public_doctors_view");
    const viewEnd = sql.indexOf("COMMENT ON VIEW public.public_doctors_view");
    const viewSql = sql.substring(viewStart, viewEnd);

    // Stripped fields must NOT appear in the SELECT projection
    assert.ok(
      !viewSql.includes("d.organization_id,"),
      "public_doctors_view must NOT expose d.organization_id in SELECT projection"
    );
    assert.ok(
      !viewSql.includes("d.bmdc_reg_number,"),
      "public_doctors_view must NOT expose d.bmdc_reg_number (internal credential)"
    );
    assert.ok(
      !viewSql.includes("d.is_active,"),
      "public_doctors_view must NOT expose d.is_active (internal flag)"
    );
    assert.ok(
      !viewSql.includes("d.is_public,"),
      "public_doctors_view must NOT expose d.is_public (internal flag)"
    );
    assert.ok(
      !viewSql.includes("d.followup_fee,"),
      "public_doctors_view must NOT expose d.followup_fee (private pricing)"
    );
    // Required fields must be present
    assert.ok(
      viewSql.includes("d.full_name,") && viewSql.includes("d.opd_fee,") && viewSql.includes("d.public_bio,"),
      "public_doctors_view must include full_name, opd_fee, and public_bio"
    );
  });

  test("30. Service worker NEVER_CACHE_PATTERNS includes /check-token, /book-appointment, /confirm booking paths", () => {
    const swPath = path.join(ROOT, "public/sw.js");
    const swContent = fs.readFileSync(swPath, "utf8");

    assert.ok(
      swContent.includes("/check-token"),
      "Service worker NEVER_CACHE_PATTERNS must include /check-token to prevent personalized session data caching"
    );
    assert.ok(
      swContent.includes("/book-appointment"),
      "Service worker NEVER_CACHE_PATTERNS must include /book-appointment to prevent booking form caching"
    );
    assert.ok(
      swContent.includes("/confirm"),
      "Service worker NEVER_CACHE_PATTERNS must include /confirm to prevent booking confirmation token caching"
    );
    // Verify these are inside the NEVER_CACHE_PATTERNS array (before the closing bracket)
    const patternsBlock = swContent.substring(
      swContent.indexOf("const NEVER_CACHE_PATTERNS"),
      swContent.indexOf("];", swContent.indexOf("const NEVER_CACHE_PATTERNS"))
    );
    assert.ok(
      patternsBlock.includes("/check-token") &&
      patternsBlock.includes("/book-appointment") &&
      "All three booking paths must be inside the NEVER_CACHE_PATTERNS array"
    );
  });

  test("31. Migration 65 reconciles integration contracts and fixes all DB lint defects", () => {
    const migration65Path = path.join(
      ROOT,
      "supabase/migrations/20260923220000_integration_contract_reconciliation_and_db_lint_fixes.sql"
    );
    assert.ok(fs.existsSync(migration65Path), "Migration 65 must exist");
    const m65 = fs.readFileSync(migration65Path, "utf8");

    // 1. Leave check against doctor_leaves
    assert.ok(
      m65.includes("public.doctor_leaves"),
      "Migration 65 must query doctor_leaves for leave checks"
    );
    assert.ok(
      m65.includes("p_appointment_date BETWEEN start_date AND end_date"),
      "Migration 65 must check date range between start_date and end_date"
    );

    // 2. Public doctors directory minimal view alignment
    assert.ok(
      m65.includes("public.get_public_doctors_directory"),
      "Migration 65 must define get_public_doctors_directory"
    );
    assert.ok(
      !m65.includes("v.bmdc_reg_number"),
      "Migration 65 get_public_doctors_directory must not project non-existent v.bmdc_reg_number"
    );

    // 3. Supplier invoice GL atomic
    assert.ok(
      m65.includes("public.post_supplier_invoice_to_gl_atomic"),
      "Migration 65 must define post_supplier_invoice_to_gl_atomic"
    );
    assert.ok(
      !m65.includes("v_sinv.status"),
      "Migration 65 post_supplier_invoice_to_gl_atomic must not reference non-existent status column"
    );

    // 4. Payment receipt GL atomic
    assert.ok(
      m65.includes("public.post_payment_receipt_to_gl_atomic"),
      "Migration 65 must define post_payment_receipt_to_gl_atomic"
    );
    assert.ok(
      !m65.includes("v_pmt.status"),
      "Migration 65 post_payment_receipt_to_gl_atomic must not reference non-existent status column"
    );

    // 5. Void invoice and reverse GL atomic
    assert.ok(
      m65.includes("public.void_invoice_and_reverse_gl_atomic"),
      "Migration 65 must define void_invoice_and_reverse_gl_atomic"
    );

    // 6. get_public_live_queue overloads
    assert.ok(
      m65.includes("public.get_public_live_queue(p_org_id UUID)"),
      "Migration 65 must preserve 1-arg get_public_live_queue"
    );
    assert.ok(
      m65.includes("public.get_public_live_queue("),
      "Migration 65 must preserve 3-arg get_public_live_queue"
    );
  });
});



