import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.canonicalUrl;
  // Release baseline provenance: 2026-09-23T02:00:00.000Z
  // Accurate release v1.1.12 modification timestamp:
  const releaseLastModified = new Date("2026-09-28T05:00:00.000Z");

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
    lastModified: releaseLastModified,
    changeFrequency: route === "" || route === "/appointment" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/appointment" || route === "/doctors" ? 0.9 : 0.7,
  }));
}
