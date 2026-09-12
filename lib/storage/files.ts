import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";

export const PRIVATE_STORAGE_BUCKET = "medical-documents-vault";

export interface SignedFileUrlResult {
  signedUrl: string | null;
  expiresIn: number;
  error?: string;
}

/**
 * Generates a short-lived (default 5 minutes / 300s) signed URL for private medical documents.
 * Strictly asserts organization context, user permission, and records audit trail.
 */
export async function getPrivateDocumentSignedUrl(params: {
  filePath: string;
  organizationId: string;
  patientId: string;
  actorUserId: string;
  purpose: "view" | "download" | "print";
  expiresInSeconds?: number;
}): Promise<SignedFileUrlResult> {
  // 1. Enforce medical records viewing permission
  await requirePermission("medical_records:view");

  // 2. Validate tenant boundary in the storage path (path convention: {organizationId}/{patientId}/{filename})
  if (!params.filePath.startsWith(`${params.organizationId}/`)) {
    throw new Error("403 Forbidden: Cross-tenant document access is strictly prohibited.");
  }

  const expiresIn = params.expiresInSeconds || 300; // 5 minutes standard lifetime

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .createSignedUrl(params.filePath, expiresIn);

    if (error || !data?.signedUrl) {
      return {
        signedUrl: null,
        expiresIn: 0,
        error: error?.message || "Failed to issue signed document access.",
      };
    }

    // 3. Log access audit event
    await recordAuditLog({
      userId: params.actorUserId,
      organizationId: params.organizationId,
      action: params.purpose === "download" ? "DOWNLOAD" : params.purpose === "print" ? "PRINT" : "VIEW",
      module: "DOCUMENT",
      entityType: "medical_document",
      entityId: params.filePath,
      newValues: {
        patient_id: params.patientId,
        expires_in_seconds: expiresIn,
      },
    });

    return {
      signedUrl: data.signedUrl,
      expiresIn,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Storage service exception.";
    return {
      signedUrl: null,
      expiresIn: 0,
      error: message,
    };
  }
}
