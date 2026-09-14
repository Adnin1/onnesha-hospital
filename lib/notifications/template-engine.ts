/**
 * Bilingual Notification Template Engine (Bangla & English)
 * 
 * Provides safe variable interpolation, HTML sanitization,
 * and standard templates with strict PHI protection.
 */

import { NotificationType } from "./types";

export interface TemplateVariables {
  [key: string]: string | number | undefined | null;
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Replaces {{variable}} in template string with sanitized values.
 */
export function interpolateTemplate(
  template: string,
  variables: TemplateVariables,
  sanitizeHtml = false
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = variables[key];
    if (val === undefined || val === null) {
      return "";
    }
    const strVal = String(val);
    return sanitizeHtml ? escapeHtml(strVal) : strVal;
  });
}

/**
 * Standard Bilingual Templates (English & Bangla)
 * Note: These maintain zero-leakage of clinical PHI (no diagnosis, symptoms, or lab findings).
 */
export const DEFAULT_TEMPLATES: Record<
  NotificationType,
  {
    sms_en: string;
    sms_bn: string;
    email_subject_en: string;
    email_subject_bn: string;
    email_body_en: string;
    email_body_bn: string;
  }
> = {
  APPOINTMENT_CONFIRMED: {
    sms_en: "Dear {{patient_name}}, appointment confirmed with {{doctor_name}} on {{date}} at {{time}}. Token: #{{token_number}}. Hospital: {{hospital_name}}.",
    sms_bn: "প্রিয় {{patient_name}}, {{doctor_name}}-এর সাথে আপনার অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে। তারিখ: {{date}}, সময়: {{time}}, সিরিয়াল: #{{token_number}}। {{hospital_name}}।",
    email_subject_en: "Appointment Confirmation - {{hospital_name}}",
    email_subject_bn: "অ্যাপয়েন্টমেন্ট কনফার্মেশন - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>Your appointment has been confirmed with <strong>{{doctor_name}}</strong> on <strong>{{date}}</strong> at <strong>{{time}}</strong>.</p><p>Your Token Number is <strong>#{{token_number}}</strong>.</p><p>Hospital Address: {{hospital_name}}</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p><strong>{{doctor_name}}</strong>-এর সাথে আপনার অ্যাপয়েন্টমেন্ট সফলভাবে নিশ্চিত হয়েছে।</p><p>তারিখ: <strong>{{date}}</strong>, সময়: <strong>{{time}}</strong>, সিরিয়াল নম্বর: <strong>#{{token_number}}</strong>।</p><p>{{hospital_name}}</p>",
  },
  TOKEN_ASSIGNED: {
    sms_en: "Dear {{patient_name}}, your live queue token is #{{token_number}} for {{doctor_name}}. Current serving: #{{current_serving}}. {{hospital_name}}.",
    sms_bn: "প্রিয় {{patient_name}}, {{doctor_name}}-এর জন্য আপনার সিরিয়াল নম্বর #{{token_number}}। বর্তমানে চলছে: #{{current_serving}}। {{hospital_name}}।",
    email_subject_en: "Queue Token Assigned - {{hospital_name}}",
    email_subject_bn: "সিরিয়াল নম্বর প্রদান - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>Your queue token for <strong>{{doctor_name}}</strong> is <strong>#{{token_number}}</strong>.</p><p>Current live serving token: <strong>#{{current_serving}}</strong>.</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p><strong>{{doctor_name}}</strong>-এর জন্য আপনার সিরিয়াল নম্বর: <strong>#{{token_number}}</strong>।</p><p>বর্তমানে দেখা হচ্ছে: <strong>#{{current_serving}}</strong>।</p>",
  },
  APPOINTMENT_REMINDER: {
    sms_en: "Reminder: You have an appointment with {{doctor_name}} today at {{time}} at {{hospital_name}}. Token: #{{token_number}}.",
    sms_bn: "স্মারক: আজ {{time}}-এ {{hospital_name}}-এ {{doctor_name}}-এর সাথে আপনার অ্যাপয়েন্টমেন্ট রয়েছে। সিরিয়াল: #{{token_number}}।",
    email_subject_en: "Appointment Reminder - {{hospital_name}}",
    email_subject_bn: "অ্যাপয়েন্টমেন্ট স্মারক - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>This is a reminder for your upcoming appointment with <strong>{{doctor_name}}</strong> on <strong>{{date}} at {{time}}</strong>.</p><p>Token: #{{token_number}}</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>আজ <strong>{{date}}</strong> তারিখ <strong>{{time}}</strong>-এ <strong>{{doctor_name}}</strong>-এর সাথে আপনার অ্যাপয়েন্টমেন্টের কথা স্মরণ করিয়ে দেওয়া হচ্ছে।</p><p>সিরিয়াল: #{{token_number}}</p>",
  },
  BILL_RECEIPT: {
    sms_en: "Payment received: BDT {{amount}} for Invoice #{{invoice_number}}. Balance Due: BDT {{due_amount}}. Receipt: {{receipt_url}}. {{hospital_name}}.",
    sms_bn: "পেমেন্ট গ্রহণ করা হয়েছে: ৳{{amount}}, ইনভয়েস #{{invoice_number}}। বকেয়া: ৳{{due_amount}}। রসিদ: {{receipt_url}}। {{hospital_name}}।",
    email_subject_en: "Payment Receipt #{{invoice_number}} - {{hospital_name}}",
    email_subject_bn: "পেমেন্ট রসিদ #{{invoice_number}} - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>We have received your payment of <strong>BDT {{amount}}</strong> for Invoice <strong>#{{invoice_number}}</strong>.</p><p>Current Balance Due: <strong>BDT {{due_amount}}</strong>.</p><p><a href=\"{{receipt_url}}\">Download Receipt</a></p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>ইনভয়েস <strong>#{{invoice_number}}</strong>-এর বিপরীতে আপনার <strong>৳{{amount}}</strong> পেমেন্ট প্রাপ্ত হয়েছে।</p><p>বর্তমান বকেয়া: <strong>৳{{due_amount}}</strong>।</p><p><a href=\"{{receipt_url}}\">রসিদ ডাউনলোড করুন</a></p>",
  },
  PAYMENT_FAILED: {
    sms_en: "Payment of BDT {{amount}} for Invoice #{{invoice_number}} could not be processed. Please retry or contact billing at {{hospital_phone}}.",
    sms_bn: "ইনভয়েস #{{invoice_number}}-এর জন্য ৳{{amount}} পেমেন্ট সম্পন্ন করা যায়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন বা যোগাযোগ করুন: {{hospital_phone}}।",
    email_subject_en: "Payment Unsuccessful - {{hospital_name}}",
    email_subject_bn: "পেমেন্ট ব্যর্থ হয়েছে - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>We could not process your online payment of <strong>BDT {{amount}}</strong> for Invoice #{{invoice_number}}.</p><p>Please retry using the billing portal or contact our desk at {{hospital_phone}}.</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>ইনভয়েস #{{invoice_number}}-এর জন্য ৳{{amount}} পেমেন্টটি ব্যর্থ হয়েছে।</p><p>অনুগ্রহ করে পুনরায় চেষ্টা করুন অথবা হাসপাতালে যোগাযোগ করুন: {{hospital_phone}}।</p>",
  },
  DUE_REMINDER: {
    sms_en: "Outstanding balance reminder: BDT {{due_amount}} pending for Invoice #{{invoice_number}}. Pay online: {{payment_link}}. {{hospital_name}}.",
    sms_bn: "বকেয়া বিল পরিশোধ স্মারক: ইনভয়েস #{{invoice_number}}-এর জন্য ৳{{due_amount}} বকেয়া রয়েছে। অনলাইনে পরিশোধ লিংক: {{payment_link}}। {{hospital_name}}।",
    email_subject_en: "Outstanding Invoice Balance - {{hospital_name}}",
    email_subject_bn: "বকেয়া বিল নোটিশ - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>You have an outstanding balance of <strong>BDT {{due_amount}}</strong> for Invoice <strong>#{{invoice_number}}</strong>.</p><p>You may settle this invoice online securely: <a href=\"{{payment_link}}\">Pay Now</a></p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>ইনভয়েস <strong>#{{invoice_number}}</strong>-এর বিপরীতে আপনার <strong>৳{{due_amount}}</strong> বকেয়া রয়েছে।</p><p>অনলাইনে নিরাপদে পরিশোধ করতে ক্লিক করুন: <a href=\"{{payment_link}}\">এখানে পে করুন</a></p>",
  },
  REPORT_READY: {
    sms_en: "Dear {{patient_name}}, your investigation report for Invoice #{{invoice_number}} is now ready. View securely: {{portal_url}}. {{hospital_name}}.",
    sms_bn: "প্রিয় {{patient_name}}, ইনভয়েস #{{invoice_number}}-এর ডায়াগনস্টিক রিপোর্ট প্রস্তুত। নিরাপদে দেখতে ভিজিট করুন: {{portal_url}}। {{hospital_name}}।",
    email_subject_en: "Diagnostic Report Ready - {{hospital_name}}",
    email_subject_bn: "ডায়াগনস্টিক টেস্ট রিপোর্ট প্রস্তুত - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>Your diagnostic test report for Order #{{invoice_number}} has been verified and is ready for download.</p><p>Log in securely to download your verified report: <a href=\"{{portal_url}}\">Patient Portal</a></p><p><em>For patient privacy, reports are not sent as direct email attachments.</em></p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>অর্ডার #{{invoice_number}}-এর টেস্ট রিপোর্ট যাচাই সম্পন্ন হয়েছে এবং প্রস্তুত রয়েছে।</p><p>নিরাপদে রিপোর্ট ডাউনলোড করতে লগইন করুন: <a href=\"{{portal_url}}\">পেশেন্ট পোর্টাল</a></p>",
  },
  ADMISSION_NOTICE: {
    sms_en: "Admission Confirmed: {{patient_name}} admitted to Bed {{bed_number}} ({{ward_name}}). Admission #{{admission_number}}. {{hospital_name}}.",
    sms_bn: "ভর্তি নিশ্চিত: {{patient_name}}-কে {{ward_name}}-এর বেড নম্বর {{bed_number}}-এ ভর্তি করা হয়েছে। ভর্তি নং: #{{admission_number}}। {{hospital_name}}।",
    email_subject_en: "Admission Notice - {{hospital_name}}",
    email_subject_bn: "ভর্তি নিশ্চিতকরণ - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>Admission #<strong>{{admission_number}}</strong> confirmed.</p><p>Assigned Ward: <strong>{{ward_name}}</strong>, Bed: <strong>{{bed_number}}</strong>.</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>ভর্তি নং #<strong>{{admission_number}}</strong> সম্পন্ন হয়েছে।</p><p>ওয়ার্ড: <strong>{{ward_name}}</strong>, বেড: <strong>{{bed_number}}</strong>।</p>",
  },
  DISCHARGE_NOTICE: {
    sms_en: "Discharge Completed: {{patient_name}} has been discharged from {{hospital_name}}. Discharge Summary available at portal: {{portal_url}}.",
    sms_bn: "ছাড়পত্র সম্পন্ন: {{patient_name}}-এর ডিসচার্জ সম্পন্ন হয়েছে। ডিসচার্জ সামারি দেখতে ভিজিট করুন: {{portal_url}}। {{hospital_name}}।",
    email_subject_en: "Discharge Completed - {{hospital_name}}",
    email_subject_bn: "ডিসচার্জ নোটিশ - {{hospital_name}}",
    email_body_en: "<p>Dear {{patient_name}},</p><p>You have been formally discharged. You can access your discharge summary and medications on the patient portal: <a href=\"{{portal_url}}\">View Summary</a>.</p>",
    email_body_bn: "<p>প্রিয় {{patient_name}},</p><p>আপনার আনুষ্ঠানিক ডিসচার্জ সম্পন্ন হয়েছে। ডিসচার্জ সামারি এবং প্রেসক্রিপশন দেখতে পোর্টালে ভিজিট করুন: <a href=\"{{portal_url}}\">পোর্টাল লিংক</a>।</p>",
  },
  OTP: {
    sms_en: "Your {{hospital_name}} verification code is {{otp_code}}. Valid for {{valid_minutes}} minutes. Do not share this OTP with anyone.",
    sms_bn: "{{hospital_name}}-এর ওটিপি ভেরিফিকেশন কোড হলো {{otp_code}}। মেয়াদ {{valid_minutes}} মিনিট। এই কোডটি কাউকে বলবেন না।",
    email_subject_en: "Your Security Verification Code - {{hospital_name}}",
    email_subject_bn: "নিরাপত্তা ওটিপি কোড - {{hospital_name}}",
    email_body_en: "<p>Your security verification code is <strong>{{otp_code}}</strong>.</p><p>Valid for {{valid_minutes}} minutes. Do not share this code with anyone.</p>",
    email_body_bn: "<p>আপনার নিরাপত্তা ভেরিফিকেশন ওটিপি কোড: <strong>{{otp_code}}</strong>।</p><p>মেয়াদ: {{valid_minutes}} মিনিট। এই কোড গোপন রাখুন।</p>",
  },
};
