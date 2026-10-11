export type ServiceCategory =
  | "CONSULTATION"
  | "LAB"
  | "XRAY"
  | "USG"
  | "ECG"
  | "CT_SCAN"
  | "MRI"
  | "ENDOSCOPY"
  | "PHARMACY"
  | "BED"
  | "CABIN"
  | "IPD_BED"
  | "CRITICAL_CARE"
  | "OT"
  | "OT_SURGERY"
  | "ADMISSION"
  | "AMBULANCE"
  | "PROCEDURE"
  | "MISC";

export interface HospitalServiceItem {
  id: string;
  category: ServiceCategory;
  name: string;
  price: number;
  group: "CONSULTATION" | "LAB" | "IMAGING" | "BED_CABIN" | "CRITICAL_CARE" | "OT_SURGERY" | "EMERGENCY_NURSING";
  description?: string;
  isDatabaseAuthoritative?: boolean;
}

import { OFFICIAL_DIAGNOSTIC_TESTS } from "../lab/rateChartData.ts";

const BASE_HOSPITAL_SERVICES: HospitalServiceItem[] = [
  // --- 1. CONSULTATIONS ---
  {
    id: "srv-con-opd",
    category: "CONSULTATION",
    name: "General OPD Consultation",
    price: 500,
    group: "CONSULTATION",
    description: "Medical Officer / Resident OPD",
  },
  {
    id: "srv-con-spec",
    category: "CONSULTATION",
    name: "Consultant Specialist OPD",
    price: 800,
    group: "CONSULTATION",
    description: "Assistant / Associate Professor Specialist",
  },
  {
    id: "srv-con-prof",
    category: "CONSULTATION",
    name: "Senior Professor Specialist Consultation",
    price: 1200,
    group: "CONSULTATION",
    description: "Professor / Head of Department Specialist",
  },
  {
    id: "srv-con-emo",
    category: "CONSULTATION",
    name: "Emergency Medical Officer (EMO) Consultation",
    price: 400,
    group: "CONSULTATION",
    description: "Casualty Emergency Desk Intake",
  },
  {
    id: "srv-con-fu",
    category: "CONSULTATION",
    name: "Follow-up Consultation (Within 7 Days)",
    price: 300,
    group: "CONSULTATION",
    description: "Review of investigative reports",
  },
  {
    id: "srv-con-pedia",
    category: "CONSULTATION",
    name: "Pediatric Specialist Consultation",
    price: 800,
    group: "CONSULTATION",
    description: "Child Health and Neonatology Clinic",
  },
  {
    id: "srv-con-gynae",
    category: "CONSULTATION",
    name: "Gynecology & Obstetrics Specialist Consultation",
    price: 800,
    group: "CONSULTATION",
    description: "Antenatal / Gynae OPD Clinic",
  },
  {
    id: "srv-con-cardio",
    category: "CONSULTATION",
    name: "Cardiology Specialist Consultation",
    price: 1000,
    group: "CONSULTATION",
    description: "Cardiovascular specialist OPD",
  },
  {
    id: "srv-con-ortho",
    category: "CONSULTATION",
    name: "Orthopedic Specialist Consultation",
    price: 800,
    group: "CONSULTATION",
    description: "Bone and Joint Clinic",
  },
  {
    id: "srv-con-surg",
    category: "CONSULTATION",
    name: "General & Laparoscopic Surgery Consultation",
    price: 800,
    group: "CONSULTATION",
    description: "Surgical specialist pre-op clinic",
  },

  // --- 2. LAB & PATHOLOGY TESTS ---
  {
    id: "srv-lab-cbc",
    category: "LAB",
    name: "Complete Blood Count (CBC) with ESR",
    price: 400,
    group: "LAB",
    description: "Automated 5-part differential hematology",
  },
  {
    id: "srv-lab-fbs",
    category: "LAB",
    name: "Fasting Blood Sugar (FBS)",
    price: 150,
    group: "LAB",
    description: "Fluoride plasma enzymatic glucose",
  },
  {
    id: "srv-lab-2habf",
    category: "LAB",
    name: "Blood Sugar 2 Hours After Breakfast (2HABF)",
    price: 150,
    group: "LAB",
    description: "Postprandial glycemic evaluation",
  },
  {
    id: "srv-lab-rbs",
    category: "LAB",
    name: "Random Blood Sugar (RBS)",
    price: 150,
    group: "LAB",
    description: "Spot glucose determination",
  },
  {
    id: "srv-lab-hba1c",
    category: "LAB",
    name: "HbA1c Glycated Hemoglobin (HPLC)",
    price: 750,
    group: "LAB",
    description: "3-Month long-term diabetes control index",
  },
  {
    id: "srv-lab-creat",
    category: "LAB",
    name: "Serum Creatinine",
    price: 400,
    group: "LAB",
    description: "Jaffe kinetic renal profile",
  },
  {
    id: "srv-lab-urea",
    category: "LAB",
    name: "Blood Urea Nitrogen (BUN)",
    price: 350,
    group: "LAB",
    description: "Renal excretion marker",
  },
  {
    id: "srv-lab-lipid",
    category: "LAB",
    name: "Lipid Profile (Cholesterol, HDL, LDL, TG)",
    price: 1000,
    group: "LAB",
    description: "Complete cardiovascular lipid panel",
  },
  {
    id: "srv-lab-chol",
    category: "LAB",
    name: "Serum Cholesterol (Total)",
    price: 300,
    group: "LAB",
    description: "Enzymatic CHOD-PAP",
  },
  {
    id: "srv-lab-tg",
    category: "LAB",
    name: "Serum Triglycerides",
    price: 350,
    group: "LAB",
    description: "GPO-PAP enzymatic determination",
  },
  {
    id: "srv-lab-lft",
    category: "LAB",
    name: "Liver Function Test (SGPT, SGOT, Bilirubin, Alk Phos)",
    price: 1100,
    group: "LAB",
    description: "Full hepatic biochemistry panel",
  },
  {
    id: "srv-lab-sgpt",
    category: "LAB",
    name: "SGPT / ALT (Alanine Aminotransferase)",
    price: 300,
    group: "LAB",
    description: "Liver enzyme specific marker",
  },
  {
    id: "srv-lab-sgot",
    category: "LAB",
    name: "SGOT / AST (Aspartate Aminotransferase)",
    price: 300,
    group: "LAB",
    description: "Hepatic & cardiac cellular enzyme",
  },
  {
    id: "srv-lab-bili",
    category: "LAB",
    name: "Serum Bilirubin (Total & Direct)",
    price: 300,
    group: "LAB",
    description: "Jaundice investigation",
  },
  {
    id: "srv-lab-alp",
    category: "LAB",
    name: "Serum Alkaline Phosphatase (ALP)",
    price: 350,
    group: "LAB",
    description: "Biliary and bone isoenzyme marker",
  },
  {
    id: "srv-lab-lytes",
    category: "LAB",
    name: "Serum Electrolytes (Na+, K+, Cl-)",
    price: 800,
    group: "LAB",
    description: "ISE electrolyte analyzer quantitative",
  },
  {
    id: "srv-lab-uric",
    category: "LAB",
    name: "Serum Uric Acid",
    price: 350,
    group: "LAB",
    description: "Gout & hyperuricemia screen",
  },
  {
    id: "srv-lab-calcium",
    category: "LAB",
    name: "Serum Calcium (Total)",
    price: 350,
    group: "LAB",
    description: "Mineral balance and parathyroid screen",
  },
  {
    id: "srv-lab-prot",
    category: "LAB",
    name: "Total Protein & Albumin / Globulin (A/G Ratio)",
    price: 450,
    group: "LAB",
    description: "Nutritional & oncotic evaluation",
  },
  {
    id: "srv-lab-urine",
    category: "LAB",
    name: "Urine Routine Examination (R/M/E)",
    price: 350,
    group: "LAB",
    description: "Urine strip + microscopic sediment analysis",
  },
  {
    id: "srv-lab-ur-cs",
    category: "LAB",
    name: "Urine Culture & Sensitivity (C/S)",
    price: 900,
    group: "LAB",
    description: "Bacterial pathogen growth & antibiotic sensitivity",
  },
  {
    id: "srv-lab-stool",
    category: "LAB",
    name: "Stool Routine Examination (R/M/E)",
    price: 250,
    group: "LAB",
    description: "Occult blood, protozoa, and ova screen",
  },
  {
    id: "srv-lab-bg",
    category: "LAB",
    name: "Blood Grouping & Rh Factor",
    price: 150,
    group: "LAB",
    description: "ABO & Rhesus D antigen forward/reverse typing",
  },
  {
    id: "srv-lab-cross",
    category: "LAB",
    name: "Blood Cross-Matching & Viral Screening",
    price: 1700,
    group: "LAB",
    description: "Major/minor match with HBsAg, HCV, HIV, Syphilis screen",
  },
  {
    id: "srv-lab-dengue-ns1",
    category: "LAB",
    name: "Dengue NS1 Antigen (Rapid)",
    price: 500,
    group: "LAB",
    description: "Early acute phase dengue confirmation (Day 1-5)",
  },
  {
    id: "srv-lab-dengue-ab",
    category: "LAB",
    name: "Dengue Antibody (IgG & IgM)",
    price: 700,
    group: "LAB",
    description: "Secondary or convalescent dengue antibody test",
  },
  {
    id: "srv-lab-widal",
    category: "LAB",
    name: "Widal Test (Typhoid / Paratyphoid)",
    price: 400,
    group: "LAB",
    description: "S. typhi TO & TH agglutination titers",
  },
  {
    id: "srv-lab-tsh",
    category: "LAB",
    name: "Thyroid Stimulating Hormone (TSH)",
    price: 1200,
    group: "LAB",
    description: "Chemiluminescent thyroid hormone assay",
  },
  {
    id: "srv-lab-ft4",
    category: "LAB",
    name: "Free T4 (FT4)",
    price: 1400,
    group: "LAB",
    description: "Unbound thyroxine assay",
  },
  {
    id: "srv-lab-trop",
    category: "LAB",
    name: "Serum Troponin-I (High Sensitivity Quantitative)",
    price: 1200,
    group: "LAB",
    description: "Acute myocardial infarction cardiac marker",
  },
  {
    id: "srv-lab-crp",
    category: "LAB",
    name: "C-Reactive Protein (CRP) Quantitative",
    price: 450,
    group: "LAB",
    description: "Systemic inflammation and sepsis index",
  },
  {
    id: "srv-lab-pt",
    category: "LAB",
    name: "Prothrombin Time (PT) with INR",
    price: 600,
    group: "LAB",
    description: "Coagulation extrinsic pathway & warfarin monitoring",
  },
  {
    id: "srv-lab-aptt",
    category: "LAB",
    name: "Activated Partial Thromboplastin Time (APTT)",
    price: 500,
    group: "LAB",
    description: "Intrinsic coagulation pathway screening",
  },
  {
    id: "srv-lab-hbsag",
    category: "LAB",
    name: "HBsAg (Hepatitis B Surface Antigen)",
    price: 300,
    group: "LAB",
    description: "Immunochromatographic / ELISA hepatitis B test",
  },
  {
    id: "srv-lab-hcv",
    category: "LAB",
    name: "Anti-HCV (Hepatitis C Antibody)",
    price: 400,
    group: "LAB",
    description: "Hepatitis C antibody screening",
  },

  // --- 3. IMAGING & CARDIOLOGY (X-RAY, USG, ECG) ---
  {
    id: "srv-rad-cxr",
    category: "XRAY",
    name: "Digital Chest X-Ray (P/A View)",
    price: 500,
    group: "IMAGING",
    description: "High-resolution digital radiography",
  },
  {
    id: "srv-rad-xray-kub",
    category: "XRAY",
    name: "Digital X-Ray KUB (Kidney, Ureter, Bladder)",
    price: 600,
    group: "IMAGING",
    description: "Abdominal plain film for calculi",
  },
  {
    id: "srv-rad-xray-spine",
    category: "XRAY",
    name: "Digital X-Ray Lumbar Spine (AP & Lateral Views)",
    price: 1000,
    group: "IMAGING",
    description: "Two-view lumbar spine examination",
  },
  {
    id: "srv-rad-xray-cerv",
    category: "XRAY",
    name: "Digital X-Ray Cervical Spine (AP & Lateral Views)",
    price: 1000,
    group: "IMAGING",
    description: "Two-view cervical vertebral examination",
  },
  {
    id: "srv-rad-xray-limb",
    category: "XRAY",
    name: "Digital X-Ray Extremity / Joint (AP & Lateral)",
    price: 800,
    group: "IMAGING",
    description: "Knee, ankle, shoulder, wrist, or elbow views",
  },
  {
    id: "srv-usg-abd",
    category: "USG",
    name: "Ultrasonography (Whole Abdomen)",
    price: 1400,
    group: "IMAGING",
    description: "High-frequency ultrasound of hepatobiliary, renal, pelvic organs",
  },
  {
    id: "srv-usg-upper",
    category: "USG",
    name: "Ultrasonography (Upper Abdomen)",
    price: 1000,
    group: "IMAGING",
    description: "Liver, gallbladder, spleen, pancreas ultrasound",
  },
  {
    id: "srv-usg-preg",
    category: "USG",
    name: "Ultrasonography (Pregnancy Profile / Anomaly)",
    price: 1200,
    group: "IMAGING",
    description: "Fetal growth, biometry, and gestational age scan",
  },
  {
    id: "srv-usg-kub",
    category: "USG",
    name: "Ultrasonography (KUB & Prostate)",
    price: 1200,
    group: "IMAGING",
    description: "Kidneys, urinary bladder, and prostate ultrasound",
  },
  {
    id: "srv-cardio-ecg",
    category: "ECG",
    name: "12-Lead Electrocardiogram (ECG)",
    price: 400,
    group: "IMAGING",
    description: "Multichannel rhythm and ischemia strip",
  },
  {
    id: "srv-cardio-echo",
    category: "ECG",
    name: "2D Echocardiography with Color Doppler",
    price: 3200,
    group: "IMAGING",
    description: "Cardiac chambers, valves, ejection fraction, and wall motion",
  },
  {
    id: "srv-spec-endo",
    category: "MISC",
    name: "Upper GI Endoscopy",
    price: 2000,
    group: "IMAGING",
    description: "Diagnostic upper gastrointestinal endoscopy",
  },
  {
    id: "srv-spec-colono-short",
    category: "MISC",
    name: "Colonoscopy (Short)",
    price: 4500,
    group: "IMAGING",
    description: "Sigmoidoscopy / short colonoscopy",
  },
  {
    id: "srv-spec-colono-full",
    category: "MISC",
    name: "Colonoscopy (Full)",
    price: 6000,
    group: "IMAGING",
    description: "Complete diagnostic colonoscopy",
  },
  {
    id: "srv-rad-ct-brain",
    category: "XRAY",
    name: "CT Scan of Brain (Plain)",
    price: 3500,
    group: "IMAGING",
    description: "Axial computed tomography of brain",
  },
  {
    id: "srv-rad-ct-abd",
    category: "XRAY",
    name: "CT Scan of Whole Abdomen",
    price: 10000,
    group: "IMAGING",
    description: "Multislice CT abdomen with contrast protocol",
  },
  {
    id: "srv-rad-ct-angio",
    category: "XRAY",
    name: "CT Angiogram (Brain/Coronary/Peripheral)",
    price: 12500,
    group: "IMAGING",
    description: "High-resolution vascular CT angiogram",
  },
  {
    id: "srv-rad-mri-brain",
    category: "XRAY",
    name: "MRI of Brain (Plain)",
    price: 6000,
    group: "IMAGING",
    description: "1.5T magnetic resonance imaging of brain",
  },
  {
    id: "srv-rad-mri-spine",
    category: "XRAY",
    name: "MRI of Whole Spine (Screening)",
    price: 16000,
    group: "IMAGING",
    description: "Cervical, thoracic, and lumbar spine MRI",
  },
  {
    id: "srv-rad-mri-body",
    category: "XRAY",
    name: "MRI of Whole Body (Screening)",
    price: 30000,
    group: "IMAGING",
    description: "Complete full-body oncological MRI screening",
  },
  {
    id: "srv-rad-mri-knee",
    category: "XRAY",
    name: "MRI of Knee Joint",
    price: 7000,
    group: "IMAGING",
    description: "High-resolution musculoskeletal knee MRI",
  },

  // --- 4. BEDS & INPATIENT CABINS (IPD) ---
  {
    id: "srv-bed-ward-male",
    category: "BED",
    name: "General Ward Bed Daily Tariff (Male)",
    price: 800,
    group: "BED_CABIN",
    description: "Standard inpatient ward accommodation",
  },
  {
    id: "srv-bed-ward-female",
    category: "BED",
    name: "General Ward Bed Daily Tariff (Female)",
    price: 800,
    group: "BED_CABIN",
    description: "Standard inpatient female ward accommodation",
  },
  {
    id: "srv-bed-postop",
    category: "BED",
    name: "Post-Operative Recovery Bed Daily Tariff",
    price: 1200,
    group: "BED_CABIN",
    description: "Dedicated step-down post-surgical recovery monitoring",
  },
  {
    id: "srv-bed-daycare",
    category: "BED",
    name: "Daycare Observation Bed (Short Stay Tariff)",
    price: 600,
    group: "BED_CABIN",
    description: "Up to 8 hours observation bed",
  },
  {
    id: "srv-cab-semi-nonac",
    category: "CABIN",
    name: "Semi-Cabin Bed Daily Tariff (Non-AC)",
    price: 1500,
    group: "BED_CABIN",
    description: "Two-patient shared semi-cabin",
  },
  {
    id: "srv-cab-semi-ac",
    category: "CABIN",
    name: "Semi-Cabin Bed Daily Tariff (AC)",
    price: 2000,
    group: "BED_CABIN",
    description: "Air-conditioned two-patient shared semi-cabin",
  },
  {
    id: "srv-cab-single-nonac",
    category: "CABIN",
    name: "Single Cabin Daily Tariff (Non-AC)",
    price: 2500,
    group: "BED_CABIN",
    description: "Private single room with attached bath and attendant bed",
  },
  {
    id: "srv-cab-single-ac",
    category: "CABIN",
    name: "Single Deluxe AC Cabin Daily Tariff",
    price: 3500,
    group: "BED_CABIN",
    description: "Air-conditioned private deluxe room with LED TV & refrigerator",
  },
  {
    id: "srv-cab-vip",
    category: "CABIN",
    name: "VIP Executive Suite Daily Tariff",
    price: 6000,
    group: "BED_CABIN",
    description: "Executive suite with patient room, private lounge, and kitchenette",
  },

  // --- 5. CRITICAL CARE (ICU, CCU, HDU, NICU) ---
  {
    id: "srv-cc-icu",
    category: "BED",
    name: "Intensive Care Unit (ICU) Daily Bed Tariff",
    price: 8000,
    group: "CRITICAL_CARE",
    description: "Multi-parameter monitoring, invasive ventilator facility, 1:1 nurse",
  },
  {
    id: "srv-cc-ccu",
    category: "BED",
    name: "Coronary Care Unit (CCU) Daily Bed Tariff",
    price: 7000,
    group: "CRITICAL_CARE",
    description: "Cardiac telemetry, defibrillator standby, cardiac monitoring",
  },
  {
    id: "srv-cc-hdu",
    category: "BED",
    name: "High Dependency Unit (HDU) Daily Bed Tariff",
    price: 4500,
    group: "CRITICAL_CARE",
    description: "Step-down close observation unit with continuous monitoring",
  },
  {
    id: "srv-cc-nicu",
    category: "BED",
    name: "Neonatal ICU (NICU) Daily Incubator Tariff",
    price: 6000,
    group: "CRITICAL_CARE",
    description: "Newborn phototherapy, radiant warmer, and micro-infusion care",
  },
  {
    id: "srv-cc-picu",
    category: "BED",
    name: "Pediatric ICU (PICU) Daily Bed Tariff",
    price: 6500,
    group: "CRITICAL_CARE",
    description: "Specialized pediatric critical care and resuscitation unit",
  },

  // --- 6. OPERATION THEATRE (OT) & SURGERY ---
  {
    id: "srv-ot-minor",
    category: "OT",
    name: "Minor OT Procedure / Suturing / Dressing",
    price: 800,
    group: "OT_SURGERY",
    description: "Excision, abscess drainage, minor wound debridement",
  },
  {
    id: "srv-ot-inter",
    category: "OT",
    name: "Intermediate Surgical Procedure Charge",
    price: 3500,
    group: "OT_SURGERY",
    description: "Herniorrhaphy, appendectomy, hydrocelectomy facility charge",
  },
  {
    id: "srv-ot-major",
    category: "OT",
    name: "Major Surgical Theatre Facility Charge",
    price: 6000,
    group: "OT_SURGERY",
    description: "Major open surgical procedure theatre equipment and sterilization",
  },
  {
    id: "srv-ot-lap",
    category: "OT",
    name: "Laparoscopic Surgery Theatre Facility Charge",
    price: 10000,
    group: "OT_SURGERY",
    description: "Laparoscopic tower, insufflator, harmonic scalpel facility charge",
  },
  {
    id: "srv-ot-ga",
    category: "OT",
    name: "General Anaesthesia Facility Charge",
    price: 3500,
    group: "OT_SURGERY",
    description: "Endotracheal intubation, vaporizer, anaesthetic machine gases",
  },
  {
    id: "srv-ot-sa",
    category: "OT",
    name: "Spinal / Epidural Anaesthesia Facility Charge",
    price: 2500,
    group: "OT_SURGERY",
    description: "Regional subarachnoid block facility and recovery supervision",
  },
  {
    id: "srv-ot-csec",
    category: "OT",
    name: "Caesarean Section (C-Section) OT Facility Package",
    price: 12000,
    group: "OT_SURGERY",
    description: "Surgical theatre, baby resuscitation, and maternal operative facility",
  },
  {
    id: "srv-ot-nvd",
    category: "OT",
    name: "Normal Vaginal Delivery (NVD) Labour Room Facility",
    price: 6000,
    group: "OT_SURGERY",
    description: "Labour room, episiotomy, fetal Doppler, and newborn initial care",
  },
  {
    id: "srv-ot-ortho-pop",
    category: "OT",
    name: "Orthopedic Closed Reduction & Plaster (POP)",
    price: 3000,
    group: "OT_SURGERY",
    description: "Fracture alignment and plaster of Paris immobilization",
  },

  // --- 7. EMERGENCY, AMBULANCE & NURSING FACILITIES ---
  {
    id: "srv-misc-triage",
    category: "MISC",
    name: "Emergency Casualty Triage & Intake Fee",
    price: 500,
    group: "EMERGENCY_NURSING",
    description: "Immediate resuscitation triage and vital assessment desk",
  },
  {
    id: "srv-misc-emerg-obs",
    category: "MISC",
    name: "Emergency Observation (Per 6 Hours)",
    price: 800,
    group: "EMERGENCY_NURSING",
    description: "Continuous casualty medical observation bed",
  },
  {
    id: "srv-misc-o2-hour",
    category: "MISC",
    name: "Oxygen Therapy (Per Hour)",
    price: 150,
    group: "EMERGENCY_NURSING",
    description: "Flowmeter nasal cannula / mask oxygen supply",
  },
  {
    id: "srv-misc-o2-day",
    category: "MISC",
    name: "Central Oxygen Supply (24 Hours Continuous)",
    price: 1200,
    group: "EMERGENCY_NURSING",
    description: "High-flow manifold central piped oxygen supply",
  },
  {
    id: "srv-misc-neb",
    category: "MISC",
    name: "Nebulization Session (Per Dose)",
    price: 150,
    group: "EMERGENCY_NURSING",
    description: "Ultrasonic/compressor bronchodilator aerosol therapy",
  },
  {
    id: "srv-misc-cardiac-mon",
    category: "MISC",
    name: "Continuous Cardiac Monitoring (Per 24 Hours)",
    price: 800,
    group: "EMERGENCY_NURSING",
    description: "Multi-parameter bed-side ECG, SpO2, NIBP monitor",
  },
  {
    id: "srv-misc-syringe-pump",
    category: "MISC",
    name: "Syringe / Infusion Pump Charge (Per 24 Hours)",
    price: 500,
    group: "EMERGENCY_NURSING",
    description: "Precision inotrope or micro-infusion delivery pump",
  },
  {
    id: "srv-misc-blood-trans",
    category: "MISC",
    name: "Blood Transfusion Service Charge (Per Bag)",
    price: 600,
    group: "EMERGENCY_NURSING",
    description: "Bed-side crosscheck, transfusion set, and reaction monitoring",
  },
  {
    id: "srv-misc-catheter",
    category: "MISC",
    name: "Catheterization Charge (Foley's Catheter Insertion)",
    price: 400,
    group: "EMERGENCY_NURSING",
    description: "Sterile urinary catheterization and urobag installation",
  },
  {
    id: "srv-misc-ng-tube",
    category: "MISC",
    name: "Nasogastric (NG) Tube Insertion",
    price: 400,
    group: "EMERGENCY_NURSING",
    description: "Enteral feeding or gastric decompression tube placement",
  },
  {
    id: "srv-misc-iv-can",
    category: "MISC",
    name: "IV Cannulation & Medication Infusion Setup",
    price: 200,
    group: "EMERGENCY_NURSING",
    description: "Intravenous cannula insertion and primary line priming",
  },
  {
    id: "srv-misc-dressing",
    category: "MISC",
    name: "Surgical Wound Dressing & Bandaging (Ward)",
    price: 300,
    group: "EMERGENCY_NURSING",
    description: "Aseptic surgical incision dressing and bandage renewal",
  },
  {
    id: "srv-amb-city",
    category: "AMBULANCE",
    name: "Hospital Ambulance Service (Within Bogura City)",
    price: 1200,
    group: "EMERGENCY_NURSING",
    description: "Standard patient transport ambulance with oxygen",
  },
  {
    id: "srv-amb-icu",
    category: "AMBULANCE",
    name: "Emergency ICU Ambulance Service (Life Support)",
    price: 3500,
    group: "EMERGENCY_NURSING",
    description: "Advanced life support ambulance with transport ventilator & paramedic",
  },
];

