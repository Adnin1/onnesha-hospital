import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Services & Laboratory Test Rates",
  description:
    "Comprehensive list of clinical departments, diagnostic pathology tests, and indicative investigation fees at Onnesha Hospital & Diagnostic Complex, Dhaka.",
  alternates: { canonical: "/services" },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
