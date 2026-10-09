import React from "react";
import PatientDetailView from "./PatientDetailView";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";

export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  return (
    <>
      <div className="hidden print:block">
        <HospitalPrintHeader documentTitle="OFFICIAL PATIENT 360° MEDICAL RECORD" />
      </div>
      <React.Suspense fallback={
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <PatientDetailView patientId={resolved.id} />
      </React.Suspense>
    </>
  );
}