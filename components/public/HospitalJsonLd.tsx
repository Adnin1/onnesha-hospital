import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { SITE_CONFIG } from "@/config/site";

export function HospitalJsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    "name": HOSPITAL_METADATA.name,
    "alternateName": HOSPITAL_METADATA.banglaName,
    "url": SITE_CONFIG.canonicalUrl,
    "logo": `${SITE_CONFIG.canonicalUrl}/logo.png`,
    "telephone": HOSPITAL_METADATA.phone || undefined,
    "emergencyTelephone": HOSPITAL_METADATA.emergencyHotline || undefined,
    "email": HOSPITAL_METADATA.email || undefined,
    "address": HOSPITAL_METADATA.address ? {
      "@type": "PostalAddress",
      "streetAddress": HOSPITAL_METADATA.address,
      "addressCountry": "BD"
    } : undefined,
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        "opens": "08:00",
        "closes": "22:00"
      }
    ],
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

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
