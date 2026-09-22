import React from "react";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { PublicFooter } from "@/components/public/PublicFooter";
import { HospitalJsonLd } from "@/components/public/HospitalJsonLd";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <HospitalJsonLd />
      <PublicNavbar />
      <main id="main-content" className="grow">{children}</main>
      <PublicFooter />
    </div>
  );
}
