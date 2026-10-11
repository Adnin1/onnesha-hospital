// =====================================================================================
// Rate Chart Data: Authoritative Official Tariffs for ANNESHA HOSPITAL AND DIAGNOSTIC
// Contains all 191 diagnostic tests across 16 categories with exact prices.
// =====================================================================================

export interface OfficialCategory {
  id: string;
  category_name: string;
  category_code: string;
  description: string;
}

export interface OfficialTest {
  id: string;
  test_code: string;
  test_name: string;
  specimen_type: string;
  price: number;
  delivery_turnaround_hours: number;
  has_numerical_parameters: boolean;
  category_code: string;
  category_name: string;
}

export const OFFICIAL_DIAGNOSTIC_CATEGORIES: OfficialCategory[] = [
  {
    "id": "cat-off-001",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)",
    "category_code": "HEMA",
    "description": "Blood diagnostics"
  },
  {
    "id": "cat-off-002",
    "category_name": "Sero-Immunology Tests",
    "category_code": "SERO_IMMUNO",
    "description": "Blood grouping & cross matching"
  },
  {
    "id": "cat-off-003",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)",
    "category_code": "BIOCHEM",
    "description": "Clinical biochemistry"
  },
  {
    "id": "cat-off-004",
    "category_name": "ICT Method Immunology/Virology Tests",
    "category_code": "ICT_VIRO",
    "description": "Rapid viral markers"
  },
  {
    "id": "cat-off-005",
    "category_name": "Serology Tests",
    "category_code": "SEROLOGY",
    "description": "Serological investigations"
  },
  {
    "id": "cat-off-006",
    "category_name": "Immunological Tests",
    "category_code": "IMMUNOLOGY",
    "description": "Hormonal and immunology markers"
  },
  {
    "id": "cat-off-007",
    "category_name": "Reproductive Endocrinology",
    "category_code": "REPRO_ENDO",
    "description": "Reproductive hormones"
  },
  {
    "id": "cat-off-008",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)",
    "category_code": "ONCOLOGY",
    "description": "Cancer tumor markers"
  },
  {
    "id": "cat-off-009",
    "category_name": "Clinical Pathology",
    "category_code": "CLIN_PATH",
    "description": "Pathology investigations"
  },
  {
    "id": "cat-off-010",
    "category_name": "Microbiological Tests",
    "category_code": "MICROBIO",
    "description": "Culture and sensitivity"
  },
  {
    "id": "cat-off-011",
    "category_name": "Microbiological Tests (Widal/Other)",
    "category_code": "MICRO_OTHER",
    "description": "Other microbiological markers"
  },
  {
    "id": "cat-off-012",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)",
    "category_code": "USG",
    "description": "Ultrasound diagnostics"
  },
  {
    "id": "cat-off-013",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)",
    "category_code": "XRAY",
    "description": "Digital X-ray imaging"
  },
  {
    "id": "cat-off-014",
    "category_name": "CT Scan",
    "category_code": "CT_SCAN",
    "description": "Computed tomography imaging"
  },
  {
    "id": "cat-off-015",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)",
    "category_code": "MRI",
    "description": "Magnetic resonance imaging"
  },
  {
    "id": "cat-off-016",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)",
    "category_code": "SPECIAL_DIAG",
    "description": "Endoscopy, Echo, Duplex, ECG"
  }
];

