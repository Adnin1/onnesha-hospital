import type { Metadata } from "next";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
