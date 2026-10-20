import React from "react";
import { HospitalSidebar } from "@/components/app/HospitalSidebar";
import { HospitalHeader } from "@/components/app/HospitalHeader";
import SystemHealthAlertBanner from "@/components/app/SystemHealthAlertBanner";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function HospitalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 print:bg-white print:min-h-0 print:p-0 print:m-0">
        <div className="print:hidden">
          <HospitalSidebar />
        </div>
        <div className="lg:pl-64 flex flex-col grow min-w-0 transition-all duration-300 print:pl-0 print:m-0 print:p-0">
          <div className="print:hidden">
            <SystemHealthAlertBanner variant="banner" />
            <HospitalHeader />
          </div>
          <main id="main-content" className="grow p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:m-0 print:max-w-none print:w-full">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
