import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Onnesha Hospital & Diagnostic Complex",
  description:
    "Contact Onnesha Hospital for appointments, emergency information, directions, and general enquiries. Find our address, hotlines, and patient services.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
