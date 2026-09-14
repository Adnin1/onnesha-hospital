import { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://onneshahospital.com";
  const lastModified = new Date();

  // Strictly include only public, indexable marketing & patient-facing portals
  // NEVER include private internal clinical routes or administrative login endpoints
  const publicRoutes = [
    "",
    "/about",
    "/doctors",
    "/services",
    "/appointment",
    "/check-token",
    "/contact",
    "/privacy",
    "/terms",
    "/consent",
    "/downloads/desktop",
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/appointment" || route === "/check-token" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/appointment" || route === "/doctors" ? 0.9 : 0.7,
  }));
}
