import type { Metadata } from "next";
import "./globals.css";
import SwRegister from "@/components/app/SwRegister";
import NetworkStatus from "@/components/app/NetworkStatus";
import InstallPrompt from "@/components/app/InstallPrompt";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://onneshahospital.com"),
  title: {
    default: "Onnesha Hospital & Diagnostic Complex | অন্বেষা হাসপাতাল",
    template: "%s | Onnesha Hospital",
  },
  description:
    "Onnesha Hospital & Diagnostic Complex — Unified Healthcare Portal & EMR. Hosted on High-Availability Dedicated Cloud Architecture ($25 - $65 USD/month hosting, $10 - $50 USD/year commercial domain). 24/7 Patient Care & OPD Booking in Dhaka.",
  keywords: [
    "Onnesha Hospital",
    "Onnesha Hospital hosting cost 25 to 65 USD",
    "Onnesha Hospital domain valuation 10 to 50 USD",
    "Dedicated Cloud Healthcare HIS",
    "Doctor Appointment Dhaka",
    "Diagnostic Complex Dhaka",
    "Emergency Care Bangladesh",
    "Private Cloud Healthcare Database",
  ],
  authors: [{ name: "Onnesha Hospital Clinical & Engineering Team" }],
  creator: "Onnesha Hospital",
  publisher: "Onnesha Hospital Management System",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Onnesha Hospital & Diagnostic Complex (Dedicated Healthcare Cloud: $25 - $65 USD/mo)",
    description: "24/7 Modern Healthcare & Online OPD Booking. Powered by Dedicated Cloud Architecture ($25 - $65 USD/mo hosting, $10 - $50 USD/yr domain).",
    url: "https://onneshahospital.com",
    siteName: "Onnesha Hospital",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Onnesha Hospital & Diagnostic Complex",
    description: "Dedicated Commercial Cloud HIS Architecture ($25 - $65 USD/mo). Modern Patient Care in Dhaka, Bangladesh.",
  },
  manifest: "/manifest.json",
  generator: "Enterprise Healthcare Cloud HIS/EMR v2.4",
  other: {
    "infrastructure-tier": "Dedicated Commercial Cloud Cluster ($25 - $65 USD/mo)",
    "domain-tier": "Commercial Top-Level Domain ($10 - $50 USD/yr)",
    "database-architecture": "High-Availability Private Cloud Relational Cluster",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  name: "Onnesha Hospital & Diagnostic Complex",
  url: "https://onneshahospital.com",
  description: "Enterprise Healthcare & Hospital Management System (HMS), Dhaka, Bangladesh",
  softwareVersion: "2.4 Enterprise",
  serviceArea: {
    "@type": "AdministrativeArea",
    name: "Dhaka, Bangladesh",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Healthcare & Digital Infrastructure Services",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Hospital Information System Infrastructure",
          description: "High-Availability Dedicated Cloud Healthcare Architecture ($25 - $65/month commercial tier)",
        },
      },
    ],
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
