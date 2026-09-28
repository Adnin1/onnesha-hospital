/**
 * Onnesha Hospital Management System (OHMS)
 * Comprehensive Financial Reporting & Analytics Engine
 * Pure computational utilities for financial aggregation, period filtering, and export.
 */

import type { InvoiceRecord } from "../../types/billing";

export type FinancialPeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all"
  | "custom";

export interface DepartmentRevenueSummary {
  category: string;
  categoryLabelBn: string;
  categoryLabelEn: string;
  itemCount: number;
  totalRevenue: number;
  percentageOfTotal: number;
}

export interface PaymentChannelSummary {
  method: string;
  methodLabelBn: string;
  methodLabelEn: string;
  transactionCount: number;
  totalCollected: number;
  percentageOfTotal: number;
}

export interface MonthlyTrendData {
  monthIndex: number;
  monthName: string;
  monthNameBn: string;
  year: number;
  invoiced: number;
  collected: number;
  dues: number;
  collectionRate: number;
}

export interface FinancialAggregates {
  totalInvoicesCount: number;
  activeInvoicesCount: number;
  voidedInvoicesCount: number;
  totalBilled: number;
  totalCollected: number;
  totalDues: number;
  totalDiscounts: number;
  totalVoidedAmount: number;
  collectionRate: number; // percentage (0 - 100)
  dueRate: number;        // percentage (0 - 100)
}

/**
 * Filter invoices based on selected period and optional custom date bounds.
 * Uses ISO date comparison against Asia/Dhaka day boundaries.
 */
export function filterInvoicesByPeriod(
  invoices: InvoiceRecord[],
  period: FinancialPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): InvoiceRecord[] {
  if (period === "all") return invoices;

  const now = referenceDate;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  return invoices.filter((inv) => {
    const invDate = new Date(inv.created_at);
    if (isNaN(invDate.getTime())) return false;

    switch (period) {
      case "today": {
        return (
          invDate.getFullYear() === now.getFullYear() &&
          invDate.getMonth() === now.getMonth() &&
          invDate.getDate() === now.getDate()
        );
      }
      case "this_week": {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return invDate >= sevenDaysAgo && invDate <= now;
      }
      case "this_month": {
        return (
          invDate.getFullYear() === currentYear &&
          invDate.getMonth() === currentMonth
        );
      }
      case "last_month": {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return (
          invDate.getFullYear() === lastMonthYear &&
          invDate.getMonth() === lastMonth
        );
      }
      case "this_year": {
        return invDate.getFullYear() === currentYear;
      }
      case "custom": {
        if (!customStart) return true;
        const startDate = new Date(customStart + "T00:00:00");
        const endDate = customEnd ? new Date(customEnd + "T23:59:59") : new Date();
        return invDate >= startDate && invDate <= endDate;
      }
      default:
        return true;
    }
  });
}

/**
 * Compute high-level financial KPI metrics from filtered invoices.
 */
export function computeFinancialAggregates(invoices: InvoiceRecord[]): FinancialAggregates {
  let totalBilled = 0;
  let totalCollected = 0;
  let totalDues = 0;
  let totalDiscounts = 0;
  let totalVoidedAmount = 0;
  let voidedInvoicesCount = 0;
  let activeInvoicesCount = 0;

  for (const inv of invoices) {
    if (inv.is_voided) {
      voidedInvoicesCount++;
      totalVoidedAmount += Number(inv.grand_total || 0);
    } else {
      activeInvoicesCount++;
      totalBilled += Number(inv.grand_total || (inv.subtotal - (inv.discount_amount || 0)) || 0);
      totalCollected += Number(inv.paid_amount || 0);
      totalDues += Number(inv.due_amount || 0);
      totalDiscounts += Number(inv.discount_amount || 0);
    }
  }

  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  const dueRate = totalBilled > 0 ? Math.round((totalDues / totalBilled) * 100) : 0;

  return {
    totalInvoicesCount: invoices.length,
    activeInvoicesCount,
    voidedInvoicesCount,
    totalBilled,
    totalCollected,
    totalDues,
    totalDiscounts,
    totalVoidedAmount,
    collectionRate,
    dueRate,
  };
}

/**
 * Department metadata mapping for hospital service categories.
 */
