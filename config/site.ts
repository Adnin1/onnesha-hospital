/**
 * Onnesha Hospital Management & Enterprise Resource Planning System (OHMS ERP)
 * Unified Site & Canonical Domain Configuration
 * Single source of truth for SEO, metadata, canonical URLs, sitemaps, and robots.
 *
 * NOTE: config/hospital.ts is the SINGLE AUTHORITATIVE SOURCE OF TRUTH for
 * hospital legal identity, physical address, hotlines, and organizational metadata.
 * Physical address and English brand transliteration differences are tagged:
 * CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED.
 */
import { HOSPITAL_METADATA } from "./hospital";

export const SITE_CONFIG = {
  name: "Onnesha Hospital & Diagnostic Complex",
  banglaName: HOSPITAL_METADATA.banglaName,
  shortName: HOSPITAL_METADATA.shortName,
  description:
    "Onnesha Hospital & Diagnostic Complex — Integrated Healthcare Services, Online OPD Specialist Appointments, Emergency Casualty Desk, and Digital Diagnostics in Bangladesh.",
  canonicalUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://onnesha-hospital.pages.dev").replace(/\/$/, ""),
  deploymentUrl: "https://onnesha-hospital.pages.dev",
  futureCustomDomain: "https://onneshahospital.com",
  locale: "en_US",
  defaultCurrency: HOSPITAL_METADATA.currency,
  currencySymbol: HOSPITAL_METADATA.currencySymbol,
  timezone: HOSPITAL_METADATA.timezone,
  links: {
    home: "/",
    about: "/about",
    services: "/services",
    doctors: "/doctors",
    appointment: "/appointment",
    checkToken: "/check-token",
    contact: "/contact",
    privacy: "/privacy",
    terms: "/terms",
    consent: "/consent",
    desktopDownload: "/downloads/desktop",
    login: "/login",
    dashboard: "/app/dashboard",
  },
} as const;

export function getAbsoluteUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_CONFIG.canonicalUrl}${cleanPath}`;
}
