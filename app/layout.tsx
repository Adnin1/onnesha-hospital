import type { Metadata } from "next";
import "./globals.css";
import SwRegister from "@/components/app/SwRegister";
import NetworkStatus from "@/components/app/NetworkStatus";
import InstallPrompt from "@/components/app/InstallPrompt";
import AutonomousSecuritySentinel from "@/components/app/AutonomousSecuritySentinel";
import { SITE_CONFIG } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.canonicalUrl),
  title: {
    default: "ANNESHA HOSPITAL AND DIAGNOSTIC | অন্বেষা হাসপাতাল ও ডায়াগনস্টিক",
    template: "%s | ANNESHA HOSPITAL AND DIAGNOSTIC",
  },
  description: SITE_CONFIG.description,
  keywords: [
    "ANNESHA HOSPITAL AND DIAGNOSTIC",
    "Onnesha Hospital",
    "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক",
    "Doctor Appointment Bangladesh",
    "Diagnostic Center Bogura",
    "Emergency Care Bangladesh",
    "OPD Specialist Doctors",
    "Digital Hospital Bangladesh",
  ],
  authors: [{ name: "Annesha Hospital Clinical Team" }],
  creator: "ANNESHA HOSPITAL AND DIAGNOSTIC",
  publisher: "ANNESHA HOSPITAL AND DIAGNOSTIC Management System",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "ANNESHA HOSPITAL AND DIAGNOSTIC | Modern Patient Care",
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.canonicalUrl,
    siteName: SITE_CONFIG.shortName,
    locale: SITE_CONFIG.locale,
    alternateLocale: ["en_US"],
    type: "website",
    images: [
      {
        url: `${SITE_CONFIG.canonicalUrl}/logo.png`,
        width: 512,
        height: 512,
        alt: "ANNESHA HOSPITAL AND DIAGNOSTIC",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    images: [`${SITE_CONFIG.canonicalUrl}/logo.png`],
  },
  manifest: "/manifest.json",
  generator: "ANNESHA HOSPITAL AND DIAGNOSTIC HIS/EMR",
  alternates: {
    canonical: "/",
  },
};

// NOTE: Structured data (JSON-LD) is rendered by HospitalJsonLd component
// in the public layout — not here — to avoid duplicate schema signals.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900">
        <a href="#main-content" className="skip-to-content" lang="bn">মূল বিষয়বস্তুতে যান</a>
        <NetworkStatus />
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <SwRegister />
        <InstallPrompt />
        <AutonomousSecuritySentinel />
      </body>
    </html>
  );
}

