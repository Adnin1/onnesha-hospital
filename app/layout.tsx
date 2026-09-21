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
  description:
    "Onnesha Hospital & Diagnostic Complex — Modern Healthcare, Online OPD Specialist Appointment Booking, 24/7 Emergency, and Digital Diagnostic Services in Dhaka, Bangladesh.",
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
    description: "24/7 Modern Healthcare & Online OPD Specialist Booking. High-reliability digital healthcare system in Dhaka, Bangladesh.",
    url: SITE_CONFIG.canonicalUrl,
    siteName: "Onnesha Hospital",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Onnesha Hospital & Diagnostic Complex",
    description: "Modern Patient Care, 24/7 Emergency & Specialist Doctor Appointment in Dhaka, Bangladesh.",
  },
  manifest: "/manifest.json",
  generator: "Onnesha Hospital HIS/EMR",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  name: "Onnesha Hospital & Diagnostic Complex",
  url: SITE_CONFIG.canonicalUrl,
  description: "Modern Patient Care & Diagnostic Services in Dhaka, Bangladesh",
  serviceArea: {
    "@type": "AdministrativeArea",
    name: "Dhaka, Bangladesh",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
