import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onnesha Hospital & Diagnostic Complex | অন্বেষা হাসপাতাল",
  description:
    "Unified Hospital Management System (HMS) & 24/7 Patient Care, Diagnostic Testing, and Online OPD Appointment Portal in Dhaka, Bangladesh.",
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
