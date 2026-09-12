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
      <PatientDetailView patientId={resolved.id} />
    </>
  );
}