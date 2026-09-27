import { createBrowserClient } from "../supabase/client";
import { UserProfile, RoleType } from "../../types/database";
import { normalizeRole } from "../utils";

export interface UserSessionState {
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
  organizationId: string | null;
  roles: RoleType[];
  permissions: string[];
  aalLevel: "aal1" | "aal2" | null;
  nextAalLevel: "aal1" | "aal2" | null;
  mfaFactorsCount: number;
}

const EMPTY_SESSION: UserSessionState = {
  userId: null,
  email: null,
  profile: null,
  organizationId: null,
  roles: [],
  permissions: [],
  aalLevel: null,
  nextAalLevel: null,
  mfaFactorsCount: 0,
};

/**
 * Retrieve the authenticated user's profile, active-organization roles,
 * permissions and MFA assurance level.
 *
 * Authorization is always scoped to the user's active organization. A role
 * granted in another organization must never elevate the current session.
 * If no active organization can be resolved, role/permission access fails closed.
 */
export async function getCurrentUserSession(): Promise<UserSessionState> {
  try {
    const supabase = createBrowserClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return EMPTY_SESSION;
    }

    let aalLevel: "aal1" | "aal2" | null = "aal1";
    let nextAalLevel: "aal1" | "aal2" | null = "aal1";
    let mfaFactorsCount = 0;

    try {
      const {
        data: aalData,
        error: aalErr,
      } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aalData && !aalErr) {
        aalLevel = aalData.currentLevel as "aal1" | "aal2";
        nextAalLevel = aalData.nextLevel as "aal1" | "aal2";
      } else {
        aalLevel = null;
        nextAalLevel = null;
      }

      const {
        data: factorData,
        error: factorErr,
      } = await supabase.auth.mfa.listFactors();

      if (factorData && factorData.all && !factorErr) {
        mfaFactorsCount = factorData.all.filter((f) => f.status === "verified").length;
      }
    } catch {
      aalLevel = null;
      nextAalLevel = null;
      mfaFactorsCount = 0;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return {
        userId: user.id,
        email: user.email || null,
        profile: null,
        organizationId: null,
        roles: [],
        permissions: [],
        aalLevel,
        nextAalLevel,
        mfaFactorsCount,
      };
    }

    // Active organization is authoritative for authorization scope.
    const organizationId =
      profile.active_organization_id || profile.organization_id || null;

    if (!organizationId || profile.is_active === false) {
      return {
        userId: user.id,
        email: user.email || null,
        profile,
        organizationId: null,
        roles: [],
        permissions: [],
        aalLevel,
        nextAalLevel,
        mfaFactorsCount,
      };
    }

    interface UserRoleRecord {
      role_id: string;
      organization_id: string;
      roles: { name: string } | null;
    }

    interface RolePermissionRecord {
      permission_key: string;
    }

    // IMPORTANT: Only roles belonging to the active organization are loaded.
    const { data: userRoleRecords, error: rolesError } = await supabase
      .from("user_roles")
      .select("role_id, organization_id, roles(name)")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId);

    if (rolesError) {
      // Fail closed on an authorization-data read failure.
      return {
        userId: user.id,
        email: user.email || null,
        profile,
        organizationId,
        roles: [],
        permissions: [],
        aalLevel,
        nextAalLevel,
        mfaFactorsCount,
      };
    }

    const normalizedRoles = new Set<RoleType>();

    for (const record of (userRoleRecords || []) as unknown as UserRoleRecord[]) {
      if (record.organization_id !== organizationId || !record.roles?.name) {
        continue;
      }

      const normalized = normalizeRole(record.roles.name);
      if (normalized) {
        normalizedRoles.add(normalized as RoleType);
      }
    }

    const roles = Array.from(normalizedRoles);
    const permissions = new Set<string>();

    const roleIds = (
      (userRoleRecords || []) as unknown as UserRoleRecord[]
    )
      .filter((record) => record.organization_id === organizationId)
      .map((record) => record.role_id)
      .filter(Boolean);

    if (roleIds.length > 0) {
      const { data: permRecords, error: permError } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .in("role_id", roleIds);

      if (!permError && permRecords) {
        for (const record of permRecords as unknown as RolePermissionRecord[]) {
          if (record.permission_key) {
            permissions.add(record.permission_key);
          }
        }
      }
    }

    return {
      userId: user.id,
      email: user.email || null,
      profile,
      organizationId,
      roles,
      permissions: Array.from(permissions),
      aalLevel,
      nextAalLevel,
      mfaFactorsCount,
    };
  } catch {
    return EMPTY_SESSION;
  }
}

/**
 * Check a permission against the active organization's authorization context.
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
  const session = await getCurrentUserSession();

  if (!session.userId || !session.organizationId || session.roles.length === 0) {
    return false;
  }

  if (session.roles.includes("super_admin") || session.roles.includes("hospital_administrator")) {
    return true;
  }

  return (
    session.permissions.includes("*") ||
    session.permissions.includes(permissionKey)
  );
}

/**
 * Assertion that throws or returns false if unauthorized.
 */
export async function requirePermission(permissionKey: string): Promise<void> {
  const permitted = await hasPermission(permissionKey);
  if (!permitted) {
    throw new Error(
      `403 Forbidden: Missing required permission [${permissionKey}]`
    );
  }
}

/**
 * Assertion requiring AAL2 assurance for high-risk operations.
 * Strictly FAIL CLOSED:
 * - Requires authenticated user
 * - Requires verified MFA factor count > 0
 * - Requires current AAL level === "aal2"
 */
export async function requireAAL2(): Promise<void> {
  const session = await getCurrentUserSession();

  if (!session.userId) {
    throw new Error("401 Unauthorized: Valid authenticated user session required.");
  }

  if (session.mfaFactorsCount <= 0) {
    throw new Error(
      "403 Forbidden: MFA factor registration required for high-risk action."
    );
  }

  if (session.aalLevel !== "aal2") {
    throw new Error(
      "401 Unauthorized: Verified AAL2 Multi-Factor Authentication session required for high-risk action."
    );
  }
}
