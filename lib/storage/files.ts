import { createClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/server-session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  validateAndCanonicalizeStoragePath,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "./validation";

export const PRIVATE_STORAGE_BUCKET = "medical-documents-vault";

export {
  validateAndCanonicalizeStoragePath,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
};

export interface SignedFileUrlResult {
  signedUrl: string | null;
  expiresIn: number;
  error?: string;
}

/**
 * Generates a short-lived (default 5 minutes / 300s) signed URL for private medical documents.
 * Authoritatively verifies server session, organization boundary, user permission, and audit trail.
 */
export async function getPrivateDocumentSignedUrl(params: {
  filePath: string;
  organizationId: string;
  patientId: string;
  purpose: "view" | "download" | "print";
  expiresInSeconds?: number;
}): Promise<SignedFileUrlResult> {
  try {
    // 1. Enforce server-side authenticated permission & organization context
    const session = await requireServerPermission("medical_records:view", params.organizationId);

    // 2. Validate and canonicalize storage path (Cross-tenant document access is strictly prohibited)
    const pathCheck = validateAndCanonicalizeStoragePath(
      params.filePath,
      session.organizationId || params.organizationId,
      params.patientId
    );

    if (!pathCheck.valid || !pathCheck.canonicalPath) {
      throw new Error(pathCheck.error || "Invalid storage path.");
    }

    const canonicalPath = pathCheck.canonicalPath;
    const expiresIn = Math.min(Math.max(params.expiresInSeconds || 300, 60), 3600); // Between 60s and 3600s

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .createSignedUrl(canonicalPath, expiresIn);

    if (error || !data?.signedUrl) {
      return {
        signedUrl: null,
        expiresIn: 0,
        error: error?.message || "Failed to issue signed document access.",
      };
    }

    // 3. Log access audit event with server-derived actor identity
    await recordAuditLog({
      userId: session.userId || "system",
      organizationId: session.organizationId || params.organizationId,
      action: params.purpose === "download" ? "DOWNLOAD" : params.purpose === "print" ? "PRINT" : "VIEW",
      module: "DOCUMENT",
      entityType: "medical_document",
      entityId: canonicalPath,
      newValues: {
        patient_id: params.patientId,
        expires_in_seconds: expiresIn,
        actor_email: session.email,
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

/**
 * Uploads a private medical document into the tenant-isolated medical-documents-vault bucket.
 * Strictly asserts server organization context, MIME whitelist, size boundaries, and records audit trail.
 */
export async function uploadPrivateDocumentAction(params: {
  filePath: string;
  fileBuffer: ArrayBuffer | Uint8Array;
  contentType: string;
  patientId: string;
  organizationId: string;
}): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // 1. Enforce server-side authorization
    const session = await requireServerPermission("medical_records:view", params.organizationId);

    // 2. Validate MIME whitelist
    const normalizedMime = params.contentType.toLowerCase().trim();
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(normalizedMime)) {
      return {
        success: false,
        error: `400 Bad Request: Unsupported document MIME type [${params.contentType}]. Allowed: PDF, JPEG, PNG, DICOM.`,
      };
    }

    // 3. Validate file size boundary
    const byteLength = params.fileBuffer.byteLength;
    if (byteLength <= 0 || byteLength > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `400 Bad Request: Document file size (${byteLength} bytes) exceeds maximum allowable limit of 50MB.`,
      };
    }

    // 4. Validate and canonicalize storage path
    const pathCheck = validateAndCanonicalizeStoragePath(
      params.filePath,
      session.organizationId || params.organizationId,
      params.patientId
    );

    if (!pathCheck.valid || !pathCheck.canonicalPath) {
      return { success: false, error: pathCheck.error };
    }

    const canonicalPath = pathCheck.canonicalPath;

    // 5. Upload to isolated private vault
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .upload(canonicalPath, params.fileBuffer, {
        contentType: normalizedMime,
        upsert: false,
      });

    if (error || !data?.path) {
      return { success: false, error: error?.message || "Failed to upload medical document." };
    }

    // 6. Record forensic upload audit
    await recordAuditLog({
      userId: session.userId || "system",
      organizationId: session.organizationId || params.organizationId,
      action: "CREATE",
      module: "DOCUMENT",
      entityType: "medical_document",
      entityId: canonicalPath,
      newValues: {
        patient_id: params.patientId,
        content_type: normalizedMime,
        byte_size: byteLength,
      },
    });

    return { success: true, filePath: data.path };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Storage upload exception.";
    return { success: false, error: message };
  }
}
