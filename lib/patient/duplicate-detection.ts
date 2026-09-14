import { createClient } from "@/lib/supabase/client";
import { normalizeBDPhone } from "./phone";
import { DuplicateCheckResult } from "@/types/clinical";

export interface DuplicateCheckInput {
  organizationId: string;
  fullName: string;
  phone: string;
  dob?: string;
  gender?: string;
  nid?: string;
  emergencyPhone?: string;
  excludePatientId?: string;
}

/**
 * Calculates string similarity using Dice's Coefficient (Bigram overlap).
 * Returns number between 0 (no similarity) and 1 (exact match).
 */
export function calculateNameSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const str2 = s2.toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  if (str1 === str2) return 1.0;
  if (str1.length < 2 || str2.length < 2) return 0;

  const getBigrams = (str: string) => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.substring(i, i + 2));
    }
    return s;
  };

  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);

  let intersection = 0;
  b1.forEach((bigram) => {
    if (b2.has(bigram)) intersection++;
  });

  return (2.0 * intersection) / (b1.size + b2.size);
}

/**
 * Server-side Multi-Signal Duplicate Detection Engine for Patients
 */
export async function detectDuplicatePatients(
  input: DuplicateCheckInput
): Promise<DuplicateCheckResult> {
  const normPhone = normalizeBDPhone(input.phone);
  const normEmergPhone = input.emergencyPhone ? normalizeBDPhone(input.emergencyPhone) : "";
  const normNid = input.nid ? input.nid.trim().replace(/[\s-]/g, "") : "";

  const reasons: string[] = [];
  const matchedPatients: DuplicateCheckResult["matchedPatients"] = [];

  try {
    const supabase = await createClient();

    // 1. Check Signal 1: Exact NID Match in patient_identifications
    if (normNid) {
      const { data: nidMatches } = await supabase
        .from("patient_identifications")
        .select("id_number, patient_id, patients!inner(id, patient_code, full_name, phone, gender, dob, organization_id)")
        .eq("id_number", normNid)
        .eq("patients.organization_id", input.organizationId);

      interface NidMatchRow {
        id_number: string;
        patient_id: string;
        patients: {
          id: string;
          patient_code: string;
          full_name: string;
          phone: string;
          gender: string;
          dob?: string;
          organization_id: string;
        };
      }

      if (nidMatches && nidMatches.length > 0) {
        (nidMatches as unknown as NidMatchRow[]).forEach((match) => {
          if (match.patients.id !== input.excludePatientId) {
            reasons.push(`Exact National ID (NID) match: ${match.id_number}`);
            matchedPatients.push({
              id: match.patients.id,
              patient_code: match.patients.patient_code,
              full_name: match.patients.full_name,
              phone: match.patients.phone,
              gender: match.patients.gender,
              dob: match.patients.dob,
              matchSignal: "HIGH: Exact NID",
            });
          }
        });
      }
    }

    // 2. Check Signal 2 & 3: Phone Match & Emergency Phone Match
    let phoneQuery = supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender, dob, organization_id")
      .eq("organization_id", input.organizationId)
      .eq("is_deleted", false);

    if (normPhone && normEmergPhone) {
      phoneQuery = phoneQuery.or(`phone.eq.${normPhone},phone.eq.${input.phone},emergency_contact_phone.eq.${normEmergPhone}`);
    } else if (normPhone) {
      phoneQuery = phoneQuery.or(`phone.eq.${normPhone},phone.eq.${input.phone}`);
    } else if (normEmergPhone) {
      phoneQuery = phoneQuery.eq("emergency_contact_phone", normEmergPhone);
    }

    const { data: phoneMatches } = await phoneQuery;

    if (phoneMatches && phoneMatches.length > 0) {
      interface PatientRow {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender: string;
        dob?: string;
        organization_id: string;
      }

      (phoneMatches as unknown as PatientRow[]).forEach((p) => {
        if (p.id !== input.excludePatientId) {
          const isSameDob = Boolean(input.dob && p.dob && input.dob === p.dob);
          const nameSim = calculateNameSimilarity(input.fullName, p.full_name);

          let signalLevel = "LOW: Phone Match";
          if (isSameDob) {
            signalLevel = "MEDIUM: Same Phone + Same Date of Birth";
            reasons.push(`Same phone number (${p.phone}) and exact Date of Birth (${p.dob})`);
          } else if (nameSim > 0.7) {
            signalLevel = "HIGH: Same Phone + High Name Similarity";
            reasons.push(`Same phone (${p.phone}) with matching patient name (${p.full_name})`);
          } else {
            reasons.push(`Shared mobile number: ${p.phone} (family or guardian sharing)`);
          }

          if (!matchedPatients.some((m) => m.id === p.id)) {
            matchedPatients.push({
              id: p.id,
              patient_code: p.patient_code,
              full_name: p.full_name,
              phone: p.phone,
              gender: p.gender,
              dob: p.dob,
              matchSignal: signalLevel,
            });
          }
        }
      });
    }

    // Determine Overall Confidence Level
    let confidence: DuplicateCheckResult["confidence"] = "NONE";
    if (matchedPatients.some((m) => m.matchSignal.startsWith("HIGH"))) {
      confidence = "HIGH";
    } else if (matchedPatients.some((m) => m.matchSignal.startsWith("MEDIUM"))) {
      confidence = "MEDIUM";
    } else if (matchedPatients.length > 0) {
      confidence = "LOW";
    }

    return {
      hasDuplicate: matchedPatients.length > 0,
      confidence,
      reasons: Array.from(new Set(reasons)),
      matchedPatients,
    };
  } catch (err) {
    console.error("Duplicate detection service exception:", err);
    return {
      hasDuplicate: false,
      confidence: "NONE",
      reasons: [],
      matchedPatients: [],
    };
  }
}

