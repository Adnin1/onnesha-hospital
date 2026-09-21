import type { Metadata } from "next";
import "./globals.css";
import SwRegister from "@/components/app/SwRegister";
import NetworkStatus from "@/components/app/NetworkStatus";
import InstallPrompt from "@/components/app/InstallPrompt";
import { SITE_CONFIG } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.canonicalUrl),
  title: {
    default: "Onnesha Hospital & Diagnostic Complex | অন্বেষা হাসপাতাল",
    template: "%s | Onnesha Hospital",
  },
  description: SITE_CONFIG.description,
  keywords: [
    "Onnesha Hospital",
    "অন্বেষা হাসপাতাল",
    "Doctor Appointment Dhaka",
    "Diagnostic Complex Dhaka",
    "Emergency Care Bangladesh",
    "OPD Specialist Doctors",
    "Digital Hospital Bangladesh",
  ],
  authors: [{ name: "Onnesha Hospital Clinical Team" }],
  creator: "Onnesha Hospital",
  publisher: "Onnesha Hospital Management System",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Onnesha Hospital & Diagnostic Complex | Modern Patient Care",
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.canonicalUrl,
    siteName: SITE_CONFIG.shortName,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
  },
  manifest: "/manifest.json",
  generator: "Onnesha Hospital HIS/EMR",
};

// NOTE: Structured data (JSON-LD) is rendered by HospitalJsonLd component
// in the public layout — not here — to avoid duplicate schema signals.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900">
        <a href="#main-content" className="skip-to-content">মূল বিষয়বস্তুতে যান</a>
        <NetworkStatus />
        <div id="main-content" className="flex-1 flex flex-col">
          {children}
        </div>
        <SwRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}

