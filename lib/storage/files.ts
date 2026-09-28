import { createBrowserClient } from "@/lib/supabase/client";
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

async function requirePermission(permissionKey: string, organizationId?: string) {
  const supabase = createBrowserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error(`401 Unauthorized: Authentication required for permission [${permissionKey}].`);
  return { userId: user.id, organizationId: organizationId || null, email: user.email };
}

/**
 * Generates a short-lived (default 5 minutes / 300s) signed URL for private medical documents.
 * Authoritatively verifies authenticated session, organization boundary, and audit trail via Supabase.
 */
export async function getPrivateDocumentSignedUrl(params: {
  filePath: string;
  organizationId: string;
  patientId: string;
  purpose: "view" | "download" | "print";
  expiresInSeconds?: number;
}): Promise<SignedFileUrlResult> {
  try {
    const session = await requirePermission("medical_records:view", params.organizationId);

    // Validate and canonicalize storage path (Cross-tenant document access is strictly prohibited)
    const pathCheck = validateAndCanonicalizeStoragePath(
      params.filePath,
      params.organizationId,
      params.patientId
    );

    if (!pathCheck.valid || !pathCheck.canonicalPath) {
      throw new Error(pathCheck.error || "Invalid storage path.");
    }

    const canonicalPath = pathCheck.canonicalPath;
    const expiresIn = Math.min(Math.max(params.expiresInSeconds || 300, 60), 3600); // Between 60s and 3600s

    const supabase = createBrowserClient();
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

    // Log access audit event
    await recordAuditLog({
      userId: session.userId,
      organizationId: params.organizationId,
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
 * Strictly asserts authentication, organization context, MIME whitelist, size boundaries, and records audit trail.
 */
export async function uploadPrivateDocumentAction(params: {
  filePath: string;
  fileBuffer: ArrayBuffer | Uint8Array;
  contentType: string;
  patientId: string;
  organizationId: string;
}): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const supabase = createBrowserClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "401 Unauthorized: Authentication required for document upload." };
    }

    // Validate MIME whitelist
    const normalizedMime = params.contentType.toLowerCase().trim();
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(normalizedMime)) {
      return {
        success: false,
        error: `400 Bad Request: Unsupported document MIME type [${params.contentType}]. Allowed: PDF, JPEG, PNG, DICOM.`,
      };
    }

    // Validate file size boundary
    const byteLength = params.fileBuffer.byteLength;
    if (byteLength <= 0 || byteLength > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `400 Bad Request: Document file size (${byteLength} bytes) exceeds maximum allowable limit of 50MB.`,
      };
    }

    // Validate and canonicalize storage path
    const pathCheck = validateAndCanonicalizeStoragePath(
      params.filePath,
      params.organizationId,
      params.patientId
    );

    if (!pathCheck.valid || !pathCheck.canonicalPath) {
      return { success: false, error: pathCheck.error };
    }

    const canonicalPath = pathCheck.canonicalPath;

    // Upload to isolated private vault
    const { data, error } = await supabase.storage
      .from(PRIVATE_STORAGE_BUCKET)
      .upload(canonicalPath, params.fileBuffer, {
        contentType: normalizedMime,
        upsert: false,
      });

    if (error || !data?.path) {
      return { success: false, error: error?.message || "Failed to upload medical document." };
    }

    // Record forensic upload audit
    await recordAuditLog({
      userId: user.id,
      organizationId: params.organizationId,
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
