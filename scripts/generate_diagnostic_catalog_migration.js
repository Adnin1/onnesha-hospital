// scripts/generate_diagnostic_catalog_migration.js
// Generates official catalog migration for 191 diagnostic tests across 16 categories

const fs = require('fs');
const path = require('path');

const categories = [
  {
    code: 'HEMA',
    name: 'Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)',
    description: 'Complete blood count, differentials, coagulation and hematological diagnostics',
    tests: [
      { name: 'CBC (Govt. Rate)', code: 'HEMA_CBC_GOVT', price: 400, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'CBC With ESR', code: 'HEMA_CBC_ESR', price: 500, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'CBC with Blood Film', code: 'HEMA_CBC_PBF', price: 1000, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Platelet Count', code: 'HEMA_PLATELET', price: 300, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'TC DC HB ESR', code: 'HEMA_TCDCHBESR', price: 500, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'Blood Film', code: 'HEMA_BLOOD_FILM', price: 600, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'ESR', code: 'HEMA_ESR', price: 100, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'HB%', code: 'HEMA_HB', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: 'Reticulocyte Count', code: 'HEMA_RETIC', price: 400, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'BT CT', code: 'HEMA_BT_CT', price: 400, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Ctr Eosinophil Count', code: 'HEMA_EOSINOPHIL', price: 300, specimen: 'Blood', turnaround: 2, num: true },
    ]
  },
  {
    code: 'SERO_IMMUNO',
    name: 'Sero-Immunology Tests',
    description: 'Blood typing, compatibility screening and immuno-hematology',
    tests: [
      { name: 'Blood Grouping', code: 'SERO_BLOOD_GRP', price: 150, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Screening & Cross Matching', code: 'SERO_CROSS_MATCH', price: 1700, specimen: 'Blood', turnaround: 3, num: false },
    ]
  },
  {
    code: 'BIOCHEM',
    name: 'Biochemistry (বায়োকেমিস্ট্রি টেস্ট)',
    description: 'Metabolic panels, renal profile, liver enzymes, electrolytes, lipids and diabetic evaluation',
    tests: [
      { name: 'RBS', code: 'BIO_RBS', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: 'FBS', code: 'BIO_FBS', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: 'PPBS', code: 'BIO_PPBS', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: 'OGTT', code: 'BIO_OGTT', price: 600, specimen: 'Blood', turnaround: 3, num: true },
      { name: '2hrs ABF', code: 'BIO_2H_ABF', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: '2hrs lunch', code: 'BIO_2H_LUNCH', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: '2hrs Dinner', code: 'BIO_2H_DINNER', price: 200, specimen: 'Blood', turnaround: 1, num: true },
      { name: '2hrs After 75g glucose', code: 'BIO_2H_75G_GLUC', price: 200, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'HbA1c', code: 'BIO_HBA1C', price: 800, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'S. Creatinine', code: 'BIO_S_CREATININE', price: 400, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Uric Acid', code: 'BIO_URIC_ACID', price: 500, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'eGFR', code: 'BIO_EGFR', price: 1000, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Urea/ BUN', code: 'BIO_UREA_BUN', price: 500, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Cholesterol', code: 'BIO_CHOLESTEROL', price: 400, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Triglycerides', code: 'BIO_TRIGLYCERIDE', price: 400, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'HDL Cholesterol', code: 'BIO_HDL', price: 400, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'LDL Cholesterol', code: 'BIO_LDL', price: 350, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Lipid profile', code: 'BIO_LIPID_PROFILE', price: 1000, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Bilirubin (Total/Direct/Indirect)', code: 'BIO_BILIRUBIN_TDI', price: 800, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'S. Bilirubin', code: 'BIO_S_BILIRUBIN', price: 500, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'SGPT', code: 'BIO_SGPT', price: 600, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'SGOT', code: 'BIO_SGOT', price: 600, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'ALP', code: 'BIO_ALP', price: 600, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'S. Electrolytes', code: 'BIO_S_ELECTROLYTE', price: 1200, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'Serum Amylase', code: 'BIO_S_AMYLASE', price: 1000, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'Serum Lipase', code: 'BIO_S_LIPASE', price: 1200, specimen: 'Blood', turnaround: 3, num: true },
      { name: 'Total Protein', code: 'BIO_TOTAL_PROTEIN', price: 600, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Albumin', code: 'BIO_ALBUMIN', price: 500, specimen: 'Blood', turnaround: 2, num: true },
      { name: 'Serum Calcium', code: 'BIO_S_CALCIUM', price: 500, specimen: 'Blood', turnaround: 2, num: true },
    ]
  },
  {
    code: 'ICT_VIRO',
    name: 'ICT Method Immunology/Virology Tests',
    description: 'Rapid immuno-chromatographic diagnostic testing for viral and infectious pathogens',
    tests: [
      { name: 'HBsAg', code: 'ICT_HBSAG', price: 800, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Anti-HCV', code: 'ICT_ANTI_HCV', price: 1200, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Anti-HIV (1&2)', code: 'ICT_ANTI_HIV', price: 1200, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'TPHA/Syphilis', code: 'ICT_TPHA_SYPHILIS', price: 600, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Dengue Ns1', code: 'ICT_DENGUE_NS1', price: 500, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Dengue (IgM, IgG)', code: 'ICT_DENGUE_AB', price: 1000, specimen: 'Blood', turnaround: 1, num: false },
      { name: 'Pregnancy Test', code: 'ICT_PREGNANCY', price: 250, specimen: 'Urine', turnaround: 1, num: false },
    ]
  },
  {
    code: 'SEROLOGY',
    name: 'Serology Tests',
    description: 'Rheumatoid factor and autoimmune serological assays',
    tests: [
      { name: 'RA Test', code: 'SERO_RA_TEST', price: 500, specimen: 'Blood', turnaround: 2, num: false },
    ]
  },
  {
    code: 'IMMUNOLOGY',
    name: 'Immunological Tests',
    description: 'Thyroid profile, immunoglobulins, ferritin, and essential vitamin markers',
    tests: [
      { name: 'TSH', code: 'IMM_TSH', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'T3', code: 'IMM_T3', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'T4', code: 'IMM_T4', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'FT3', code: 'IMM_FT3', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'FT4', code: 'IMM_FT4', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'IgE', code: 'IMM_IGE', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'HbA1c (Immunology)', code: 'IMM_HBA1C', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Ferritin', code: 'IMM_FERRITIN', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Vitamin-D', code: 'IMM_VITAMIN_D', price: 4000, specimen: 'Blood', turnaround: 6, num: true },
      { name: 'Vitamin-B12', code: 'IMM_VITAMIN_B12', price: 3000, specimen: 'Blood', turnaround: 6, num: true },
    ]
  },
  {
    code: 'REPRO_ENDO',
    name: 'Reproductive Endocrinology',
    description: 'Hormonal profiles for fertility, endocrine and reproductive health evaluation',
    tests: [
      { name: 'Prolactin', code: 'ENDO_PROLACTIN', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'LH', code: 'ENDO_LH', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'BHCG', code: 'ENDO_BHCG', price: 1500, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Progesterone', code: 'ENDO_PROGESTERONE', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Estradiol', code: 'ENDO_ESTRADIOL', price: 1200, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'Testosterone', code: 'ENDO_TESTOSTERONE', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
    ]
  },
  {
    code: 'ONCOLOGY',
    name: 'Oncology (ক্যান্সার সংক্রান্ত টেস্ট)',
    description: 'Tumor markers and cancer screening biomarkers',
    tests: [
      { name: 'CA 125', code: 'ONCO_CA_125', price: 1500, specimen: 'Blood', turnaround: 6, num: true },
      { name: 'CA 19.9', code: 'ONCO_CA_19_9', price: 1500, specimen: 'Blood', turnaround: 6, num: true },
      { name: 'CA 15.3', code: 'ONCO_CA_15_3', price: 1500, specimen: 'Blood', turnaround: 6, num: true },
      { name: 'AFP', code: 'ONCO_AFP', price: 1000, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'PSA', code: 'ONCO_PSA', price: 1400, specimen: 'Blood', turnaround: 4, num: true },
      { name: 'CEA', code: 'ONCO_CEA', price: 1100, specimen: 'Blood', turnaround: 4, num: true },
    ]
  },
  {
    code: 'CLIN_PATH',
    name: 'Clinical Pathology',
    description: 'Urine, stool, semen and scraping microscopic and physical examination',
    tests: [
      { name: 'Urine R/M/E', code: 'PATH_URINE_RME', price: 350, specimen: 'Urine', turnaround: 2, num: false },
      { name: 'Urine for Protein', code: 'PATH_URINE_PROTEIN', price: 150, specimen: 'Urine', turnaround: 1, num: false },
      { name: 'Urine for Sugar', code: 'PATH_URINE_SUGAR', price: 150, specimen: 'Urine', turnaround: 1, num: false },
      { name: 'Stool R/M/E', code: 'PATH_STOOL_RME', price: 200, specimen: 'Stool', turnaround: 2, num: false },
      { name: 'Semen Analysis', code: 'PATH_SEMEN_ANALYSIS', price: 1200, specimen: 'Semen', turnaround: 3, num: false },
      { name: 'Skin Scraping for Fungus', code: 'PATH_SKIN_SCRAPING', price: 400, specimen: 'Skin', turnaround: 3, num: false },
    ]
  },
  {
    code: 'MICROBIO',
    name: 'Microbiological Tests',
    description: 'Bacterial cultures, sensitivity testing, stain microscopy and AFB diagnostics',
    tests: [
      { name: 'Blood for C/S', code: 'MIC_BLOOD_CS', price: 2000, specimen: 'Blood', turnaround: 72, num: false },
      { name: 'Urine for C/S', code: 'MIC_URINE_CS', price: 1000, specimen: 'Urine', turnaround: 72, num: false },
      { name: 'Sputum for C/S', code: 'MIC_SPUTUM_CS', price: 1000, specimen: 'Sputum', turnaround: 72, num: false },
      { name: 'Sputum for AFB', code: 'MIC_SPUTUM_AFB', price: 500, specimen: 'Sputum', turnaround: 24, num: false },
      { name: 'Sputum for Gram Stain', code: 'MIC_SPUTUM_GRAM', price: 500, specimen: 'Sputum', turnaround: 4, num: false },
    ]
  },
  {
    code: 'MICRO_OTHER',
    name: 'Microbiological Tests (Widal/Other)',
    description: 'Serological parasite & pathogen antibody titers',
    tests: [
      { name: 'Iron Toxo-IgG', code: 'MIC_TOXO_IGG', price: 1200, specimen: 'Blood', turnaround: 24, num: true },
      { name: 'Iron Toxo-IgM', code: 'MIC_TOXO_IGM', price: 1000, specimen: 'Blood', turnaround: 24, num: true },
    ]
  },
  {
    code: 'USG',
    name: 'USG (আল্ট্রাসনোগ্রাফি)',
    description: 'High-resolution abdominal, obstetric, pelvic and soft-tissue ultrasound scans',
    tests: [
      { name: 'USG TVS', code: 'USG_TVS', price: 1800, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG OF LOWER ABDOMEN', code: 'USG_LOWER_ABDOMEN', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG Both Breast', code: 'USG_BOTH_BREAST', price: 2500, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG Single Breast', code: 'USG_SINGLE_BREAST', price: 1600, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG of Pregnancy Profile 4D', code: 'USG_PREG_4D', price: 2000, specimen: 'None', turnaround: 3, num: false },
      { name: 'USG of Pregnancy Profile (PP)', code: 'USG_PREG_PROFILE', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG KUB with Prostate & Residual Volume', code: 'USG_KUB_PROST_PVR', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG KUB & Pelvis Organ', code: 'USG_KUB_PELVIS', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG KUB/Gmito-Urinary', code: 'USG_KUB_GENITOURIN', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG Upper Abdomen', code: 'USG_UPPER_ABDOMEN', price: 1200, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG Whole Abdomen', code: 'USG_WHOLE_ABDOMEN', price: 1400, specimen: 'None', turnaround: 2, num: false },
      { name: 'USG W/A, MCC, PVR, PROST', code: 'USG_WA_MCC_PVR_PR', price: 1800, specimen: 'None', turnaround: 2, num: false },
    ]
  },
  {
    code: 'XRAY',
    name: 'X-RAY (ডিজিটাল এক্স-রে)',
    description: 'Digital high-definition skeletal, chest, contrast and fluoroscopy examinations',
    tests: [
      { name: 'X-ray RT WRIST B/V', code: 'XRAY_RT_WRIST_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray LT WRIST B/V', code: 'XRAY_LT_WRIST_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Rt Foot B/V', code: 'XRAY_RT_FOOT_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Lt Humerus B/V', code: 'XRAY_LT_HUMERUS_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Si Joints A/P view', code: 'XRAY_SI_JOINTS_AP', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Rt Shoulder Joints B/V', code: 'XRAY_RT_SHOULDER_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of TIBIA & FIBULA B/V', code: 'XRAY_TIBIA_FIBULA_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Mastoid Townes', code: 'XRAY_MASTOID_TOWNE', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-RAY OF CERVICAL SPINE BOTH VIEW', code: 'XRAY_CERVICAL_SP_BOTH', price: 1500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Pelvis BV', code: 'XRAY_PELVIS_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Pelvis AP View', code: 'XRAY_PELVIS_AP', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Left Knee Joint B/V', code: 'XRAY_LT_KNEE_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Neck', code: 'XRAY_NECK', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Abdomen B/V', code: 'XRAY_ABDOMEN_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray of Cervical Spine B/V', code: 'XRAY_CERVICAL_SP_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray C. SPINE B/V', code: 'XRAY_C_SPINE_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-RAY HAND B/V', code: 'XRAY_HAND_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Nasopharynx Lateral View', code: 'XRAY_NASOPHARYNX_LAT', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray L/S Spine AP Lat B/V/OBLIQUE', code: 'XRAY_LS_SPINE_OBL', price: 2000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Dorsal Spine LAT/Both', code: 'XRAY_DORSAL_SPINE_LAT', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray D/L Spine LAT/Both Oblique', code: 'XRAY_DL_SPINE_OBL', price: 2000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Pelvis AP/B/V', code: 'XRAY_PELVIS_AP_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Lt Foot B/V', code: 'XRAY_LT_FOOT_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Knee with Thigh / femure', code: 'XRAY_KNEE_THIGH_FEM', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Knee Joint B/V', code: 'XRAY_KNEE_JOINT_BV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Femur (Both/Right/Left) H/P/Knee', code: 'XRAY_FEMUR_HP_KNEE', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Calcaneum B/V R/L', code: 'XRAY_CALCANEUM_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Ankle Joint (Both/Right/Left) B/V', code: 'XRAY_ANKLE_JOINT_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Lt Shoulder Joints B/V', code: 'XRAY_LT_SHOULDER_BV', price: 600, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Arm B/V', code: 'XRAY_ARM_BV', price: 800, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Skull B/V, L/V, T/V', code: 'XRAY_SKULL_BV_LV_TV', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray PNS OM View', code: 'XRAY_PNS_OM_VIEW', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Chest Oblique Lower', code: 'XRAY_CHEST_OBLIQUE', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Chest Lt L/V Rt L/V', code: 'XRAY_CHEST_LT_RT_LV', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Chest Decubitus View (Lt, Rt)', code: 'XRAY_CHEST_DECUBITUS', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Chest B/V View', code: 'XRAY_CHEST_BV_VIEW', price: 1000, specimen: 'None', turnaround: 1, num: false },
      { name: 'X-ray Chest P/A View', code: 'XRAY_CHEST_PA_VIEW', price: 500, specimen: 'None', turnaround: 1, num: false },
      { name: 'Contrast X-ray Full/Lumbar Myelogram', code: 'XRAY_CONTRAST_MYELO', price: 1500, specimen: 'None', turnaround: 3, num: false },
      { name: 'Contrast X-ray IVU/MCU', code: 'XRAY_CONTRAST_IVU_MCU', price: 2500, specimen: 'None', turnaround: 4, num: false },
      { name: 'Contrast X-ray IVU With Post Mict Film', code: 'XRAY_IVU_POST_MICT', price: 2200, specimen: 'None', turnaround: 4, num: false },
      { name: 'RGU X-Ray', code: 'XRAY_RGU', price: 1800, specimen: 'None', turnaround: 3, num: false },
      { name: 'MCU X-Ray', code: 'XRAY_MCU', price: 1800, specimen: 'None', turnaround: 3, num: false },
    ]
  },
  {
    code: 'CT_SCAN',
    name: 'CT Scan',
    description: 'Multi-slice computed tomography scans with and without IV contrast enhancement',
    tests: [
      { name: 'CT Scan of CT Angiogram Brain', code: 'CT_ANGIOGRAM_BRAIN', price: 12500, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of CT Guided FNAC', code: 'CT_GUIDED_FNAC', price: 5500, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Joint/Bones', code: 'CT_JOINT_BONES', price: 6000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of Myelo- CT of L/S Spine', code: 'CT_MYELO_LS_SPINE', price: 5000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Myelo- CT of Dorsal Spine', code: 'CT_MYELO_DORSAL_SP', price: 5000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Myelo- CT of Cervical Spine', code: 'CT_MYELO_CERVICAL_SP', price: 5000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Lower Abdomen Pelvis Organ', code: 'CT_LOWER_ABD_PELVIS', price: 5000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of KUB Region', code: 'CT_KUB_REGION', price: 10000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Whole Abdomen', code: 'CT_WHOLE_ABDOMEN', price: 10000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of HRCT of HBs/Upper Abdomen', code: 'CT_HRCT_HBS_UPPER', price: 5000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Chest- Mediastium', code: 'CT_CHEST_MEDIASTIUM', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'CT Scan of Neck', code: 'CT_NECK', price: 5000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of Nasopharynx', code: 'CT_NASOPHARYNX', price: 5000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of PNS', code: 'CT_PNS', price: 5000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of Orbits', code: 'CT_ORBITS', price: 5000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of Pituitary Region', code: 'CT_PITUITARY', price: 5000, specimen: 'None', turnaround: 3, num: false },
      { name: 'CT Scan of Brain Head/Brain & Skull', code: 'CT_BRAIN_HEAD_SKULL', price: 3500, specimen: 'None', turnaround: 2, num: false },
      { name: 'CT Scan of Nasopharynx (Axial/Coronal)', code: 'CT_NASOPHARYNX_AX', price: 5000, specimen: 'None', turnaround: 3, num: false },
    ]
  },
  {
    code: 'MRI',
    name: 'MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)',
    description: 'High-field magnetic resonance imaging of neuro, musculoskeletal and body systems',
    tests: [
      { name: 'MRI of Whole Spine (TIM)', code: 'MRI_WHOLE_SPINE_TIM', price: 16000, specimen: 'None', turnaround: 6, num: false },
      { name: 'MRI of Whole Body (TM)', code: 'MRI_WHOLE_BODY_TM', price: 30000, specimen: 'None', turnaround: 12, num: false },
      { name: 'MRI of MRCP', code: 'MRI_MRCP', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Breast R/L', code: 'MRI_BREAST_RL', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of MRA Brain/Carotic/Other', code: 'MRI_MRA_BRAIN_CAROTIC', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Ankle Joint R/L', code: 'MRI_ANKLE_JOINT_RL', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Knee Joint R/L', code: 'MRI_KNEE_JOINT_RL', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Hip/ TM Joint', code: 'MRI_HIP_TM_JOINT', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Shoulder Joint R/L', code: 'MRI_SHOULDER_JOINT_RL', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Elbow Joint R/L', code: 'MRI_ELBOW_JOINT_RL', price: 7000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of KUB Region', code: 'MRI_KUB_REGION', price: 12000, specimen: 'None', turnaround: 6, num: false },
      { name: 'MRI of Cervico-Thoracic Spine', code: 'MRI_CERVICO_THORACIC', price: 10000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Lumbo Sacral Spine', code: 'MRI_LUMBO_SACRAL_SP', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Dorsal Spine', code: 'MRI_DORSAL_SPINE', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Cervical Spine', code: 'MRI_CERVICAL_SPINE', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Whole Abdomen', code: 'MRI_WHOLE_ABDOMEN', price: 12000, specimen: 'None', turnaround: 6, num: false },
      { name: 'MRI of Pelvis', code: 'MRI_PELVIS', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Lower Abdomen', code: 'MRI_LOWER_ABDOMEN', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Upper Abdomen', code: 'MRI_UPPER_ABDOMEN', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Chest', code: 'MRI_CHEST', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Neck', code: 'MRI_NECK', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Orbits/PNS/Nasopharynx', code: 'MRI_ORBITS_PNS_NASO', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Mastoid/Ear', code: 'MRI_MASTOID_EAR', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Pituitary Region', code: 'MRI_PITUITARY', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Brain/Head/Skull', code: 'MRI_BRAIN_HEAD_SKULL', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'MRI of Orbits/PNS/Nasopharynx (Contrast)', code: 'MRI_ORBITS_PNS_NASO_C', price: 6000, specimen: 'None', turnaround: 4, num: false },
    ]
  },
  {
    code: 'SPECIAL_DIAG',
    name: 'অন্যান্য বিশেষ টেস্ট (Special Diagnostic)',
    description: 'Endoscopy, colonoscopy, echocardiography, duplex color flow and cardiovascular diagnostics',
    tests: [
      { name: 'Duplex Study Upper/Lower Limb', code: 'SPEC_DUPLEX_STUDY_1L', price: 4500, specimen: 'None', turnaround: 2, num: false },
      { name: 'Duplex Study Both', code: 'SPEC_DUPLEX_STUDY_BOTH', price: 8000, specimen: 'None', turnaround: 2, num: false },
      { name: 'Echo Color Doppler', code: 'SPEC_ECHO_COLOR_DOPPLER', price: 3200, specimen: 'None', turnaround: 2, num: false },
      { name: 'Echo Cardiogram', code: 'SPEC_ECHOCARDIOGRAM', price: 2200, specimen: 'None', turnaround: 2, num: false },
      { name: 'Endoscopy', code: 'SPEC_ENDOSCOPY', price: 2000, specimen: 'None', turnaround: 3, num: false },
      { name: 'Colonoscopy (Short)', code: 'SPEC_COLONOSCOPY_SHORT', price: 4500, specimen: 'None', turnaround: 4, num: false },
      { name: 'Colonoscopy (Full)', code: 'SPEC_COLONOSCOPY_FULL', price: 6000, specimen: 'None', turnaround: 4, num: false },
      { name: 'ECG', code: 'SPEC_ECG', price: 400, specimen: 'None', turnaround: 1, num: false },
    ]
  }
];

// Validation: Count tests, verify unique codes, check length <= 30
let totalTests = 0;
const codeSet = new Set();
for (const cat of categories) {
  for (const t of cat.tests) {
    totalTests++;
    if (t.code.length > 30) {
      console.error(`ERROR: Test code too long: ${t.code} (${t.code.length} chars)`);
      process.exit(1);
    }
    if (codeSet.has(t.code)) {
      console.error(`ERROR: Duplicate test code: ${t.code}`);
      process.exit(1);
    }
    codeSet.add(t.code);
  }
}
console.log(`Validated ${categories.length} categories and ${totalTests} tests. All unique and <= 30 chars.`);

// Build SQL Migration content
let sql = `-- =====================================================================================
-- Migration: 20261011043000_seed_official_diagnostic_catalog_and_tariffs.sql
-- Description:
--   Complete official overhaul of hospital diagnostic test catalog and tariffs.
--   Seeds all 16 official diagnostic categories and 191 diagnostic tests/procedures
--   with 100% exact tariffs from official Bangladesh hospital rate charts.
--   Ensures test_code uniqueness per organization, updates legacy prices, and
--   maintains full referential integrity.
-- =====================================================================================

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_cat_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP

`;

// Append category inserts and test inserts per category
for (const cat of categories) {
  const catNameEscaped = cat.name.replace(/'/g, "''");
  const catDescEscaped = cat.description.replace(/'/g, "''");

  sql += `        -- Category: ${cat.code} (${catNameEscaped})\n`;
  sql += `        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)\n`;
  sql += `        VALUES (r.id, '${catNameEscaped}', '${cat.code}', '${catDescEscaped}')\n`;
  sql += `        ON CONFLICT (organization_id, category_code) DO UPDATE\n`;
  sql += `        SET category_name = EXCLUDED.category_name,\n`;
  sql += `            description = EXCLUDED.description\n`;
  sql += `        RETURNING id INTO v_cat_id;\n\n`;

  for (const t of cat.tests) {
    const testNameEscaped = t.name.replace(/'/g, "''");
    sql += `        -- Test: ${t.code} - ${testNameEscaped} (${t.price} TK)\n`;
    sql += `        INSERT INTO public.diagnostic_tests (\n`;
    sql += `            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active\n`;
    sql += `        ) VALUES (\n`;
    sql += `            r.id, v_cat_id, '${t.code}', '${testNameEscaped}', '${t.specimen}', ${t.price.toFixed(2)}, ${t.turnaround}, ${t.num ? 'TRUE' : 'FALSE'}, TRUE\n`;
    sql += `        )\n`;
    sql += `        ON CONFLICT (organization_id, test_code) DO UPDATE\n`;
    sql += `        SET category_id = EXCLUDED.category_id,\n`;
    sql += `            test_name = EXCLUDED.test_name,\n`;
    sql += `            specimen_type = EXCLUDED.specimen_type,\n`;
    sql += `            price = EXCLUDED.price,\n`;
    sql += `            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,\n`;
    sql += `            has_numerical_parameters = EXCLUDED.has_numerical_parameters,\n`;
    sql += `            is_active = TRUE;\n\n`;
  }
}

sql += `    END LOOP;
END $$;

COMMIT;
`;

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261011043000_seed_official_diagnostic_catalog_and_tariffs.sql');
fs.writeFileSync(migrationPath, sql, 'utf8');
console.log(`Successfully generated migration: ${migrationPath}`);