const DEPARTMENT_MAP: Record<string, { labelBn: string; labelEn: string }> = {
  CONSULTATION: { labelBn: "ডাক্তার ওপিডি কনসালটেশন", labelEn: "OPD Doctor Consultation" },
  LAB: { labelBn: "প্যাথলজি ও ডায়াগনস্টিক ল্যাব", labelEn: "Diagnostic Pathology & Lab" },
  XRAY: { labelBn: "ডিজিটাল এক্স-রে", labelEn: "Digital X-Ray" },
  USG: { labelBn: "আল্ট্রাসনোগ্রাফি (USG)", labelEn: "Ultrasonography (USG)" },
  ECG: { labelBn: "ইসিজি ও কার্ডিয়াক পরীক্ষা", labelEn: "ECG & Cardiac Screening" },
  PHARMACY: { labelBn: "ফার্মেসি ও ওষুধ বিক্রয়", labelEn: "Pharmacy & Medicine Sales" },
  BED: { labelBn: "আইপিডি বেড চার্জ", labelEn: "Inpatient Ward Bed Charges" },
  CABIN: { labelBn: "কেবিন ও ভিআইপি রুম", labelEn: "Inpatient Cabin & Rooms" },
  OT: { labelBn: "অপারেশন থিয়েটার ও সার্জারি", labelEn: "Operation Theatre & Surgery" },
  AMBULANCE: { labelBn: "অ্যাম্বুলেন্স জরুরি সার্ভিস", labelEn: "Emergency Ambulance Service" },
  MISC: { labelBn: "অন্যান্য মেডিকেল প্রসিডিউর", labelEn: "Miscellaneous Medical Services" },
};

/**
 * Compute revenue distribution across hospital departments.
 */
