export interface MedicineBatchRecord {
  id: string;
  organization_id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  purchase_rate: number;
  mrp: number;
  current_stock: number;
  created_at?: string;
}

export interface MedicineRecord {
  id: string;
  organization_id: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  manufacturer: string;
  unit_type: string;
  min_stock_alert: number;
  is_active: boolean;
  generic_id?: string | null;
  generic_name?: string | null;
  created_at?: string;
  total_stock: number;
  batches: MedicineBatchRecord[];
}

export interface StockTransactionRecord {
  id: string;
  organization_id: string;
  batch_id: string;
  transaction_type: "PURCHASE" | "SALE" | "SALE_RETURN" | "SUPPLIER_RETURN" | "DAMAGE" | "EXPIRED" | "ADJUSTMENT";
  quantity_in: number;
  quantity_out: number;
  running_balance: number;
  reference_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  batch?: {
    batch_number: string;
    expiry_date: string;
    mrp: number;
    medicine?: {
      brand_name: string;
      dosage_form: string;
      strength: string;
    };
  };
}

export interface PharmacySaleRecord {
  id: string;
  organization_id: string;
  sale_number: string;
  patient_id?: string | null;
  prescription_id?: string | null;
  invoice_id?: string | null;
  total_amount: number;
  sold_by: string;
  created_at: string;
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
  };
}
