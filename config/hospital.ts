/**
 * Onnesha Hospital Management System (OHMS)
 * Canonical Hospital & Organization Metadata Configuration
 *
 * =========================================================================================
 * SINGLE AUTHORITATIVE SOURCE OF TRUTH (NAP: NAME, ADDRESS, PHONE)
 * =========================================================================================
 *
 * All public pages, sitemaps, JSON-LD schemas, footers, headers, and internal modules
 * MUST consume hospital identity and contact info from this file.
 *
 * -----------------------------------------------------------------------------------------
 * CONTENT TRUTH AUDIT & RECONCILIATION AUDIT:
 * -----------------------------------------------------------------------------------------
 * 1. Physical Address Reconciliation:
 *    - Repository Default: 'সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া' (In front of Sonali Bank, Khandar, Bogura)
 *    - External Directory Findings: 'Mofiz Paglar Mor, Sherpur Road, Bogura'
 *    - Status: CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED
 *      * Khandar (Sonali Bank) and Mofiz Paglar Mor (Sherpur Road) are distinct landmark
 *        locations within Bogura municipality.
 *      * Physical verification by hospital executive management / property deed is required
 *        before altering signage, Google Business Profile, or public canonical address.
 *
 * 2. Hospital Brand Name & Transliteration:
 *    - DGHS Registry (Facility ID 10022715): 'ANNESHA HOSPITAL / অন্বেষা হাসপাতাল', Bogura
 *    - ERP & Database Default: 'Annesha Hospital and Diagnostic Center'
 *    - Web Portal & Digital Brand: 'Onnesha Hospital & Diagnostic Complex' (Short: 'Onnesha Hospital')
 *    - Canonical Bengali Name: 'অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার'
 *    - Status: CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED
 *      * English transliteration of 'অন্বেষা' varies between 'Annesha' (DGHS registration & ERP DB)
 *        and 'Onnesha' (phonetic English digital branding & domain: onnesha-hospital.pages.dev).
 *      * Suffix varies between 'and Diagnostic Center' and '& Diagnostic Complex'.
 *      * Requires formal owner decision on primary legal corporate brand vs public trade name.
 * =========================================================================================
 */

export interface HospitalMetadata {
  id: string;
  name: string;
  shortName: string;
  banglaName: string;
  code: string;
  phone: string;
  officePhone?: string;
  receptionPhone?: string;
  emergencyHotline: string;
  ambulanceHotline: string;
  email: string;
  address: string;
  normalizedAddress: string;
  regNo: string;
  diagnosticLicense?: string;
  clinicLicense?: string;
  dghsFacilityId: string;
  dghsRegisteredName: string;
  dghsDivisionDistrict: string;
  externalDirectoryAddress: string;
  timezone: string;
  currency: string;
  currencySymbol: string;
  contentTruthBlockers: {
    physicalAddress: {
      status: string;
      repoDefault: string;
      repoNormalized: string;
      externalDirectory: string;
      locality: string;
      district: string;
      division: string;
      notes: string;
    };
    englishBrandTransliteration: {
      status: string;
      dghsFacilityId: string;
      dghsRegisteredName: string;
      erpDefaultName: string;
      webPortalBranding: string;
      shortName: string;
      banglaName: string;
      notes: string;
    };
  };
}

export const HOSPITAL_METADATA: HospitalMetadata = {
  id: "a0000000-0000-0000-0000-000000000001",
  // English brand name: ANNESHA HOSPITAL AND DIAGNOSTIC (Center removed per owner directive)
  name: process.env.NEXT_PUBLIC_APP_NAME || "ANNESHA HOSPITAL AND DIAGNOSTIC",
  shortName: "ANNESHA HOSPITAL",
  banglaName: "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক",
  code: process.env.NEXT_PUBLIC_HOSPITAL_CODE || "OH",
  phone: process.env.NEXT_PUBLIC_HOSPITAL_PHONE || "01895-665114, 01904210065",
  officePhone: "01904210065",
  receptionPhone: "01895-665114",
  emergencyHotline: process.env.NEXT_PUBLIC_EMERGENCY_HOTLINE || "01904210065",
  ambulanceHotline: process.env.NEXT_PUBLIC_AMBULANCE_HOTLINE || "01904210065",
  email: process.env.NEXT_PUBLIC_HOSPITAL_EMAIL || "aaih.apon@gmail.com",
  // Physical address: Official Bogura address
  address: process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS || "শেরপুর রোড, সূত্রাপুর, বগুড়া।",
  normalizedAddress: "শেরপুর রোড, সূত্রাপুর, বগুড়া।",
  regNo: process.env.NEXT_PUBLIC_HOSPITAL_REG_NO || "10022715",
  diagnosticLicense: "HSM4521681",
  clinicLicense: "HSM4312356",
  // DGHS Registry data (Facility ID 10022715)
  dghsFacilityId: "10022715",
  dghsRegisteredName: "ANNESHA HOSPITAL / অন্বেষা হাসপাতাল",
  dghsDivisionDistrict: "Rajshahi / Bogura",
  // External directory finding
  externalDirectoryAddress: "শেরপুর রোড, সূত্রাপুর, বগুড়া।",
  timezone: "Asia/Dhaka",
  currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "BDT",
  currencySymbol: "৳",
  contentTruthBlockers: {
    physicalAddress: {
      status: "RESOLVED PER OWNER DIRECTIVE",
      repoDefault: "সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া",
      repoNormalized: "সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া",
      externalDirectory: "শেরপুর রোড, সূত্রাপুর, বগুড়া।",
      locality: "Sutrapur",
      district: "Bogura",
      division: "Rajshahi",
      notes:
        "Canonical address verified per physical hospital document: Sherpur Road, Sutrapur, Bogura. Historical baseline preserved for audit: সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া.",
    },
    englishBrandTransliteration: {
      status: "RESOLVED PER OWNER DIRECTIVE",
      dghsFacilityId: "10022715",
      dghsRegisteredName: "ANNESHA HOSPITAL / অন্বেষা হাসপাতাল",
      erpDefaultName: "Annesha Hospital and Diagnostic Center",
      webPortalBranding: "ANNESHA HOSPITAL AND DIAGNOSTIC",
      shortName: "ANNESHA HOSPITAL",
      banglaName: "অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার",
      notes:
        "Canonical title established: ANNESHA HOSPITAL AND DIAGNOSTIC (Bengali: অন্বেষা হাসপাতাল ও ডায়াগনস্টিক). 'Center' has been cancelled across the system per owner instruction. Official contacts: Reception 01895-665114, Office 01904210065. Historical hotline 01718835623 and references preserved for audit compliance: 'Annesha Hospital and Diagnostic Center' and 'অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার'.",
    },
  },
};

