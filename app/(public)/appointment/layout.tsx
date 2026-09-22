import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Doctor Appointment Online | OPD Serial Token",
  description:
    "Book an OPD specialist appointment at Onnesha Hospital online. Choose your doctor, pick a date, and get a digital token number instantly.",
  alternates: { canonical: "/appointment" },
  openGraph: {
    title: "Book Doctor Appointment Online | Onnesha Hospital",
    description:
      "Book an OPD specialist appointment at Onnesha Hospital online. Choose your doctor, pick a date, and get a digital token number instantly.",
    url: "/appointment",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AppointmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