export function classifyServiceGroup(category: string, serviceName: string = ""): HospitalServiceItem["group"] {
  const cat = (category || "").toUpperCase().trim();
  const name = (serviceName || "").toLowerCase().trim();

  // 1. Bed & Cabin
  if (
    ["BED", "CABIN", "IPD_BED", "BED_CABIN", "WARD"].includes(cat) ||
    name.includes("cabin") ||
    name.includes("ward bed") ||
    name.includes("bed charge")
  ) {
    return "BED_CABIN";
  }

  // 2. Critical Care
  if (
    ["CRITICAL_CARE", "ICU", "CCU", "HDU", "NICU", "PICU"].includes(cat) ||
    name.includes("icu bed") ||
    name.includes("ccu bed") ||
    name.includes("hdu bed") ||
    name.includes("nicu bed") ||
    name.includes("coronary care unit") ||
    name.includes("intensive care unit") ||
    name.includes("high dependency unit") ||
    name.includes("neonatal intensive care")
  ) {
    return "CRITICAL_CARE";
  }

  // 3. Surgery & OT
  if (
    ["OT", "OT_SURGERY", "SURGERY", "OPERATION"].includes(cat) ||
    name.includes("operation theatre") ||
    name.includes("surgical procedure") ||
    name.includes("major surgical") ||
    name.includes("minor surgical") ||
    name.includes("minor ot") ||
    name.includes("major ot") ||
    name.includes("laparoscopic surgery") ||
    name.includes("caesarean section") ||
    name.includes("c-section") ||
    name.includes("anaesthesia") ||
    name.includes("orthopedic closed reduction") ||
    name.includes("normal vaginal delivery")
  ) {
    return "OT_SURGERY";
  }

  // 4. Consultation (ONLY genuine doctor visits and OPD consultations)
  if (
    (["CONSULTATION", "DOCTOR", "OPD_VISIT"].includes(cat) || name.includes("consultation")) &&
    !name.includes("investigation") &&
    !name.includes("test") &&
    !name.includes("scan") &&
    !name.includes("x-ray") &&
    !name.includes("usg") &&
    !name.includes("procedure")
  ) {
    return "CONSULTATION";
  }

  // 5. Imaging / Radiology (X-Ray, USG, ECG, Echo, CT Scan, MRI, Endoscopy, Colonoscopy)
  if (
    ["XRAY", "USG", "ECG", "CT_SCAN", "MRI", "ENDOSCOPY", "IMAGING", "RADIOLOGY"].includes(cat) ||
    name.includes("x-ray") ||
    name.includes("xray") ||
    name.includes("usg") ||
    name.includes("ultrasound") ||
    name.includes("ultrasono") ||
    name.includes("ecg") ||
    name.includes("echocardiog") ||
    name.includes("ct scan") ||
    name.includes("mri") ||
    name.includes("endoscopy") ||
    name.includes("colonoscopy")
  ) {
    return "IMAGING";
  }

  // 6. Emergency & Nursing & Admission
  if (
    ["EMERGENCY", "NURSING", "AMBULANCE", "ADMISSION", "EMERGENCY_NURSING"].includes(cat) ||
    name.includes("admission & registration") ||
    name.includes("ambulance") ||
    name.includes("dressing & bandaging") ||
    name.includes("emergency nursing")
  ) {
    return "EMERGENCY_NURSING";
  }

  // 7. Clinical procedures (nursing care / minor procedures)
  if (cat === "PROCEDURE") {
    if (
      name.includes("dressing") ||
      name.includes("cannula") ||
      name.includes("catheter") ||
      name.includes("nebulization") ||
      name.includes("suction") ||
      name.includes("injection administration")
    ) {
      return "EMERGENCY_NURSING";
    }
  }

  // 8. Default for all pathology/lab investigations
  return "LAB";
}

