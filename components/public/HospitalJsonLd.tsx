import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { SITE_CONFIG } from "@/config/site";

export function HospitalJsonLd() {
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    "name": HOSPITAL_METADATA.name,
    "alternateName": HOSPITAL_METADATA.banglaName,
    "url": SITE_CONFIG.canonicalUrl,
    "logo": `${SITE_CONFIG.canonicalUrl}/logo.png`,
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Clinical Healthcare & Diagnostic Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Outpatient Specialist Consultation (OPD)"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Emergency Medical Triage & First Response"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Diagnostic Pathology & Digital Imaging"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Inpatient Medical Care & General Wards"
          }
        }
      ]
    }
  };

  // Only include contact info and address if configured — do not invent values
  if (HOSPITAL_METADATA.phone) structuredData["telephone"] = HOSPITAL_METADATA.phone;
  if (HOSPITAL_METADATA.emergencyHotline) structuredData["emergencyTelephone"] = HOSPITAL_METADATA.emergencyHotline;
  if (HOSPITAL_METADATA.email) structuredData["email"] = HOSPITAL_METADATA.email;
  if (HOSPITAL_METADATA.address) {
    structuredData["address"] = {
      "@type": "PostalAddress",
      "streetAddress": HOSPITAL_METADATA.address,
      "addressCountry": "BD"
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
