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
    "Unified Hospital Management System (HMS) & 24/7 Patient Care, Diagnostic Testing, and Online OPD Appointment Portal in Dhaka, Bangladesh.",
  keywords: [
    "Hospital in Dhaka",
    "Onnesha Hospital",
    "Diagnostic Complex",
    "Doctor Appointment Dhaka",
    "Emergency Care Bangladesh",
    "Pathology Lab",
  ],
  authors: [{ name: "Onnesha Hospital Clinical Team" }],
  creator: "Onnesha Hospital",
  publisher: "Onnesha Hospital Management System",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Onnesha Hospital & Diagnostic Complex",
    description: "24/7 Modern Healthcare, Diagnostic Services, and Online OPD Booking.",
    url: "https://onneshahospital.com",
    siteName: "Onnesha Hospital",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Onnesha Hospital & Diagnostic Complex",
    description: "Modern Patient Care & Diagnostic Services in Dhaka, Bangladesh.",
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
