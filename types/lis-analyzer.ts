export type AnalyzerProtocol = "ASTM_1394" | "HL7_V2" | "REST_JSON";
export type AnalyzerStatus = "ONLINE" | "OFFLINE" | "MAINTENANCE" | "BUSY";
export type AnalyzerConnectionType = "TCP_IP" | "SERIAL_RS232" | "HTTP_WEBHOOK";
export type AbnormalitySeverity = "NORMAL" | "HIGH" | "LOW" | "CRITICAL_HIGH" | "CRITICAL_LOW";

export interface LabAnalyzer {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  department: "Hematology" | "Biochemistry" | "Immunology" | "Urinalysis" | "Microbiology";
  protocol: AnalyzerProtocol;
  connection_type: AnalyzerConnectionType;
  ip_address?: string;
  port?: number;
  baud_rate?: number;
  status: AnalyzerStatus;
  is_active: boolean;
  last_heartbeat_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedAnalyteResult {
  analyte_code: string;
  analyte_name?: string;
  observed_value: string;
  numeric_value?: number;
  unit?: string;
  reference_range?: string;
  abnormal_flag: AbnormalitySeverity;
  test_timestamp?: string;
  instrument_comment?: string;
}

export interface ParsedAnalyzerMessage {
  protocol: AnalyzerProtocol;
  message_type: "RESULTS_ORU" | "QUERY_QBP" | "ACK" | "ASTM_RESULT";
  sample_barcode: string;
  patient_identifier?: string;
  instrument_code: string;
  results: ParsedAnalyteResult[];
  checksum_valid: boolean;
  raw_frame_count: number;
}

export interface LabAnalyzerTransmission {
  id: string;
  organization_id: string;
  analyzer_id: string;
  analyzer_code?: string;
  analyzer_name?: string;
  sample_barcode: string;
  order_id?: string;
  order_number?: string;
  raw_message: string;
  protocol: AnalyzerProtocol;
  message_type: string;
  parsed_results: {
    results: ParsedAnalyteResult[];
    sample_barcode: string;
    instrument_code: string;
    patient_identifier?: string;
  };
  status: "RECEIVED" | "PARSED" | "MATCHED" | "APPLIED" | "REJECTED";
  error_message?: string;
  created_at: string;
}

export interface AnalyzerWorklistQuery {
  sample_barcode: string;
  analyzer_code: string;
  query_timestamp: string;
}

export interface AnalyzerWorklistResponse {
  sample_barcode: string;
  order_number: string;
  patient_code: string;
  patient_name: string;
  gender: string;
  age?: number;
  ordered_tests: Array<{
    test_code: string;
    test_name: string;
    analyte_codes: string[];
  }>;
}
