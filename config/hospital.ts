/**
 * Onnesha Hospital Management System (OHMS)
 * Canonical Hospital & Organization Metadata Configuration
 */
export const HOSPITAL_METADATA = {
  id: "a0000000-0000-0000-0000-000000000001",
  name: process.env.NEXT_PUBLIC_APP_NAME || "Annesha Hospital and Diagnostic Center",
  shortName: "Onnesha Hospital",
  banglaName: "অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার",
  code: process.env.NEXT_PUBLIC_HOSPITAL_CODE || "OH",
  phone: process.env.NEXT_PUBLIC_HOSPITAL_PHONE || "01718835623",
  emergencyHotline: process.env.NEXT_PUBLIC_EMERGENCY_HOTLINE || "01718835623",
  ambulanceHotline: process.env.NEXT_PUBLIC_AMBULANCE_HOTLINE || "01904210065",
  email: process.env.NEXT_PUBLIC_HOSPITAL_EMAIL || "aaih.apon@gmail.com",
  address: process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS || "সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া",
  regNo: process.env.NEXT_PUBLIC_HOSPITAL_REG_NO || "",
  timezone: "Asia/Dhaka",
  currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "BDT",
  currencySymbol: "৳",
};
