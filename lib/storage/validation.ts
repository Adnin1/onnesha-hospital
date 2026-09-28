export const PRIVATE_STORAGE_BUCKET = "medical-documents-vault";
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB maximum

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/dicom",
]);

/**
 * Validates and canonicalizes a storage path against path traversal attacks,
 * malicious characters, and tenant/patient boundary leaks.
 *
 * Expected convention: {organization_id}/{patient_id}/{filename}
 */
export function validateAndCanonicalizeStoragePath(
  rawPath: string,
  expectedOrgId: string,
  expectedPatientId?: string
): { valid: boolean; canonicalPath?: string; error?: string } {
  if (!rawPath || typeof rawPath !== "string") {
    return { valid: false, error: "Path must be a non-empty string." };
  }

  // Reject path traversal and dangerous characters
  if (
    rawPath.includes("..") ||
    rawPath.includes("\\") ||
    rawPath.includes("\0") ||
    /%2e%2e/i.test(rawPath) ||
    /%2f/i.test(rawPath) ||
    /%5c/i.test(rawPath) ||
    rawPath.startsWith("/")
  ) {
    return { valid: false, error: "403 Forbidden: Illegal path traversal sequence detected." };
  }

  const parts = rawPath.split("/");
  if (parts.length !== 3) {
    return {
      valid: false,
      error: "400 Bad Request: Path must follow the exact structure: {organization_id}/{patient_id}/{filename}",
    };
  }

  const [pathOrgId, pathPatientId, filename] = parts;

  // Validate organization isolation
  if (pathOrgId !== expectedOrgId) {
    return { valid: false, error: "403 Forbidden: Cross-tenant storage path is strictly prohibited." };
  }

  // Validate patient isolation if specified
  if (expectedPatientId && pathPatientId !== expectedPatientId) {
    return { valid: false, error: "403 Forbidden: Document path does not match authorized patient." };
  }

  // Validate filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.startsWith(".")) {
    return { valid: false, error: "400 Bad Request: Invalid or hidden document filename." };
  }

  return { valid: true, canonicalPath: `${pathOrgId}/${pathPatientId}/${filename}` };
}
