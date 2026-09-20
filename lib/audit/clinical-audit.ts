import { recordAuditLog, AuditEntry } from "./logger";

export interface ClinicalAuditParam {
  organizationId: string;
  userId?: string;
  patientId: string;
  encounterId?: string;
  action: "PRESCRIPTION_MODIFY" | "DIAGNOSIS_OVERRIDE" | "TRIAGE_ESCALATE" | "CRITICAL_LAB_APPROVE" | "DISCHARGE_SIGNOFF";
  entityId: string;
  clinicalRationale: string;
  oldClinicalData?: Record<string, unknown>;
  newClinicalData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit utility for high-risk clinical operations (medication alterations, critical diagnosis overrides).
 * Enforces inclusion of clinicalRationale for medical-legal defensibility.
 */
export async function recordClinicalAudit(param: ClinicalAuditParam): Promise<void> {
  if (!param.clinicalRationale || param.clinicalRationale.trim().length < 5) {
    throw new Error("Medical-Legal Audit Failure: Clinical rationale is mandatory for high-risk interventions.");
  }

  const entry: AuditEntry = {
    organizationId: param.organizationId,
    userId: param.userId,
    action: "UPDATE",
    module: "CLINICAL",
    entityType: param.action,
    entityId: param.entityId,
    oldValues: {
      patient_id: param.patientId,
      encounter_id: param.encounterId,
      ...param.oldClinicalData,
    },
    newValues: {
      patient_id: param.patientId,
      encounter_id: param.encounterId,
      clinical_rationale: param.clinicalRationale,
      ...param.newClinicalData,
    },
    ipAddress: param.ipAddress,
    userAgent: param.userAgent,
  };

  await recordAuditLog(entry);
}
