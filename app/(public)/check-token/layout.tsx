import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check Live OPD Token Status | Doctor Queue",
  description:
    "Check your live OPD token status and doctor chamber queue at Onnesha Hospital. Enter your token number to see your waiting position in real time.",
  alternates: { canonical: "/check-token" },
  robots: { index: false, follow: false }, // Patient-specific lookup — noindex to avoid indexing transient queue states
};

export default function CheckTokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
