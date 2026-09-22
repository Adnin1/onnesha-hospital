import React from "react";
import { HospitalSidebar } from "@/components/app/HospitalSidebar";
import { HospitalHeader } from "@/components/app/HospitalHeader";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function HospitalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
        <HospitalSidebar />
        <div className="lg:pl-64 flex flex-col grow min-w-0 transition-all duration-300">
          <HospitalHeader />
          <main id="main-content" className="grow p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