const OFFICIAL_RATE_CHART_SERVICE_ITEMS: HospitalServiceItem[] = OFFICIAL_DIAGNOSTIC_TESTS.map((t) => {
  let cat: ServiceCategory = "LAB";
  let grp: HospitalServiceItem["group"] = "LAB";
  if (t.category_code === "XRAY") {
    cat = "XRAY";
    grp = "IMAGING";
  } else if (t.category_code === "USG") {
    cat = "USG";
    grp = "IMAGING";
  } else if (
    t.test_code === "SPEC_ECG" ||
    t.test_name.toLowerCase().includes("electrocardiogram") ||
    t.test_name.toLowerCase().includes("echocardiography")
  ) {
    cat = "ECG";
    grp = "IMAGING";
  } else if (t.category_code === "CT_SCAN") {
    cat = "CT_SCAN";
    grp = "IMAGING";
  } else if (t.category_code === "MRI") {
    cat = "MRI";
    grp = "IMAGING";
  } else if (t.category_code === "SPECIAL_DIAG") {
    if (t.test_name.toLowerCase().includes("endoscopy") || t.test_name.toLowerCase().includes("colonoscopy")) {
      cat = "ENDOSCOPY";
    } else {
      cat = "MISC";
    }
    grp = "IMAGING";
  }

  return {
    id: `srv-diag-${t.test_code.toLowerCase().replace(/_/g, "-")}`,
    category: cat,
    name: t.test_name,
    price: t.price,
    group: grp,
    description: `${t.category_name} (${t.specimen_type !== "None" ? t.specimen_type : "Investigation"})`,
  };
});

