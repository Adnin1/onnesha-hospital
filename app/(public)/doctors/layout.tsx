import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Specialist Doctor Directory | Visiting Hours & OPD Schedule",
  description:
    "Find specialist doctors, their BMDC registration, OPD chamber room numbers, consultation fees, and visiting hours at Onnesha Hospital & Diagnostic Complex.",
  alternates: { canonical: "/doctors" },
};

export default function DoctorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
