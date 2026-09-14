export interface InvoiceItemRecord {
  id?: string;
  invoice_id?: string;
  service_category: "CONSULTATION" | "LAB" | "XRAY" | "USG" | "ECG" | "PHARMACY" | "BED" | "CABIN" | "OT" | "AMBULANCE" | "MISC";
  reference_id?: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  created_at?: string;
}

export interface PaymentRecord {
  id: string;
  organization_id: string;
  invoice_id: string;
  receipt_number: string;
  payment_method: "CASH" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY" | "VISA" | "MASTERCARD" | "BANK_TRANSFER";
  amount: number;
  gateway_transaction_id?: string | null;
  cashier_id: string;
  payment_date: string;
  notes?: string | null;
  created_at?: string;
}

export interface RefundRecord {
  id: string;
  organization_id: string;
  invoice_id: string;
  refund_receipt_number: string;
  amount: number;
  refund_method: string;
  reason: string;
  approved_by: string;
  processed_by: string;
  refunded_at: string;
}

export interface InvoiceRecord {
  id: string;
  organization_id: string;
  invoice_number: string;
  patient_id: string;
  visit_id?: string | null;
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  tax_amount: number;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" | "VOID";
  is_voided: boolean;
  void_reason?: string | null;
  voided_by?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItemRecord[];
  payments: PaymentRecord[];
  refunds?: RefundRecord[];
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
    gender?: string;
  };
}

export interface CashRegisterSummary {
  todayTotalInvoiced: number;
  todayCashCollected: number;
  todayMfsCollected: number;
  todayTotalCollected: number;
  activeInvoiceCount: number;
}
