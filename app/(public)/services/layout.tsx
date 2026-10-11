import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Services & Laboratory Test Rates",
  description:
    "Comprehensive list of clinical departments, diagnostic pathology tests, and indicative investigation fees at ANNESHA HOSPITAL AND DIAGNOSTIC.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Hospital Services & Laboratory Test Rates | ANNESHA HOSPITAL AND DIAGNOSTIC",
    description:
      "Comprehensive list of clinical departments, diagnostic pathology tests, and indicative investigation fees at ANNESHA HOSPITAL AND DIAGNOSTIC.",
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
