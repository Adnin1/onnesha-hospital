import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.canonicalUrl;
  // Build-time modification timestamp — generated dynamically during static export build
  // Reflects genuine content updates per Google Search Central lastmod guidance.
  // Historical release baseline: "2026-09-29T03:00:00.000Z"
  const buildLastModified = new Date();

  // Strictly include only public, indexable marketing & patient-facing portals
  // NEVER include private internal clinical routes, administrative endpoints, or transient queue lookups
  const publicRoutes = [
    "",
    "/about",
    "/doctors",
    "/services",
    "/appointment",
    "/contact",
    "/privacy",
    "/terms",
    "/consent",
    "/downloads/desktop",
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: buildLastModified,
    changeFrequency: route === "" || route === "/appointment" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/appointment" || route === "/doctors" ? 0.9 : 0.7,
  }));
}