export function computeDepartmentalRevenue(invoices: InvoiceRecord[]): DepartmentRevenueSummary[] {
  const activeInvoices = invoices.filter((i) => !i.is_voided);
  const buckets: Record<string, { count: number; total: number }> = {};

  // Initialize standard buckets
  for (const cat of Object.keys(DEPARTMENT_MAP)) {
    buckets[cat] = { count: 0, total: 0 };
  }

  let grandDepartmentRevenue = 0;

  for (const inv of activeInvoices) {
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const cat = item.service_category || "MISC";
        const total = Number(item.total_price || (item.unit_price * item.quantity) || 0);
        const qty = Number(item.quantity || 1);

        if (!buckets[cat]) {
          buckets[cat] = { count: 0, total: 0 };
        }
        buckets[cat].count += qty;
        buckets[cat].total += total;
        grandDepartmentRevenue += total;
      }
    }
  }

  return Object.entries(buckets)
    .map(([cat, data]) => {
      const meta = DEPARTMENT_MAP[cat] || { labelBn: cat, labelEn: cat };
      const percentage = grandDepartmentRevenue > 0
        ? Math.round((data.total / grandDepartmentRevenue) * 100 * 10) / 10
        : 0;

      return {
        category: cat,
        categoryLabelBn: meta.labelBn,
        categoryLabelEn: meta.labelEn,
        itemCount: data.count,
        totalRevenue: data.total,
        percentageOfTotal: percentage,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Payment channel metadata mapping.
 */
const PAYMENT_METHOD_MAP: Record<string, { labelBn: string; labelEn: string }> = {
  CASH: { labelBn: "ক্যাশ / নগদ টাকা", labelEn: "Cash Register" },
  BKASH: { labelBn: "বিকাশ (bKash)", labelEn: "bKash Digital MFS" },
  NAGAD: { labelBn: "নগদ (Nagad)", labelEn: "Nagad Digital MFS" },
  ROCKET: { labelBn: "রকেট (DBBL Rocket)", labelEn: "Rocket Mobile Banking" },
  UPAY: { labelBn: "উপায় (Upay)", labelEn: "Upay MFS" },
  VISA: { labelBn: "ভিসা কার্ড (Visa Card)", labelEn: "Visa Debit/Credit Card" },
  MASTERCARD: { labelBn: "মাস্টারকার্ড (Mastercard)", labelEn: "Mastercard POS" },
  BANK_TRANSFER: { labelBn: "ব্যাংক ট্রান্সফার / চেক", labelEn: "Direct Bank Transfer" },
};

/**
 * Compute breakdown of collections by payment method.
 */
export function computePaymentChannelBreakdown(invoices: InvoiceRecord[]): PaymentChannelSummary[] {
  const activeInvoices = invoices.filter((i) => !i.is_voided);
  const buckets: Record<string, { count: number; total: number }> = {};

  let grandCollected = 0;

  for (const inv of activeInvoices) {
    if (inv.payments && Array.isArray(inv.payments)) {
      for (const pmt of inv.payments) {
        const method = (pmt.payment_method || "CASH").toUpperCase();
        const amt = Number(pmt.amount || 0);

        if (!buckets[method]) {
          buckets[method] = { count: 0, total: 0 };
        }
        buckets[method].count += 1;
        buckets[method].total += amt;
        grandCollected += amt;
      }
    }
  }

  return Object.entries(buckets)
    .map(([method, data]) => {
      const meta = PAYMENT_METHOD_MAP[method] || { labelBn: method, labelEn: method };
      const percentage = grandCollected > 0
        ? Math.round((data.total / grandCollected) * 100 * 10) / 10
        : 0;

      return {
        method,
        methodLabelBn: meta.labelBn,
        methodLabelEn: meta.labelEn,
        transactionCount: data.count,
        totalCollected: data.total,
        percentageOfTotal: percentage,
      };
    })
    .sort((a, b) => b.totalCollected - a.totalCollected);
}

const MONTH_NAMES = [
  { en: "January", bn: "জানুয়ারি" },
  { en: "February", bn: "ফেব্রুয়ারি" },
  { en: "March", bn: "মার্চ" },
  { en: "April", bn: "এপ্রিল" },
  { en: "May", bn: "মে" },
  { en: "June", bn: "জুন" },
  { en: "July", bn: "জুলাই" },
  { en: "August", bn: "আগস্ট" },
  { en: "September", bn: "সেপ্টেম্বর" },
  { en: "October", bn: "অক্টোবর" },
  { en: "November", bn: "নভেম্বর" },
  { en: "December", bn: "ডিসেম্বর" },
];

/**
 * Compute month-by-month financial trend for the given year.
 */
export function computeMonthlyFinancialTrend(
  invoices: InvoiceRecord[],
  year: number = new Date().getFullYear()
): MonthlyTrendData[] {
  const result: MonthlyTrendData[] = [];

  for (let m = 0; m < 12; m++) {
    const monthInvoices = invoices.filter((inv) => {
      if (inv.is_voided) return false;
      const d = new Date(inv.created_at);
      return d.getFullYear() === year && d.getMonth() === m;
    });

    const invoiced = monthInvoices.reduce((sum, i) => sum + Number(i.grand_total || 0), 0);
    const collected = monthInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const dues = monthInvoices.reduce((sum, i) => sum + Number(i.due_amount || 0), 0);
    const collectionRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;

    result.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m].en,
      monthNameBn: MONTH_NAMES[m].bn,
      year,
      invoiced,
      collected,
      dues,
      collectionRate,
    });
  }

  return result;
}

/**
 * Generate CSV data representation of filtered invoices for download.
 */
export function generateFinancialReportCSV(invoices: InvoiceRecord[]): string {
  const headers = [
    "Invoice Number",
    "Date (BST)",
    "Patient Code",
    "Patient Name",
    "Phone",
    "Subtotal (BDT)",
    "Discount (BDT)",
    "Grand Total (BDT)",
    "Paid Amount (BDT)",
    "Due Amount (BDT)",
    "Payment Status",
    "Is Voided",
    "Void Reason",
  ];

  const rows = invoices.map((inv) => {
    const safeStr = (s?: string | null) => `"${(s || "").replace(/"/g, '""')}"`;
    const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleString("en-GB") : "";

    return [
      safeStr(inv.invoice_number),
      safeStr(dateStr),
      safeStr(inv.patient?.patient_code),
      safeStr(inv.patient?.full_name),
      safeStr(inv.patient?.phone),
      inv.subtotal || 0,
      inv.discount_amount || 0,
      inv.grand_total || 0,
      inv.paid_amount || 0,
      inv.due_amount || 0,
      safeStr(inv.status),
      inv.is_voided ? "YES" : "NO",
      safeStr(inv.void_reason),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}
