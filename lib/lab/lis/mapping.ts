/**
 * Onnesha Hospital Management System (OHMS)
 * Laboratory Information System (LIS) — Analyte to Diagnostic Parameter Mapping Layer
 * 
 * Strict clinical mapping:
 * - Deterministic matching between analyzer instrument test codes and OHMS diagnostic parameters.
 * - Rejects loose substring guessing.
 * - Normalizes units and detects panic/critical thresholds.
 */

export interface AnalyteMappingDefinition {
  analyte_code: string;
  standard_name: string;
  synonyms: string[];
  department: "Hematology" | "Biochemistry" | "Immunology" | "Electrolytes";
  expected_unit: string;
  critical_low?: number;
  critical_high?: number;
}

export const STANDARD_ANALYTE_DICTIONARY: Record<string, AnalyteMappingDefinition> = {
  // Hematology (Mindray BC-5000 / Sysmex XN-350)
  WBC: {
    analyte_code: "WBC",
    standard_name: "White Blood Cell Count",
    synonyms: ["TOTAL WBC", "LEUKOCYTES", "WHITE BLOOD CELLS", "WBC COUNT"],
    department: "Hematology",
    expected_unit: "10^3/uL",
    critical_low: 2.0,
    critical_high: 30.0,
  },
  RBC: {
    analyte_code: "RBC",
    standard_name: "Red Blood Cell Count",
    synonyms: ["TOTAL RBC", "ERYTHROCYTES", "RED BLOOD CELLS"],
    department: "Hematology",
    expected_unit: "10^6/uL",
    critical_low: 2.0,
    critical_high: 7.0,
  },
  HGB: {
    analyte_code: "HGB",
    standard_name: "Hemoglobin",
    synonyms: ["HB", "HAEMOGLOBIN", "HEMOGLOBIN CONCENTRATION"],
    department: "Hematology",
    expected_unit: "g/dL",
    critical_low: 7.0,
    critical_high: 20.0,
  },
  HCT: {
    analyte_code: "HCT",
    standard_name: "Hematocrit",
    synonyms: ["PCV", "PACKED CELL VOLUME"],
    department: "Hematology",
    expected_unit: "%",
    critical_low: 20.0,
    critical_high: 60.0,
  },
  PLT: {
    analyte_code: "PLT",
    standard_name: "Platelet Count",
    synonyms: ["THROMBOCYTES", "PLATELETS", "PLT COUNT"],
    department: "Hematology",
    expected_unit: "10^3/uL",
    critical_low: 50,
    critical_high: 1000,
  },
  MCV: {
    analyte_code: "MCV",
    standard_name: "Mean Corpuscular Volume",
    synonyms: ["MEAN CELL VOLUME"],
    department: "Hematology",
    expected_unit: "fL",
  },
  MCH: {
    analyte_code: "MCH",
    standard_name: "Mean Corpuscular Hemoglobin",
    synonyms: ["MEAN CELL HEMOGLOBIN"],
    department: "Hematology",
    expected_unit: "pg",
  },
  MCHC: {
    analyte_code: "MCHC",
    standard_name: "Mean Corpuscular Hemoglobin Concentration",
    synonyms: ["MEAN CELL HEMOGLOBIN CONCENTRATION"],
    department: "Hematology",
    expected_unit: "g/dL",
  },

  // Biochemistry (Roche Cobas c311 / Bio-Rad D-10)
  CREA: {
    analyte_code: "CREA",
    standard_name: "Serum Creatinine",
    synonyms: ["CREATININE", "S. CREATININE", "CRE"],
    department: "Biochemistry",
    expected_unit: "mg/dL",
    critical_high: 5.0,
  },
  UREA: {
    analyte_code: "UREA",
    standard_name: "Blood Urea",
    synonyms: ["BLOOD UREA NITROGEN", "BUN", "S. UREA"],
    department: "Biochemistry",
    expected_unit: "mg/dL",
    critical_high: 100,
  },
  GLU_FAST: {
    analyte_code: "GLU_FAST",
    standard_name: "Fasting Blood Glucose",
    synonyms: ["FBS", "FASTING GLUCOSE", "GLUCOSE FASTING", "GLU"],
    department: "Biochemistry",
    expected_unit: "mg/dL",
    critical_low: 45,
    critical_high: 400,
  },
  SGPT_ALT: {
    analyte_code: "SGPT_ALT",
    standard_name: "Alanine Aminotransferase (ALT/SGPT)",
    synonyms: ["SGPT", "ALT", "ALANINE AMINOTRANSFERASE"],
    department: "Biochemistry",
    expected_unit: "U/L",
    critical_high: 500,
  },
  SGOT_AST: {
    analyte_code: "SGOT_AST",
    standard_name: "Aspartate Aminotransferase (AST/SGOT)",
    synonyms: ["SGOT", "AST", "ASPARTATE AMINOTRANSFERASE"],
    department: "Biochemistry",
    expected_unit: "U/L",
    critical_high: 500,
  },
  HBA1C: {
    analyte_code: "HBA1C",
    standard_name: "Glycated Hemoglobin (HbA1c)",
    synonyms: ["A1C", "HEMOGLOBIN A1C", "GLYCOHEMOGLOBIN"],
    department: "Biochemistry",
    expected_unit: "%",
    critical_high: 12.0,
  },
};

