import React from "react";
import Head from "next/head";
import { HOSPITAL_METADATA } from "@/config/hospital";

export function HospitalJsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    "name": HOSPITAL_METADATA.name,
    "alternateName": HOSPITAL_METADATA.banglaName,
    "url": "https://onneshahospital.com",
    "logo": "https://onneshahospital.com/logo.png",
    "telephone": HOSPITAL_METADATA.phone,
    "emergencyTelephone": HOSPITAL_METADATA.emergencyHotline,
    "email": HOSPITAL_METADATA.email,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Hospital Road, Main Bazar",
      "addressLocality": "Dhaka",
      "addressRegion": "Dhaka Division",
      "postalCode": "1200",
      "addressCountry": "BD"
    },
    "openingHoursSpecification": {
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
      "opens": "00:00",
      "closes": "23:59"
    },
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
            "name": "24/7 Trauma Emergency Care & Casualty Triage"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Intensive Care Unit (ICU / CCU / NICU)"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "MedicalService",
            "name": "Automated Pathology & Digital Radiology"
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
