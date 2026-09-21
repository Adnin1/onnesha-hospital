/**
 * Onnesha Hospital Management System (OHMS)
 * Indicative Diagnostic Pathology & Imaging Reference Tariff Schedule
 *
 * Single Source of Truth for public diagnostic investigation tariff information.
 * All rates are explicitly marked as indicative reference tariffs.
 */

export interface PublicInvestigationTariff {
  id: string;
  name: string;
  category: string;
  indicativeFeeBDT: number;
  standardTurnaround: string;
  isVerifiedRate: boolean;
}

export const DIAGNOSTIC_TARIFF_CONFIG = {
  lastAuditedDate: "2026-09-21",
  tariffStatus: "INDICATIVE_REFERENCE",
  disclaimerEn: "Listed fees are indicative reference tariffs for patient guidance. Actual charges may vary depending on clinical complexity, doctor orders, and consumable requirements. Please confirm current rates at hospital reception before test intake.",
  disclaimerBn: "ওয়েবসাইটে উল্লেখিত পরীক্ষাসমূহের ফি তথ্যভিত্তিক রেফারেন্স ট্যারিফ। বর্তমান ফি ও ডেলিভারি সময়সূচী সম্পর্কে নিশ্চিত হতে অনুগ্রহ করে হাসপাতালের রিসেপশনে যোগাযোগ করুন।",
  investigations: [
    { id: "cbc-esr", name: "Complete Blood Count (CBC) with ESR", category: "Hematology", indicativeFeeBDT: 400, standardTurnaround: "2-4 Hours", isVerifiedRate: false },
    { id: "fbs-hba1c", name: "Fasting Blood Sugar (FBS) & HbA1c", category: "Biochemistry", indicativeFeeBDT: 900, standardTurnaround: "3-5 Hours", isVerifiedRate: false },
    { id: "lipid-profile", name: "Lipid Profile (Cholesterol, Triglycerides, HDL/LDL)", category: "Biochemistry", indicativeFeeBDT: 1200, standardTurnaround: "4-6 Hours", isVerifiedRate: false },
    { id: "serum-creatinine", name: "Serum Creatinine & Blood Urea Nitrogen", category: "Renal Panel", indicativeFeeBDT: 600, standardTurnaround: "2-4 Hours", isVerifiedRate: false },
    { id: "lft", name: "Liver Function Test (SGPT, SGOT, Bilirubin, Alk Phos)", category: "Hepatic Panel", indicativeFeeBDT: 1100, standardTurnaround: "4-6 Hours", isVerifiedRate: false },
    { id: "cxr", name: "Digital Chest X-Ray (P/A View High-Res)", category: "Digital Radiology", indicativeFeeBDT: 650, standardTurnaround: "1-2 Hours", isVerifiedRate: false },
    { id: "usg-abdomen", name: "Ultrasonography (Whole Abdomen)", category: "Ultrasonography", indicativeFeeBDT: 1500, standardTurnaround: "Same Day", isVerifiedRate: false },
    { id: "ecg-12lead", name: "12-Lead Electrocardiogram (ECG with Interpretation)", category: "Cardiology", indicativeFeeBDT: 450, standardTurnaround: "30-60 Mins", isVerifiedRate: false },
    { id: "echo-2d", name: "2D Echocardiography", category: "Cardiology", indicativeFeeBDT: 2500, standardTurnaround: "Same Day", isVerifiedRate: false },
    { id: "thyroid-tsh", name: "Thyroid Stimulating Hormone (TSH / FT3 / FT4)", category: "Immunology", indicativeFeeBDT: 1600, standardTurnaround: "Same Day", isVerifiedRate: false },
  ] as PublicInvestigationTariff[],
} as const;
