import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Onnesha Hospital & Diagnostic Complex",
  description:
    "Contact Onnesha Hospital for appointments, emergency information, directions, and general enquiries. Find our address, hotlines, and patient services.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Us | Onnesha Hospital & Diagnostic Complex",
    description:
      "Contact Onnesha Hospital for appointments, emergency information, directions, and general enquiries. Find our address, hotlines, and patient services.",
    url: "/contact",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
