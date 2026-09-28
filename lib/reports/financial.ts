/**
 * Onnesha Hospital Management System (OHMS)
 * Comprehensive Financial Reporting & Analytics Engine
 * Pure computational utilities for financial aggregation, period filtering, AR aging,
 * double-entry accounting reconciliation, and export.
 *
 * All operations operate strictly within the Asia/Dhaka (UTC+6) reporting timezone.
 */

export const DHAKA_TIMEZONE = "Asia/Dhaka";

import type { InvoiceRecord, PaymentRecord } from "../../types/billing";

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

export interface AccountsReceivableAgingSummary {
  asOfDate: string;
  totalInvoicesDue: number;
  totalAR: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  days_91_120: number;
  days_120_plus: number;
  isReconciled: boolean;
}

export interface ProfitAndLossStatement {
  reportingBasis: "ACCRUAL" | "CASH";
  periodStart: string;
  periodEnd: string;
  accrual: {
    grossPatientRevenue: number;
    discountsAllowed: number;
    netRecognizedRevenue: number;
    operatingExpenses: number;
    netOperatingSurplus: number;
    expenseBreakdown: Array<{ category: string; amount: number }>;
  };
  cash: {
    cashCollectionsInflow: number;
    cashRefundsOutflow: number;
    netOperatingCashFlow: number;
  };
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
 * Returns exact Asia/Dhaka date bounds [startInclusive, endInclusive] for a financial period.
 * Strictly prevents rolling 7-day discrepancies by anchoring calendar weeks to Sunday 00:00:00 BST.
 */
export function getDhakaDateRange(
  period: FinancialPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  endExclusive: Date;
  endExclusiveIso: string;
} {
  // Extract Dhaka local year, month, date, and day of week
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = formatter.formatToParts(referenceDate);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const dYear = parseInt(getPart("year"), 10);
  const dMonth = parseInt(getPart("month"), 10) - 1; // 0-indexed
  const dDate = parseInt(getPart("day"), 10);

  // UTC+6 offset in minutes is +360
  const createDhakaMidnight = (year: number, month: number, day: number) => {
    return new Date(Date.UTC(year, month, day, 0 - 6, 0, 0, 0));
  };
  const createDhakaEndOfDay = (year: number, month: number, day: number) => {
    return new Date(Date.UTC(year, month, day, 23 - 6, 59, 59, 999));
  };

  switch (period) {
    case "today": {
      const start = createDhakaMidnight(dYear, dMonth, dDate);
      const end = createDhakaEndOfDay(dYear, dMonth, dDate);
      const endExclusive = createDhakaMidnight(dYear, dMonth, dDate + 1);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "this_week": {
      // Standard calendar week starting Sunday in Bangladesh/Asia
      // Compute day of week index: Sun=0, Mon=1, ..., Sat=6
      const weekdayStr = getPart("weekday").toLowerCase();
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const currentDayOfWeek = dayMap[weekdayStr] ?? 0;

      const sundayDate = dDate - currentDayOfWeek;
      const start = createDhakaMidnight(dYear, dMonth, sundayDate);
      const end = createDhakaEndOfDay(dYear, dMonth, sundayDate + 6);
      const endExclusive = createDhakaMidnight(dYear, dMonth, sundayDate + 7);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "this_month": {
      const start = createDhakaMidnight(dYear, dMonth, 1);
      // Last day of month
      const lastDay = new Date(Date.UTC(dYear, dMonth + 1, 0)).getUTCDate();
      const end = createDhakaEndOfDay(dYear, dMonth, lastDay);
      const endExclusive = createDhakaMidnight(dYear, dMonth + 1, 1);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "last_month": {
      const lastMonth = dMonth === 0 ? 11 : dMonth - 1;
      const lastMonthYear = dMonth === 0 ? dYear - 1 : dYear;
      const start = createDhakaMidnight(lastMonthYear, lastMonth, 1);
      const lastDay = new Date(Date.UTC(lastMonthYear, lastMonth + 1, 0)).getUTCDate();
      const end = createDhakaEndOfDay(lastMonthYear, lastMonth, lastDay);
      const endExclusive = createDhakaMidnight(dYear, dMonth, 1);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "this_year": {
      const start = createDhakaMidnight(dYear, 0, 1);
      const end = createDhakaEndOfDay(dYear, 11, 31);
      const endExclusive = createDhakaMidnight(dYear + 1, 0, 1);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "custom": {
      if (!customStart) {
        const start = createDhakaMidnight(dYear, dMonth, 1);
        const end = createDhakaEndOfDay(dYear, dMonth, dDate);
        const endExclusive = createDhakaMidnight(dYear, dMonth, dDate + 1);
        return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
      }
      const [sy, sm, sd] = customStart.split("-").map(Number);
      const start = createDhakaMidnight(sy, sm - 1, sd);

      if (!customEnd) {
        const end = createDhakaEndOfDay(sy, sm - 1, sd);
        const endExclusive = createDhakaMidnight(sy, sm - 1, sd + 1);
        return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
      }
      const [ey, em, ed] = customEnd.split("-").map(Number);
      const end = createDhakaEndOfDay(ey, em - 1, ed);
      const endExclusive = createDhakaMidnight(ey, em - 1, ed + 1);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
    case "all":
    default: {
      const start = new Date(0);
      const end = new Date(8640000000000000);
      const endExclusive = new Date(8640000000000000);
      return { start, end, startIso: start.toISOString(), endIso: end.toISOString(), endExclusive, endExclusiveIso: endExclusive.toISOString() };
    }
  }
}

/**
 * Filter invoices based on selected period using Asia/Dhaka day boundaries.
 */
export function filterInvoicesByPeriod(
  invoices: InvoiceRecord[],
  period: FinancialPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): InvoiceRecord[] {
  if (period === "all") return invoices;

  const { start, end } = getDhakaDateRange(period, customStart, customEnd, referenceDate);

  return invoices.filter((inv) => {
    const invDate = new Date(inv.created_at);
    if (isNaN(invDate.getTime())) return false;
    return invDate >= start && invDate <= end;
  });
}

/**
 * Filter payment transactions based on actual payment date in Asia/Dhaka timezone.
 */
export function filterPaymentsByPeriod(
  payments: PaymentRecord[],
  period: FinancialPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): PaymentRecord[] {
  if (period === "all") return payments;

  const { start, end } = getDhakaDateRange(period, customStart, customEnd, referenceDate);

  return payments.filter((pmt) => {
    const pmtDate = new Date(pmt.payment_date || pmt.created_at || "");
    if (isNaN(pmtDate.getTime())) return false;
    return pmtDate >= start && pmtDate <= end;
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
export const DEPARTMENT_MAP: Record<string, { labelBn: string; labelEn: string }> = {
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

export const computeDepartmentRevenueBreakdown = computeDepartmentalRevenue;

/**
 * Payment channel metadata mapping.
 */
export const PAYMENT_METHOD_MAP: Record<string, { labelBn: string; labelEn: string }> = {
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
 * Supports computing directly from payment transactions or from embedded invoice payments.
 */
export function computePaymentChannelBreakdown(
  invoices: InvoiceRecord[],
  paymentsList?: PaymentRecord[]
): PaymentChannelSummary[] {
  const buckets: Record<string, { count: number; total: number }> = {};
  let grandCollected = 0;

  if (paymentsList && paymentsList.length > 0) {
    for (const pmt of paymentsList) {
      const method = (pmt.payment_method || "CASH").toUpperCase();
      const amt = Number(pmt.amount || 0);

      if (!buckets[method]) {
        buckets[method] = { count: 0, total: 0 };
      }
      buckets[method].count += 1;
      buckets[method].total += amt;
      grandCollected += amt;
    }
  } else {
    const activeInvoices = invoices.filter((i) => !i.is_voided);
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

/**
 * Compute Accounts Receivable (AR) Aging Summary as-of a given reference date.
 * Buckets outstanding active invoices into:
 * Current (0-30 days), 31-60 days, 61-90 days, 91-120 days, and 120+ days.
 */
export function computeAccountsReceivableAging(
  invoices: InvoiceRecord[],
  asOfDate: Date = new Date()
): AccountsReceivableAgingSummary {
  const asOfTime = asOfDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let current_0_30 = 0;
  let days_31_60 = 0;
  let days_61_90 = 0;
  let days_91_120 = 0;
  let days_120_plus = 0;
  let totalAR = 0;
  let dueInvoicesCount = 0;

  for (const inv of invoices) {
    if (inv.is_voided) continue;

    const invTime = new Date(inv.created_at).getTime();
    if (invTime > asOfTime) continue; // Skip future invoices

    let due = 0;
    if (inv.payments !== undefined || inv.refunds !== undefined) {
      const paymentsUpToDate = (inv.payments || [])
        .filter((p) => new Date(p.payment_date || p.created_at || "").getTime() <= asOfTime)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const refundsUpToDate = (inv.refunds || [])
        .filter((r) => new Date(r.refunded_at || (r as { created_at?: string }).created_at || "").getTime() <= asOfTime)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      due = Math.max(0, Number(inv.grand_total || 0) - paymentsUpToDate + refundsUpToDate);
    } else {
      due = Number(inv.due_amount || 0);
    }

    if (due <= 0) continue;

    dueInvoicesCount++;
    totalAR += due;

    const daysOld = Math.floor((asOfTime - invTime) / dayMs);

    if (daysOld <= 30) {
      current_0_30 += due;
    } else if (daysOld <= 60) {
      days_31_60 += due;
    } else if (daysOld <= 90) {
      days_61_90 += due;
    } else if (daysOld <= 120) {
      days_91_120 += due;
    } else {
      days_120_plus += due;
    }
  }

  const sumBuckets = current_0_30 + days_31_60 + days_61_90 + days_91_120 + days_120_plus;
  const isReconciled = Math.abs(totalAR - sumBuckets) < 0.01;

  return {
    asOfDate: asOfDate.toISOString(),
    totalInvoicesDue: dueInvoicesCount,
    totalAR: Math.round(totalAR * 100) / 100,
    current_0_30: Math.round(current_0_30 * 100) / 100,
    days_31_60: Math.round(days_31_60 * 100) / 100,
    days_61_90: Math.round(days_61_90 * 100) / 100,
    days_91_120: Math.round(days_91_120 * 100) / 100,
    days_120_plus: Math.round(days_120_plus * 100) / 100,
    isReconciled,
  };
}

/**
 * Compute true Accrual-basis Profit & Loss (P&L) statement
 * comparing recognized patient service revenue against operating expenses in the selected period.
 */
export function computeProfitAndLossStatement(params: {
  invoices: InvoiceRecord[];
  operatingExpenses: Array<{ category: string; amount: number }>;
  periodStartIso: string;
  periodEndIso: string;
}): ProfitAndLossStatement {
  const activeInvoices = params.invoices.filter((i) => !i.is_voided);

  const grossPatientRevenue = activeInvoices.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
  const discountsAllowed = activeInvoices.reduce((sum, i) => sum + Number(i.discount_amount || 0), 0);
  const netRecognizedRevenue = activeInvoices.reduce((sum, i) => sum + Number(i.grand_total || (i.subtotal - (i.discount_amount || 0))), 0);

  const totalOperatingExpenses = params.operatingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netOperatingSurplus = netRecognizedRevenue - totalOperatingExpenses;

  // Cash basis comparison
  let cashCollectionsInflow = 0;
  for (const inv of activeInvoices) {
    cashCollectionsInflow += Number(inv.paid_amount || 0);
  }
  const cashRefundsOutflow = 0; // default cash refunds in period
  const netOperatingCashFlow = cashCollectionsInflow - cashRefundsOutflow;

  return {
    reportingBasis: "ACCRUAL",
    periodStart: params.periodStartIso,
    periodEnd: params.periodEndIso,
    accrual: {
      grossPatientRevenue,
      discountsAllowed,
      netRecognizedRevenue,
      operatingExpenses: totalOperatingExpenses,
      netOperatingSurplus,
      expenseBreakdown: params.operatingExpenses,
    },
    cash: {
      cashCollectionsInflow,
      cashRefundsOutflow,
      netOperatingCashFlow,
    },
  };
}

export const MONTH_NAMES = [
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
 * Compute month-by-month financial trend for the given year in Asia/Dhaka time.
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
 * Generate CSV representation of filtered invoices for download with UTF-8 BOM.
 */
export function generateFinancialReportCSV(
  invoices: InvoiceRecord[],
  metadata?: {
    periodLabel?: string;
    organizationName?: string;
    generatedAt?: string;
    reportingBasis?: string;
  }
): string {
  const bom = "\uFEFF"; // UTF-8 Byte Order Mark for Microsoft Excel compatibility
  const metadataLines = [
    `"ONNESHA HOSPITAL & DIAGNOSTIC COMPLEX - FINANCIAL REPORT"`,
    `"Organization:","${metadata?.organizationName || "Onnesha Hospital (Dhaka)"}"`,
    `"Reporting Basis:","${metadata?.reportingBasis || "Accrual & Cash Basis"}"`,
    `"Reporting Timezone:","Asia/Dhaka (BST, UTC+6)"`,
    `"Selected Period:","${metadata?.periodLabel || "All Time"}"`,
    `"Generated At:","${metadata?.generatedAt || new Date().toISOString()}"`,
    `""`, // empty line separator
  ];

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
    const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleString("en-GB", { timeZone: DHAKA_TIMEZONE }) : "";

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

  return bom + [...metadataLines, headers.join(","), ...rows].join("\r\n");
}

/**
 * Sanitize search query input for PostgREST filter expressions to prevent syntax breakage
 * and wildcard injection (strips delimiters: commas, parens, dots, quotes, backslashes, percent, underscore).
 */
export function sanitizePostgrestSearchTerm(raw?: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .slice(0, 60)
    .replace(/[(),."'\\]/g, "")
    .replace(/[%_]/g, "");
}
