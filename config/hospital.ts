/**
 * Onnesha Hospital Management System (OHMS)
 * Canonical Hospital & Organization Metadata Configuration
 */
export const HOSPITAL_METADATA = {
  id: "a0000000-0000-0000-0000-000000000001",
  name: process.env.NEXT_PUBLIC_APP_NAME || "Onnesha Hospital & Diagnostic Complex",
  banglaName: "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক কমপ্লেক্স",
  code: process.env.NEXT_PUBLIC_HOSPITAL_CODE || "OH",
  phone: process.env.NEXT_PUBLIC_HOSPITAL_PHONE || "",
  emergencyHotline: process.env.NEXT_PUBLIC_EMERGENCY_HOTLINE || "01700-112233",
  ambulanceHotline: process.env.NEXT_PUBLIC_AMBULANCE_HOTLINE || "01800-445566",
  email: process.env.NEXT_PUBLIC_HOSPITAL_EMAIL || "",
  address: process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS || "",
  regNo: process.env.NEXT_PUBLIC_HOSPITAL_REG_NO || "",
  timezone: "Asia/Dhaka",
  currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "BDT",
  currencySymbol: "৳",
};
