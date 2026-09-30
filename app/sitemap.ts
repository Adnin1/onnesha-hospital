import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

export const dynamic = "force-static";

/**
 * Authoritative Per-Route Content Last-Modified Strategy
 * Strictly adheres to Google Search Central lastmod guidance:
 * - Reflects genuine, meaningful content update timestamps rather than synthetic build times
 * - Baseline release updates: 2026-09-29T03:00:00.000Z
 * - Latest master data & hotline updates: 2026-10-01T03:00:00.000Z
 */
const ROUTE_CONTENT_LASTMOD: Record<string, string> = {
  "": "2026-10-01T03:00:00.000Z", // Homepage — Bogura emergency hotline, ambulance, and hospital profile updates
  "/about": "2026-10-01T03:00:00.000Z", // About — Official hospital address (সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া)
  "/doctors": "2026-09-29T03:00:00.000Z", // Doctors directory — Specialist schedule & department roster
  "/services": "2026-09-29T03:00:00.000Z", // Services — Diagnostic pathology & imaging tariff catalog
  "/appointment": "2026-10-01T03:00:00.000Z", // Appointment — Atomic OPD booking wizard & doctor preselection
  "/contact": "2026-10-01T03:00:00.000Z", // Contact — Reception, emergency & ambulance hotlines
  "/privacy": "2026-09-29T03:00:00.000Z", // Privacy Policy — Patient data protection charter
  "/terms": "2026-09-29T03:00:00.000Z", // Terms of Service — Hospital admission and clinical terms
  "/consent": "2026-09-29T03:00:00.000Z", // Patient Consent — Medical procedure consent policy
  "/downloads/desktop": "2026-10-01T03:00:00.000Z", // Desktop client release notes & installer manifest
};

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.canonicalUrl;

  // Strictly include only public, indexable marketing & patient-facing portals
  // NEVER include private internal clinical routes, administrative endpoints, or transient queue lookups
  const publicRoutes = Object.keys(ROUTE_CONTENT_LASTMOD);

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(ROUTE_CONTENT_LASTMOD[route]),
    changeFrequency: route === "" || route === "/appointment" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/appointment" || route === "/doctors" ? 0.9 : 0.7,
  }));
}