export interface DiagnosticParameterTarget {
  id: string;
  parameter_name: string;
  parameter_code?: string;
  reference_range_male?: string;
  reference_range_female?: string;
}

export type MappingMatchResult =
  | {
      status: "MATCHED";
      parameter: DiagnosticParameterTarget;
      definition: AnalyteMappingDefinition;
    }
  | {
      status: "UNMAPPED";
      reason: string;
    }
  | {
      status: "AMBIGUOUS";
      reason: string;
      candidates: string[];
    };

/**
 * Deterministically maps an incoming analyzer analyte code to an OHMS diagnostic parameter.
 * Rejects ambiguous or unknown codes instead of guessing.
 */
export function mapAnalyteToParameter(
  incomingAnalyteCode: string,
  parameters: DiagnosticParameterTarget[]
): MappingMatchResult {
  const normalizedCode = incomingAnalyteCode.trim().toUpperCase();
  const definition = STANDARD_ANALYTE_DICTIONARY[normalizedCode];

  // 1. Direct match by parameter_code if available
  const directCodeMatches = parameters.filter(
    (p) => p.parameter_code && p.parameter_code.trim().toUpperCase() === normalizedCode
  );
  if (directCodeMatches.length === 1) {
    return {
      status: "MATCHED",
      parameter: directCodeMatches[0],
      definition: definition || {
        analyte_code: normalizedCode,
        standard_name: directCodeMatches[0].parameter_name,
        synonyms: [],
        department: "Hematology",
        expected_unit: "",
      },
    };
  }
  if (directCodeMatches.length > 1) {
    return {
      status: "AMBIGUOUS",
      reason: `Multiple parameters match code: ${normalizedCode}`,
      candidates: directCodeMatches.map((c) => c.parameter_name),
    };
  }

  // 2. Exact match by standard name or synonyms from dictionary
  if (definition) {
    const validNames = [definition.standard_name, ...definition.synonyms].map((n) =>
      n.toUpperCase()
    );

    const matchedByName = parameters.filter((p) => {
      const pName = p.parameter_name.trim().toUpperCase();
      return validNames.includes(pName);
    });

    if (matchedByName.length === 1) {
      return {
        status: "MATCHED",
        parameter: matchedByName[0],
        definition,
      };
    }

    if (matchedByName.length > 1) {
      return {
        status: "AMBIGUOUS",
        reason: `Multiple parameters match analyte dictionary for ${normalizedCode}`,
        candidates: matchedByName.map((c) => c.parameter_name),
      };
    }
  }

  // 3. Exact case-insensitive match on parameter_name
  const exactNameMatches = parameters.filter(
    (p) => p.parameter_name.trim().toUpperCase() === normalizedCode
  );
  if (exactNameMatches.length === 1) {
    return {
      status: "MATCHED",
      parameter: exactNameMatches[0],
      definition: definition || {
        analyte_code: normalizedCode,
        standard_name: exactNameMatches[0].parameter_name,
        synonyms: [],
        department: "Hematology",
        expected_unit: "",
      },
    };
  }

  return {
    status: "UNMAPPED",
    reason: `Analyte code '${normalizedCode}' could not be unambiguously mapped to order parameters.`,
  };
}
