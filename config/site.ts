/**
 * Onnesha Hospital Management & Enterprise Resource Planning System (OHMS ERP)
 * Unified Site & Canonical Domain Configuration
 * Single source of truth for SEO, metadata, canonical URLs, sitemaps, and robots.
 */

export const SITE_CONFIG = {
  name: "Onnesha Hospital & Diagnostic Complex",
  banglaName: "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক কমপ্লেক্স",
  shortName: "Onnesha Hospital",
  description:
    "Onnesha Hospital & Diagnostic Complex — Integrated Healthcare Services, Online OPD Specialist Appointments, Emergency Casualty Desk, and Digital Diagnostics in Dhaka, Bangladesh.",
  canonicalUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://onnesha-hospital.pages.dev").replace(/\/$/, ""),
  deploymentUrl: "https://onnesha-hospital.pages.dev",
  futureCustomDomain: "https://onneshahospital.com",
  locale: "en_US",
  defaultCurrency: "BDT",
  currencySymbol: "৳",
  timezone: "Asia/Dhaka",
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