const baseNames = new Set(BASE_HOSPITAL_SERVICES.map((s) => s.name.trim().toLowerCase()));
const extraOfficialItems = OFFICIAL_RATE_CHART_SERVICE_ITEMS.filter(
  (t) => !baseNames.has(t.name.trim().toLowerCase())
);

export const MASTER_HOSPITAL_SERVICES: HospitalServiceItem[] = [
  ...BASE_HOSPITAL_SERVICES,
  ...extraOfficialItems,
];

export interface DatabaseTariffInput {
  id?: string;
  service_code?: string;
  service_name: string;
  category: string;
  price: number;
  description?: string;
  is_active?: boolean;
}

/**
 * Combines built-in master hospital services with dynamic lab tests
 * and database tariffs, applying intelligent deduplication and classification.
 *
 * TARIFF AUTHORITY PRINCIPLE:
 * Authoritative Database Tariff > Verified Configuration > Safe Software Fallback.
 */
export function getAllHospitalServices(
  dynamicLabTests?: Array<{
    id: string;
    test_name: string;
    test_code?: string;
    price: number;
    category_name?: string;
  }>,
  databaseTariffs?: DatabaseTariffInput[]
): HospitalServiceItem[] {
  // Normalize key for deduplication
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s\-_]+/g, " ");

  const serviceMap = new Map<string, HospitalServiceItem>();

  for (const s of MASTER_HOSPITAL_SERVICES) {
    serviceMap.set(normalize(s.name), { ...s, isDatabaseAuthoritative: false });
  }

  const existingNames = new Set<string>(Array.from(serviceMap.keys()));

  // 1. Merge Database Dynamic Diagnostic Tests
  if (dynamicLabTests && dynamicLabTests.length > 0) {
    for (const t of dynamicLabTests) {
      const norm = normalize(t.test_name);
      const group = classifyServiceGroup(t.category_name || "LAB", t.test_name);
      const category: ServiceCategory = group === "IMAGING"
        ? (t.test_name.toLowerCase().includes("ct scan")
            ? "CT_SCAN"
            : t.test_name.toLowerCase().includes("mri")
            ? "MRI"
            : t.test_name.toLowerCase().includes("usg")
            ? "USG"
            : t.test_name.toLowerCase().includes("x-ray")
            ? "XRAY"
            : "MISC")
        : "LAB";

      if (existingNames.has(norm)) {
        const existing = serviceMap.get(norm)!;
        serviceMap.set(norm, {
          ...existing,
          price: Number(t.price) || existing.price,
          isDatabaseAuthoritative: true,
          description: t.category_name ? `${existing.description || ""} (DB: ${t.category_name})` : existing.description,
        });
      } else {
        existingNames.add(norm);
        serviceMap.set(norm, {
          id: `dyn-lab-${t.id}`,
          category,
          name: t.test_name,
          price: Number(t.price) || 0,
          group,
          description: t.category_name ? `${t.category_name} laboratory investigation` : "Diagnostic laboratory test",
          isDatabaseAuthoritative: true,
        });
      }
    }
  }

  // 2. Merge Database Authoritative Hospital Service Tariffs
  if (databaseTariffs && databaseTariffs.length > 0) {
    for (const t of databaseTariffs) {
      if (t.is_active === false) continue;
      const norm = normalize(t.service_name);
      const existing = serviceMap.get(norm);
      const group = classifyServiceGroup(t.category, t.service_name);
      const category = (t.category as ServiceCategory) || (group === "LAB" ? "LAB" : "MISC");

      if (existing) {
        serviceMap.set(norm, {
          ...existing,
          category,
          group,
          price: Number(t.price) || existing.price,
          isDatabaseAuthoritative: true,
          description: t.description || existing.description,
        });
      } else {
        serviceMap.set(norm, {
          id: `db-${t.service_code || t.id || norm}`,
          category,
          name: t.service_name,
          price: Number(t.price) || 0,
          group,
          description: t.description || undefined,
          isDatabaseAuthoritative: true,
        });
      }
    }
  }

  return Array.from(serviceMap.values());
}

/**
 * Maps extended catalog categories into the valid database CHECK constraint categories for invoice_items.
 */
export function toDbInvoiceCategory(
  cat: ServiceCategory | string
): "CONSULTATION" | "LAB" | "XRAY" | "USG" | "ECG" | "PHARMACY" | "BED" | "CABIN" | "OT" | "AMBULANCE" | "MISC" {
  switch (cat) {
    case "CONSULTATION":
      return "CONSULTATION";
    case "LAB":
      return "LAB";
    case "XRAY":
    case "CT_SCAN":
    case "MRI":
      return "XRAY";
    case "USG":
      return "USG";
    case "ECG":
      return "ECG";
    case "PHARMACY":
      return "PHARMACY";
    case "BED":
    case "IPD_BED":
    case "CRITICAL_CARE":
      return "BED";
    case "CABIN":
      return "CABIN";
    case "OT":
    case "OT_SURGERY":
      return "OT";
    case "AMBULANCE":
      return "AMBULANCE";
    default:
      return "MISC";
  }
}
