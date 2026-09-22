import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Services & Laboratory Test Rates",
  description:
    "Comprehensive list of clinical departments, diagnostic pathology tests, and indicative investigation fees at Onnesha Hospital & Diagnostic Complex, Dhaka.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Hospital Services & Laboratory Test Rates | Onnesha Hospital",
    description:
      "Comprehensive list of clinical departments, diagnostic pathology tests, and indicative investigation fees at Onnesha Hospital & Diagnostic Complex, Dhaka.",
    url: "/services",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