/**
 * Pure evaluation function for duplicate detection against a set of candidate records.
 * Can be tested deterministically in isolation.
 */
export function matchPatientRecords(
  input: { fullName: string; phone: string; nid?: string; dob?: string },
  existingRecords: Array<{
    id: string;
    full_name: string;
    phone: string;
    normalized_phone?: string;
    nid?: string;
    dob?: string;
  }>
): DuplicateCheckResult {
  const normPhone = normalizeBDPhone(input.phone);
  const normNid = input.nid ? input.nid.trim().replace(/[\s-]/g, "") : "";
  const reasons: string[] = [];
  const matchedPatients: DuplicateCheckResult["matchedPatients"] = [];

  for (const p of existingRecords) {
    // 1. NID Match
    if (normNid && p.nid) {
      const pNid = p.nid.trim().replace(/[\s-]/g, "");
      if (normNid === pNid) {
        reasons.push(`Exact National ID (NID) match: ${p.nid}`);
        matchedPatients.push({
          id: p.id,
          patient_code: "OH-EXISTING",
          full_name: p.full_name,
          phone: p.phone,
          matchSignal: "HIGH: Exact NID",
        });
        continue;
      }
    }

    // 2. Phone Match
    const pPhone = normalizeBDPhone(p.phone);
    if (normPhone && pPhone && normPhone === pPhone) {
      const isSameDob = Boolean(input.dob && p.dob && input.dob === p.dob);
      const nameSim = calculateNameSimilarity(input.fullName, p.full_name);

      let signalLevel = "LOW: Phone Match";
      if (isSameDob) {
        signalLevel = "MEDIUM: Same Phone + Same Date of Birth";
        reasons.push(`Same phone number (${p.phone}) and exact Date of Birth (${p.dob})`);
      } else if (nameSim > 0.7) {
        signalLevel = "HIGH: Same Phone + High Name Similarity";
        reasons.push(`Same phone (${p.phone}) with matching patient name (${p.full_name})`);
      } else {
        signalLevel = "MEDIUM: Shared Mobile Number";
        reasons.push(`Shared mobile number: ${p.phone} (family or guardian sharing)`);
      }

      matchedPatients.push({
        id: p.id,
        patient_code: "OH-EXISTING",
        full_name: p.full_name,
        phone: p.phone,
        matchSignal: signalLevel,
      });
    }
  }

  let confidence: DuplicateCheckResult["confidence"] = "NONE";
  if (matchedPatients.some((m) => m.matchSignal.startsWith("HIGH"))) {
    confidence = "HIGH";
  } else if (matchedPatients.some((m) => m.matchSignal.startsWith("MEDIUM"))) {
    confidence = "MEDIUM";
  } else if (matchedPatients.length > 0) {
    confidence = "LOW";
  }

  return {
    hasDuplicate: matchedPatients.length > 0,
    confidence,
    reasons: Array.from(new Set(reasons)),
    matchedPatients,
  };
}
