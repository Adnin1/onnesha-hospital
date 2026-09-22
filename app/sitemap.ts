import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.canonicalUrl;
  // Stable release audit timestamp to avoid false daily churn on build
  const releaseLastModified = new Date("2026-09-21T00:00:00.000Z");

  // Strictly include only public, indexable marketing & patient-facing portals
  // NEVER include private internal clinical routes or administrative login endpoints
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