export const OFFICIAL_DIAGNOSTIC_TESTS: OfficialTest[] = [
  {
    "id": "test-off-001",
    "test_code": "HEMA_CBC_GOVT",
    "test_name": "CBC (Govt. Rate)",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-002",
    "test_code": "HEMA_CBC_ESR",
    "test_name": "CBC With ESR",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-003",
    "test_code": "HEMA_CBC_PBF",
    "test_name": "CBC with Blood Film",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-004",
    "test_code": "HEMA_PLATELET",
    "test_name": "Platelet Count",
    "specimen_type": "Blood",
    "price": 300,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-005",
    "test_code": "HEMA_TCDCHBESR",
    "test_name": "TC DC HB ESR",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-006",
    "test_code": "HEMA_BLOOD_FILM",
    "test_name": "Blood Film",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-007",
    "test_code": "HEMA_ESR",
    "test_name": "ESR",
    "specimen_type": "Blood",
    "price": 100,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-008",
    "test_code": "HEMA_HB",
    "test_name": "HB%",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-009",
    "test_code": "HEMA_RETIC",
    "test_name": "Reticulocyte Count",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-010",
    "test_code": "HEMA_BT_CT",
    "test_name": "BT CT",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-011",
    "test_code": "HEMA_EOSINOPHIL",
    "test_name": "Ctr Eosinophil Count",
    "specimen_type": "Blood",
    "price": 300,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "HEMA",
    "category_name": "Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-012",
    "test_code": "SERO_BLOOD_GROUP",
    "test_name": "Blood Grouping",
    "specimen_type": "Blood",
    "price": 150,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "SERO_IMMUNO",
    "category_name": "Sero-Immunology Tests"
  },
  {
    "id": "test-off-013",
    "test_code": "SERO_CROSS_MATCHING",
    "test_name": "Screening & Cross Matching",
    "specimen_type": "Blood",
    "price": 1700,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SERO_IMMUNO",
    "category_name": "Sero-Immunology Tests"
  },
  {
    "id": "test-off-014",
    "test_code": "BIO_RBS",
    "test_name": "RBS",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-015",
    "test_code": "BIO_FBS",
    "test_name": "FBS",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-016",
    "test_code": "BIO_PPBS",
    "test_name": "PPBS",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-017",
    "test_code": "BIO_OGTT",
    "test_name": "OGTT",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-018",
    "test_code": "BIO_2HABF",
    "test_name": "2hrs ABF",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-019",
    "test_code": "BIO_2HLUNCH",
    "test_name": "2hrs lunch",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-020",
    "test_code": "BIO_2HDINNER",
    "test_name": "2hrs Dinner",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-021",
    "test_code": "BIO_2HGLUCOSE",
    "test_name": "2hrs After 75g glucose",
    "specimen_type": "Blood",
    "price": 200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-022",
    "test_code": "BIO_HBA1C",
    "test_name": "HbA1c",
    "specimen_type": "Blood",
    "price": 800,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-023",
    "test_code": "BIO_CREATININE",
    "test_name": "S. Creatinine",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-024",
    "test_code": "BIO_URIC_ACID",
    "test_name": "Uric Acid",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-025",
    "test_code": "BIO_EGFR",
    "test_name": "eGFR",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-026",
    "test_code": "BIO_UREA_BUN",
    "test_name": "Urea/ BUN",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-027",
    "test_code": "BIO_CHOLESTEROL",
    "test_name": "Cholesterol",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-028",
    "test_code": "BIO_TRIGLYCERIDES",
    "test_name": "Triglycerides",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-029",
    "test_code": "BIO_HDL",
    "test_name": "HDL Cholesterol",
    "specimen_type": "Blood",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-030",
    "test_code": "BIO_LDL",
    "test_name": "LDL Cholesterol",
    "specimen_type": "Blood",
    "price": 350,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-031",
    "test_code": "BIO_LIPID_PROFILE",
    "test_name": "Lipid profile",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-032",
    "test_code": "BIO_BILIRUBIN_TOTAL_DIR",
    "test_name": "Bilirubin (Total/Direct/Indirect)",
    "specimen_type": "Blood",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-033",
    "test_code": "BIO_S_BILIRUBIN",
    "test_name": "S. Bilirubin",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-034",
    "test_code": "BIO_SGPT",
    "test_name": "SGPT",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-035",
    "test_code": "BIO_SGOT",
    "test_name": "SGOT",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-036",
    "test_code": "BIO_ALP",
    "test_name": "ALP",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-037",
    "test_code": "BIO_ELECTROLYTES",
    "test_name": "S. Electrolytes",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-038",
    "test_code": "BIO_AMYLASE",
    "test_name": "Serum Amylase",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-039",
    "test_code": "BIO_LIPASE",
    "test_name": "Serum Lipase",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-040",
    "test_code": "BIO_TOTAL_PROTEIN",
    "test_name": "Total Protein",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-041",
    "test_code": "BIO_ALBUMIN",
    "test_name": "Albumin",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-042",
    "test_code": "BIO_CALCIUM",
    "test_name": "Serum Calcium",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": true,
    "category_code": "BIOCHEM",
    "category_name": "Biochemistry (বায়োকেমিস্ট্রি টেস্ট)"
  },
  {
    "id": "test-off-043",
    "test_code": "ICT_HBSAG",
    "test_name": "HBsAg",
    "specimen_type": "Blood",
    "price": 800,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-044",
    "test_code": "ICT_ANTI_HCV",
    "test_name": "Anti-HCV",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-045",
    "test_code": "ICT_ANTI_HIV",
    "test_name": "Anti-HIV (1&2)",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-046",
    "test_code": "ICT_TPHA_SYPHILIS",
    "test_name": "TPHA/Syphilis",
    "specimen_type": "Blood",
    "price": 600,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-047",
    "test_code": "ICT_DENGUE_NS1",
    "test_name": "Dengue Ns1",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-048",
    "test_code": "ICT_DENGUE_IGM_IGG",
    "test_name": "Dengue (IgM, IgG)",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-049",
    "test_code": "ICT_PREGNANCY_TEST",
    "test_name": "Pregnancy Test",
    "specimen_type": "Urine",
    "price": 250,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-050",
    "test_code": "SERO_RA_TEST",
    "test_name": "RA Test",
    "specimen_type": "Blood",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SEROLOGY",
    "category_name": "Serology Tests"
  },
  {
    "id": "test-off-051",
    "test_code": "IMM_TSH",
    "test_name": "TSH",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-052",
    "test_code": "IMM_T3",
    "test_name": "T3",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-053",
    "test_code": "IMM_T4",
    "test_name": "T4",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-054",
    "test_code": "IMM_FT3",
    "test_name": "FT3",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-055",
    "test_code": "IMM_FT4",
    "test_name": "FT4",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-056",
    "test_code": "IMM_IGE",
    "test_name": "IgE",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-057",
    "test_code": "IMM_HBA1C_CHEMI",
    "test_name": "HbA1c (Chemiluminescence)",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-058",
    "test_code": "IMM_FERRITIN",
    "test_name": "Ferritin",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-059",
    "test_code": "IMM_VITAMIN_D",
    "test_name": "Vitamin-D",
    "specimen_type": "Blood",
    "price": 4000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-060",
    "test_code": "IMM_VITAMIN_B12",
    "test_name": "Vitamin-B12",
    "specimen_type": "Blood",
    "price": 3000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "IMMUNOLOGY",
    "category_name": "Immunological Tests"
  },
  {
    "id": "test-off-061",
    "test_code": "ENDO_PROLACTIN",
    "test_name": "Prolactin",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-062",
    "test_code": "ENDO_LH",
    "test_name": "LH",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-063",
    "test_code": "ENDO_BHCG",
    "test_name": "BHCG",
    "specimen_type": "Blood",
    "price": 1500,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-064",
    "test_code": "ENDO_PROGESTERONE",
    "test_name": "Progesterone",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-065",
    "test_code": "ENDO_ESTRADIOL",
    "test_name": "Estradiol",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-066",
    "test_code": "ENDO_TESTOSTERONE",
    "test_name": "Testosterone",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": true,
    "category_code": "REPRO_ENDO",
    "category_name": "Reproductive Endocrinology"
  },
  {
    "id": "test-off-067",
    "test_code": "ONCO_CA125",
    "test_name": "CA 125",
    "specimen_type": "Blood",
    "price": 1500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-068",
    "test_code": "ONCO_CA199",
    "test_name": "CA 19.9",
    "specimen_type": "Blood",
    "price": 1500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-069",
    "test_code": "ONCO_CA153",
    "test_name": "CA 15.3",
    "specimen_type": "Blood",
    "price": 1500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-070",
    "test_code": "ONCO_AFP",
    "test_name": "AFP",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-071",
    "test_code": "ONCO_PSA",
    "test_name": "PSA",
    "specimen_type": "Blood",
    "price": 1400,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-072",
    "test_code": "ONCO_CEA",
    "test_name": "CEA",
    "specimen_type": "Blood",
    "price": 1100,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": true,
    "category_code": "ONCOLOGY",
    "category_name": "Oncology (ক্যান্সার সংক্রান্ত টেস্ট)"
  },
  {
    "id": "test-off-073",
    "test_code": "CP_URINE_RME",
    "test_name": "Urine R/M/E",
    "specimen_type": "Urine",
    "price": 350,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-074",
    "test_code": "CP_URINE_PROTEIN",
    "test_name": "Urine for Protein",
    "specimen_type": "Urine",
    "price": 150,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-075",
    "test_code": "CP_URINE_SUGAR",
    "test_name": "Urine for Sugar",
    "specimen_type": "Urine",
    "price": 150,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-076",
    "test_code": "CP_STOOL_RME",
    "test_name": "Stool R/M/E",
    "specimen_type": "Stool",
    "price": 200,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-077",
    "test_code": "CP_SEMEN_ANALYSIS",
    "test_name": "Semen Analysis",
    "specimen_type": "Semen",
    "price": 1200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-078",
    "test_code": "CP_SKIN_SCRAPING_FUNGUS",
    "test_name": "Skin Scraping for Fungus",
    "specimen_type": "Skin",
    "price": 400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "CLIN_PATH",
    "category_name": "Clinical Pathology"
  },
  {
    "id": "test-off-079",
    "test_code": "MICRO_BLOOD_CS",
    "test_name": "Blood for C/S",
    "specimen_type": "Blood",
    "price": 2000,
    "delivery_turnaround_hours": 72,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-080",
    "test_code": "MICRO_URINE_CS",
    "test_name": "Urine for C/S",
    "specimen_type": "Urine",
    "price": 1000,
    "delivery_turnaround_hours": 48,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-081",
    "test_code": "MICRO_SPUTUM_CS",
    "test_name": "Sputum for C/S",
    "specimen_type": "Sputum",
    "price": 1000,
    "delivery_turnaround_hours": 48,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-082",
    "test_code": "MICRO_SPUTUM_AFB",
    "test_name": "Sputum for AFB",
    "specimen_type": "Sputum",
    "price": 500,
    "delivery_turnaround_hours": 24,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-083",
    "test_code": "MICRO_SPUTUM_GRAM",
    "test_name": "Sputum for Gram Stain",
    "specimen_type": "Sputum",
    "price": 500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-084",
    "test_code": "MICRO_IRON_TOXO_IGG",
    "test_name": "Iron Toxo-IgG",
    "specimen_type": "Blood",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-085",
    "test_code": "MICRO_IRON_TOXO_IGM",
    "test_name": "Iron Toxo-IgM",
    "specimen_type": "Blood",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "MICROBIO",
    "category_name": "Microbiological Tests"
  },
  {
    "id": "test-off-086",
    "test_code": "USG_TVS",
    "test_name": "USG TVS",
    "specimen_type": "None",
    "price": 1800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-087",
    "test_code": "USG_LOWER_ABDOMEN",
    "test_name": "USG OF LOWER ABDOMEN",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-088",
    "test_code": "USG_BOTH_BREAST",
    "test_name": "USG Both Breast",
    "specimen_type": "None",
    "price": 2500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-089",
    "test_code": "USG_SINGLE_BREAST",
    "test_name": "USG Single Breast",
    "specimen_type": "None",
    "price": 1600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-090",
    "test_code": "USG_PREGNANCY_4D",
    "test_name": "USG of Pregnancy Profile 4D",
    "specimen_type": "None",
    "price": 2000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-091",
    "test_code": "USG_PREGNANCY_PP",
    "test_name": "USG of Pregnancy Profile (PP)",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-092",
    "test_code": "USG_KUB_PROSTATE_RESIDUAL",
    "test_name": "USG KUB with Prostate & Residual Volume",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-093",
    "test_code": "USG_KUB_PELVIS_ORGAN",
    "test_name": "USG KUB & Pelvis Organ",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-094",
    "test_code": "USG_KUB_GENITO_URINARY",
    "test_name": "USG KUB/Gmito-Urinary",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-095",
    "test_code": "USG_UPPER_ABDOMEN",
    "test_name": "USG Upper Abdomen",
    "specimen_type": "None",
    "price": 1200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-096",
    "test_code": "USG_WHOLE_ABDOMEN",
    "test_name": "USG Whole Abdomen",
    "specimen_type": "None",
    "price": 1400,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-097",
    "test_code": "USG_WA_MCC_PVR_PROST",
    "test_name": "USG W/A, MCC, PVR, PROST",
    "specimen_type": "None",
    "price": 1800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "USG",
    "category_name": "USG (আল্ট্রাসনোগ্রাফি)"
  },
  {
    "id": "test-off-098",
    "test_code": "XRAY_RT_WRIST_BV",
    "test_name": "X-ray RT WRIST B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-099",
    "test_code": "XRAY_LT_WRIST_BV",
    "test_name": "X-ray LT WRIST B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-100",
    "test_code": "XRAY_RT_FOOT_BV",
    "test_name": "X-ray Rt Foot B/V",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-101",
    "test_code": "XRAY_LT_HUMERUS_BV",
    "test_name": "X-ray Lt Humerus B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-102",
    "test_code": "XRAY_SI_JOINTS_AP",
    "test_name": "X-ray of Si Joints A/P view",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-103",
    "test_code": "XRAY_RT_SHOULDER_BV",
    "test_name": "X-ray Rt Shoulder Joints B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-104",
    "test_code": "XRAY_TIBIA_FIBULA_BV",
    "test_name": "X-ray of TIBIA & FIBULA B/V",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-105",
    "test_code": "XRAY_MASTOID_TOWNES",
    "test_name": "X-ray Mastoid Townes",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-106",
    "test_code": "XRAY_CERVICAL_SPINE_BOTH",
    "test_name": "X-RAY OF CERVICAL SPINE BOTH VIEW",
    "specimen_type": "None",
    "price": 1500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-107",
    "test_code": "XRAY_PELVIS_BV",
    "test_name": "X-ray of Pelvis BV",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-108",
    "test_code": "XRAY_PELVIS_AP",
    "test_name": "X-ray of Pelvis AP View",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-109",
    "test_code": "XRAY_LT_KNEE_BV",
    "test_name": "X-ray of Left Knee Joint B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-110",
    "test_code": "XRAY_NECK",
    "test_name": "X-ray of Neck",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-111",
    "test_code": "XRAY_ABDOMEN_BV",
    "test_name": "X-ray of Abdomen B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-112",
    "test_code": "XRAY_CERVICAL_SPINE_BV",
    "test_name": "X-ray of Cervical Spine B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-113",
    "test_code": "XRAY_C_SPINE_BV",
    "test_name": "X-ray C. SPINE B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-114",
    "test_code": "XRAY_HAND_BV",
    "test_name": "X-RAY HAND B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-115",
    "test_code": "XRAY_NASOPHARYNX_LATERAL",
    "test_name": "X-ray Nasopharynx Lateral View",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-116",
    "test_code": "XRAY_LS_SPINE_OBLIQUE",
    "test_name": "X-ray L/S Spine AP Lat B/V/OBLIQUE",
    "specimen_type": "None",
    "price": 2000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-117",
    "test_code": "XRAY_DORSAL_SPINE_LAT",
    "test_name": "X-ray Dorsal Spine LAT/Both",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-118",
    "test_code": "XRAY_DL_SPINE_OBLIQUE",
    "test_name": "X-ray D/L Spine LAT/Both Oblique",
    "specimen_type": "None",
    "price": 2000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-119",
    "test_code": "XRAY_PELVIS_AP_BV",
    "test_name": "X-ray Pelvis AP/B/V",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-120",
    "test_code": "XRAY_LT_FOOT_BV",
    "test_name": "X-ray Lt Foot B/V",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-121",
    "test_code": "XRAY_KNEE_THIGH_FEMUR",
    "test_name": "X-ray Knee with Thigh / femure",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-122",
    "test_code": "XRAY_KNEE_JOINT_BV",
    "test_name": "X-ray Knee Joint B/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-123",
    "test_code": "XRAY_FEMUR_HP_KNEE",
    "test_name": "X-ray Femur (Both/Right/Left) H/P/Knee",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-124",
    "test_code": "XRAY_CALCANEUM_BV",
    "test_name": "X-ray Calcaneum B/V R/L",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-125",
    "test_code": "XRAY_ANKLE_JOINT_BV",
    "test_name": "X-ray Ankle Joint (Both/Right/Left) B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-126",
    "test_code": "XRAY_LT_SHOULDER_BV",
    "test_name": "X-ray Lt Shoulder Joints B/V",
    "specimen_type": "None",
    "price": 600,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-127",
    "test_code": "XRAY_ARM_BV",
    "test_name": "X-ray Arm B/V",
    "specimen_type": "None",
    "price": 800,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-128",
    "test_code": "XRAY_SKULL_BV_LV_TV",
    "test_name": "X-ray Skull B/V, L/V, T/V",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-129",
    "test_code": "XRAY_PNS_OM",
    "test_name": "X-ray PNS OM View",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-130",
    "test_code": "XRAY_CHEST_OBLIQUE_LOWER",
    "test_name": "X-ray Chest Oblique Lower",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-131",
    "test_code": "XRAY_CHEST_LT_RT_LV",
    "test_name": "X-ray Chest Lt L/V Rt L/V",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-132",
    "test_code": "XRAY_CHEST_DECUBITUS",
    "test_name": "X-ray Chest Decubitus View (Lt, Rt)",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-133",
    "test_code": "XRAY_CHEST_BV",
    "test_name": "X-ray Chest B/V View",
    "specimen_type": "None",
    "price": 1000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-134",
    "test_code": "XRAY_CHEST_PA",
    "test_name": "X-ray Chest P/A View",
    "specimen_type": "None",
    "price": 500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-135",
    "test_code": "XRAY_CONTRAST_MYELOGRAM",
    "test_name": "Contrast X-ray Full/Lumbar Myelogram",
    "specimen_type": "None",
    "price": 1500,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-136",
    "test_code": "XRAY_CONTRAST_IVU_MCU",
    "test_name": "Contrast X-ray IVU/MCU",
    "specimen_type": "None",
    "price": 2500,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-137",
    "test_code": "XRAY_CONTRAST_IVU_POST_MICT",
    "test_name": "Contrast X-ray IVU With Post Mict Film",
    "specimen_type": "None",
    "price": 2200,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-138",
    "test_code": "XRAY_RGU",
    "test_name": "RGU X-Ray",
    "specimen_type": "None",
    "price": 1800,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-139",
    "test_code": "XRAY_MCU",
    "test_name": "MCU X-Ray",
    "specimen_type": "None",
    "price": 1800,
    "delivery_turnaround_hours": 3,
    "has_numerical_parameters": false,
    "category_code": "XRAY",
    "category_name": "X-RAY (ডিজিটাল এক্স-রে)"
  },
  {
    "id": "test-off-140",
    "test_code": "CT_ANGIOGRAM_BRAIN",
    "test_name": "CT Scan of CT Angiogram Brain",
    "specimen_type": "None",
    "price": 12500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-141",
    "test_code": "CT_GUIDED_FNAC",
    "test_name": "CT Scan of CT Guided FNAC",
    "specimen_type": "None",
    "price": 5500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-142",
    "test_code": "CT_JOINT_BONES",
    "test_name": "CT Scan of Joint/Bones",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-143",
    "test_code": "CT_MYELO_LS_SPINE",
    "test_name": "CT Scan of Myelo- CT of L/S Spine",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-144",
    "test_code": "CT_MYELO_DORSAL_SPINE",
    "test_name": "CT Scan of Myelo- CT of Dorsal Spine",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-145",
    "test_code": "CT_MYELO_CERVICAL_SPINE",
    "test_name": "CT Scan of Myelo- CT of Cervical Spine",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-146",
    "test_code": "CT_LOWER_ABD_PELVIS",
    "test_name": "CT Scan of Lower Abdomen Pelvis Organ",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-147",
    "test_code": "CT_KUB_REGION",
    "test_name": "CT Scan of KUB Region",
    "specimen_type": "None",
    "price": 10000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-148",
    "test_code": "CT_WHOLE_ABDOMEN",
    "test_name": "CT Scan of Whole Abdomen",
    "specimen_type": "None",
    "price": 10000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-149",
    "test_code": "CT_HRCT_HBS_UPPER_ABD",
    "test_name": "CT Scan of HRCT of HBs/Upper Abdomen",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-150",
    "test_code": "CT_CHEST_MEDIASTINUM",
    "test_name": "CT Scan of Chest- Mediastium",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-151",
    "test_code": "CT_NECK",
    "test_name": "CT Scan of Neck",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-152",
    "test_code": "CT_NASOPHARYNX",
    "test_name": "CT Scan of Nasopharynx",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-153",
    "test_code": "CT_PNS",
    "test_name": "CT Scan of PNS",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-154",
    "test_code": "CT_ORBITS",
    "test_name": "CT Scan of Orbits",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-155",
    "test_code": "CT_PITUITARY_REGION",
    "test_name": "CT Scan of Pituitary Region",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-156",
    "test_code": "CT_BRAIN_HEAD_SKULL",
    "test_name": "CT Scan of Brain Head/Brain & Skull",
    "specimen_type": "None",
    "price": 3500,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-157",
    "test_code": "CT_NASOPHARYNX_SPEC",
    "test_name": "CT Scan of Nasopharynx (Special)",
    "specimen_type": "None",
    "price": 5000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "ICT_VIRO",
    "category_name": "ICT Method Immunology/Virology Tests"
  },
  {
    "id": "test-off-158",
    "test_code": "MRI_WHOLE_SPINE_TIM",
    "test_name": "MRI of Whole Spine (TIM)",
    "specimen_type": "None",
    "price": 16000,
    "delivery_turnaround_hours": 6,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-159",
    "test_code": "MRI_WHOLE_BODY_TM",
    "test_name": "MRI of Whole Body (TM)",
    "specimen_type": "None",
    "price": 30000,
    "delivery_turnaround_hours": 6,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-160",
    "test_code": "MRI_MRCP",
    "test_name": "MRI of MRCP",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-161",
    "test_code": "MRI_BREAST_RL",
    "test_name": "MRI of Breast R/L",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-162",
    "test_code": "MRI_MRA_BRAIN_CAROTID",
    "test_name": "MRI of MRA Brain/Carotic/Other",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-163",
    "test_code": "MRI_ANKLE_JOINT_RL",
    "test_name": "MRI of Ankle Joint R/L",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-164",
    "test_code": "MRI_KNEE_JOINT_RL",
    "test_name": "MRI of Knee Joint R/L",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-165",
    "test_code": "MRI_HIP_TM_JOINT",
    "test_name": "MRI of Hip/ TM Joint",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-166",
    "test_code": "MRI_SHOULDER_JOINT_RL",
    "test_name": "MRI of Shoulder Joint R/L",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-167",
    "test_code": "MRI_ELBOW_JOINT_RL",
    "test_name": "MRI of Elbow Joint R/L",
    "specimen_type": "None",
    "price": 7000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-168",
    "test_code": "MRI_KUB_REGION",
    "test_name": "MRI of KUB Region",
    "specimen_type": "None",
    "price": 12000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-169",
    "test_code": "MRI_CERVICO_THORACIC_SPINE",
    "test_name": "MRI of Cervico-Thoracic Spine",
    "specimen_type": "None",
    "price": 10000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-170",
    "test_code": "MRI_LUMBO_SACRAL_SPINE",
    "test_name": "MRI of Lumbo Sacral Spine",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-171",
    "test_code": "MRI_DORSAL_SPINE",
    "test_name": "MRI of Dorsal Spine",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-172",
    "test_code": "MRI_CERVICAL_SPINE",
    "test_name": "MRI of Cervical Spine",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-173",
    "test_code": "MRI_WHOLE_ABDOMEN",
    "test_name": "MRI of Whole Abdomen",
    "specimen_type": "None",
    "price": 12000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-174",
    "test_code": "MRI_PELVIS",
    "test_name": "MRI of Pelvis",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-175",
    "test_code": "MRI_LOWER_ABDOMEN",
    "test_name": "MRI of Lower Abdomen",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-176",
    "test_code": "MRI_UPPER_ABDOMEN",
    "test_name": "MRI of Upper Abdomen",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-177",
    "test_code": "MRI_CHEST",
    "test_name": "MRI of Chest",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-178",
    "test_code": "MRI_NECK",
    "test_name": "MRI of Neck",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-179",
    "test_code": "MRI_ORBITS_PNS_NASOPHARYNX",
    "test_name": "MRI of Orbits/PNS/Nasopharynx",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-180",
    "test_code": "MRI_MASTOID_EAR",
    "test_name": "MRI of Mastoid/Ear",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-181",
    "test_code": "MRI_PITUITARY_REGION",
    "test_name": "MRI of Pituitary Region",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-182",
    "test_code": "MRI_BRAIN_HEAD_SKULL",
    "test_name": "MRI of Brain/Head/Skull",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-183",
    "test_code": "MRI_ORBITS_NASO_CONTRAST",
    "test_name": "MRI of Orbits/PNS/Nasopharynx (Contrast)",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 4,
    "has_numerical_parameters": false,
    "category_code": "MRI",
    "category_name": "MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)"
  },
  {
    "id": "test-off-184",
    "test_code": "SPEC_DUPLEX_UPPER_LOWER_LIMB",
    "test_name": "Duplex Study Upper/Lower Limb",
    "specimen_type": "None",
    "price": 4500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-185",
    "test_code": "SPEC_DUPLEX_STUDY_BOTH",
    "test_name": "Duplex Study Both",
    "specimen_type": "None",
    "price": 8000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-186",
    "test_code": "SPEC_ECHO_COLOR_DOPPLER",
    "test_name": "Echo Color Doppler",
    "specimen_type": "None",
    "price": 3200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-187",
    "test_code": "SPEC_ECHO_CARDIOGRAM",
    "test_name": "Echo Cardiogram",
    "specimen_type": "None",
    "price": 2200,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-188",
    "test_code": "SPEC_ENDOSCOPY",
    "test_name": "Endoscopy",
    "specimen_type": "None",
    "price": 2000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-189",
    "test_code": "SPEC_COLONOSCOPY_SHORT",
    "test_name": "Colonoscopy (Short)",
    "specimen_type": "None",
    "price": 4500,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-190",
    "test_code": "SPEC_COLONOSCOPY_FULL",
    "test_name": "Colonoscopy (Full)",
    "specimen_type": "None",
    "price": 6000,
    "delivery_turnaround_hours": 2,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  },
  {
    "id": "test-off-191",
    "test_code": "SPEC_ECG",
    "test_name": "ECG",
    "specimen_type": "None",
    "price": 400,
    "delivery_turnaround_hours": 1,
    "has_numerical_parameters": false,
    "category_code": "SPECIAL_DIAG",
    "category_name": "অন্যান্য বিশেষ টেস্ট (Special Diagnostic)"
  }
];
