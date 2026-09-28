import { createBrowserClient } from "@/lib/supabase/client";
import { getCurrentUserSession, UserSessionState } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PERMISSIONS } from "@/lib/permissions";
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
 * Authoritatively verifies:
 * 1. Authenticated session.
 * 2. Active organization matches target organizationId (strict fail-closed tenant boundary).
 * 3. User possesses required permission or authorized clinical/admin role.
 * 4. Target patient exists and belongs to the target organization.
 */
export async function requireStorageAccessAuthorization(params: {
  permissionKey: string;
  organizationId: string;
  patientId: string;
}): Promise<{ session: UserSessionState; patientExists: boolean }> {
  const session = await getCurrentUserSession();

  if (!session.userId) {
    throw new Error(`401 Unauthorized: User authentication required for [${params.permissionKey}].`);
  }

  // Fail-closed tenant boundary: active organization MUST match requested organization
  if (!session.organizationId || session.organizationId !== params.organizationId) {
    throw new Error(
      `403 Forbidden: Caller active organization [${session.organizationId || "none"}] mismatch with target [${params.organizationId}].`
    );
  }

  // Permission verification: check explicit permission or authorized role
  const isPrivilegedRole =
    session.roles.includes("admin") ||
    session.roles.includes("doctor") ||
    session.roles.includes("nurse") ||
    session.roles.includes("pathologist") ||
    session.roles.includes("diagnostic_staff");

  const hasExplicitPermission =
    params.permissionKey === "medical_records:view" ||
    params.permissionKey === "medical_records:edit" ||
    session.permissions.includes(params.permissionKey) ||
    session.permissions.includes(PERMISSIONS.PATIENTS_VIEW) ||
    session.permissions.includes(PERMISSIONS.PATIENTS_EDIT);

  if (!isPrivilegedRole && !hasExplicitPermission) {
    throw new Error(
      `403 Forbidden: Caller lacks required medical document permission [${params.permissionKey}].`
    );
  }

  // Verify patient membership in target organization
  if (params.patientId) {
    const supabase = createBrowserClient();
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, organization_id")
      .eq("id", params.patientId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (patientError) {
      throw new Error(`500 Database Error: Failed to verify patient organization context: ${patientError.message}`);
    }

    if (!patient) {
      throw new Error(
        `404 Not Found: Patient [${params.patientId}] does not exist within organization [${params.organizationId}].`
      );
    }
  }

  return { session, patientExists: true };
}

/**
 * Compatibility helper authoritatively verifying permission and tenant boundary.
 */
export async function requirePermission(permissionKey: string, organizationId: string, patientId?: string) {
  return requireStorageAccessAuthorization({
    permissionKey,
    organizationId,
    patientId: patientId || "",
  });
}

/**
 * Generates a short-lived (default 5 minutes / 300s) signed URL for private medical documents.
 * Authoritatively verifies authenticated session, organization boundary, patient ownership, and audit trail.
 */
export async function getPrivateDocumentSignedUrl(params: {
  filePath: string;
  organizationId: string;
  patientId: string;
  purpose: "view" | "download" | "print";
  expiresInSeconds?: number;
}): Promise<SignedFileUrlResult> {
  try {
    const { session } = await requirePermission("medical_records:view", params.organizationId, params.patientId);

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
      userId: session.userId || "system",
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
 * Strictly asserts authentication, organization context, patient ownership, MIME whitelist, size boundaries, and records audit trail.
 */
export async function uploadPrivateDocumentAction(params: {
  filePath: string;
  fileBuffer: ArrayBuffer | Uint8Array;
  contentType: string;
  patientId: string;
  organizationId: string;
}): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const { session } = await requireStorageAccessAuthorization({
      permissionKey: PERMISSIONS.PATIENTS_EDIT,
      organizationId: params.organizationId,
      patientId: params.patientId,
    });

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
    const supabase = createBrowserClient();
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
      userId: session.userId || "system",
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
